use serde::{Deserialize, Serialize};
use std::{
    io::ErrorKind,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

#[derive(Default)]
struct ProcessState {
    child: Mutex<Option<CommandChild>>,
    cancelled: AtomicBool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Settings {
    fps: u32,
    height: u32,
    crf: u32,
    downscale: f64,
    blur: f64,
    color_retention: u32,
    audio_bitrate: u32,
    sample_rate: u32,
    channels: u32,
    highpass: u32,
    lowpass: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CustomPreset {
    id: String,
    name: String,
    settings: Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HistoryEntry {
    id: String,
    created_at: u64,
    input_path: String,
    output_path: String,
    settings: Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppPreferences {
    auto_preview_processed: bool,
    motion_enabled: bool,
    default_preset: String,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            auto_preview_processed: true,
            motion_enabled: true,
            default_preset: "messenger".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct VideoInfo {
    width: u32,
    height: u32,
    duration: f64,
    has_audio: bool,
    file_size: u64,
    filename: String,
}

#[derive(Debug, Clone, Serialize)]
struct ProgressPayload {
    progress: f64,
}

#[derive(Debug, Clone, Serialize)]
struct CompletePayload {
    output_path: String,
}

#[derive(Debug, Clone, Serialize)]
struct ErrorPayload {
    message: String,
}

#[derive(Debug, Deserialize)]
struct ProbeEnvelope {
    streams: Vec<ProbeStream>,
    format: ProbeFormat,
}

#[derive(Debug, Deserialize)]
struct ProbeStream {
    codec_type: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
}

#[tauri::command]
async fn probe_video(app: AppHandle, path: String) -> Result<VideoInfo, String> {
    probe(&app, Path::new(&path)).await
}

#[tauri::command]
fn load_custom_presets(app: AppHandle) -> Result<Vec<CustomPreset>, String> {
    read_custom_presets(&app)
}

#[tauri::command]
fn save_custom_preset(app: AppHandle, mut preset: CustomPreset) -> Result<Vec<CustomPreset>, String> {
    preset.id = preset.id.trim().to_string();
    preset.name = preset.name.trim().to_string();
    if preset.id.is_empty() || preset.id.len() > 96 { return Err("Invalid preset id".into()); }
    if preset.name.is_empty() { return Err("Preset name cannot be empty".into()); }
    if preset.name.chars().count() > 48 { return Err("Preset name can contain at most 48 characters".into()); }
    validate_settings(&preset.settings)?;
    let mut presets = read_custom_presets(&app)?;
    if presets.iter().any(|item| item.id != preset.id && item.name.eq_ignore_ascii_case(&preset.name)) {
        return Err("A preset with this name already exists".into());
    }
    if let Some(index) = presets.iter().position(|item| item.id == preset.id) { presets[index] = preset; } else { presets.push(preset); }
    write_custom_presets(&app, &presets)?;
    Ok(presets)
}

#[tauri::command]
fn delete_custom_preset(app: AppHandle, id: String) -> Result<Vec<CustomPreset>, String> {
    let mut presets = read_custom_presets(&app)?;
    presets.retain(|item| item.id != id);
    write_custom_presets(&app, &presets)?;
    Ok(presets)
}

#[tauri::command]
fn load_history(app: AppHandle) -> Result<Vec<HistoryEntry>, String> {
    read_history(&app)
}

#[tauri::command]
fn clear_history(app: AppHandle) -> Result<Vec<HistoryEntry>, String> {
    write_json_file(&app, "history.json", &Vec::<HistoryEntry>::new())?;
    Ok(Vec::new())
}

#[tauri::command]
fn load_preferences(app: AppHandle) -> Result<AppPreferences, String> {
    read_preferences(&app)
}

#[tauri::command]
fn save_preferences(app: AppHandle, preferences: AppPreferences) -> Result<AppPreferences, String> {
    validate_preferences(&preferences)?;
    write_json_file(&app, "preferences.json", &preferences)?;
    Ok(preferences)
}

#[tauri::command]
async fn start_processing(
    app: AppHandle,
    state: State<'_, ProcessState>,
    input_path: String,
    output_path: String,
    settings: Settings,
) -> Result<(), String> {
    validate_settings(&settings)?;

    let input = PathBuf::from(&input_path);
    let output = PathBuf::from(&output_path);
    if !input.is_file() {
        return Err("Input video does not exist".into());
    }
    if input == output {
        return Err("Output path must be different from the source video".into());
    }
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    {
        let current = state.child.lock().map_err(|_| "Process state lock failed")?;
        if current.is_some() {
            return Err("A video is already being processed".into());
        }
    }

    state.cancelled.store(false, Ordering::SeqCst);
    app.emit("processing-status", "probing").map_err(|e| e.to_string())?;
    let info = probe(&app, &input).await?;

    let args = build_ffmpeg_args(&input, &output, &settings, &info);
    let command = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Could not locate bundled FFmpeg: {e}"))?
        .args(args);

    let (mut rx, child) = command
        .spawn()
        .map_err(|e| format!("Could not start FFmpeg: {e}"))?;

    {
        let mut slot = state.child.lock().map_err(|_| "Process state lock failed")?;
        *slot = Some(child);
    }

    app.emit("processing-status", "processing").map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    let duration_us = (info.duration * 1_000_000.0).max(1.0);
    let output_for_task = output.clone();
    let input_for_history = input.clone();
    let settings_for_history = settings.clone();

    tauri::async_runtime::spawn(async move {
        let mut stderr_tail = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        if let Some(raw) = line.strip_prefix("out_time_us=") {
                            if let Ok(now) = raw.trim().parse::<f64>() {
                                let progress = (now * 100.0 / duration_us).clamp(0.0, 99.5);
                                let _ = app_handle.emit("processing-progress", ProgressPayload { progress });
                            }
                        } else if line.trim() == "progress=end" {
                            let _ = app_handle.emit("processing-progress", ProgressPayload { progress: 100.0 });
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let chunk = String::from_utf8_lossy(&bytes);
                    stderr_tail.push_str(&chunk);
                    stderr_tail.push('\n');
                    if stderr_tail.len() > 8000 {
                        let tail: String = stderr_tail.chars().rev().take(8000).collect();
                        stderr_tail = tail.chars().rev().collect();
                    }
                }
                CommandEvent::Error(message) => {
                    clear_child(&app_handle);
                    let _ = app_handle.emit("processing-error", ErrorPayload { message });
                    break;
                }
                CommandEvent::Terminated(payload) => {
                    clear_child(&app_handle);
                    let cancelled = app_handle
                        .state::<ProcessState>()
                        .cancelled
                        .load(Ordering::SeqCst);

                    if cancelled {
                        let _ = std::fs::remove_file(&output_for_task);
                        let _ = app_handle.emit("processing-cancelled", ());
                    } else if payload.code == Some(0) {
                        let _ = append_history(&app_handle, &input_for_history, &output_for_task, &settings_for_history);
                        let _ = app_handle.emit("processing-progress", ProgressPayload { progress: 100.0 });
                        let _ = app_handle.emit(
                            "processing-complete",
                            CompletePayload {
                                output_path: output_for_task.to_string_lossy().into_owned(),
                            },
                        );
                    } else {
                        let message = if stderr_tail.trim().is_empty() {
                            format!("FFmpeg exited with code {:?}", payload.code)
                        } else {
                            stderr_tail.trim().to_string()
                        };
                        let _ = app_handle.emit("processing-error", ErrorPayload { message });
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn cancel_processing(state: State<'_, ProcessState>) -> Result<(), String> {
    state.cancelled.store(true, Ordering::SeqCst);
    let child = state
        .child
        .lock()
        .map_err(|_| "Process state lock failed")?
        .take();
    if let Some(child) = child {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn clear_child(app: &AppHandle) {
    if let Ok(mut child) = app.state::<ProcessState>().child.lock() {
        let _ = child.take();
    }
}

fn config_file_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

fn read_json_file<T>(app: &AppHandle, name: &str) -> Result<Option<T>, String>
where
    T: for<'de> Deserialize<'de>,
{
    let path = config_file_path(app, name)?;
    match std::fs::read_to_string(&path) {
        Ok(content) if content.trim().is_empty() => Ok(None),
        Ok(content) => serde_json::from_str(&content).map(Some).map_err(|e| format!("Could not read {name}: {e}")),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not open {name}: {error}")),
    }
}

fn write_json_file<T: Serialize>(app: &AppHandle, name: &str, value: &T) -> Result<(), String> {
    let path = config_file_path(app, name)?;
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("Could not save {name}: {e}"))
}

fn read_custom_presets(app: &AppHandle) -> Result<Vec<CustomPreset>, String> {
    Ok(read_json_file(app, "presets.json")?.unwrap_or_default())
}

fn write_custom_presets(app: &AppHandle, presets: &[CustomPreset]) -> Result<(), String> {
    write_json_file(app, "presets.json", &presets)
}

fn read_history(app: &AppHandle) -> Result<Vec<HistoryEntry>, String> {
    Ok(read_json_file(app, "history.json")?.unwrap_or_default())
}

fn append_history(app: &AppHandle, input: &Path, output: &Path, settings: &Settings) -> Result<(), String> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as u64;
    let mut history = read_history(app)?;
    history.insert(0, HistoryEntry {
        id: format!("export-{now}"),
        created_at: now,
        input_path: input.to_string_lossy().into_owned(),
        output_path: output.to_string_lossy().into_owned(),
        settings: settings.clone(),
    });
    history.truncate(50);
    write_json_file(app, "history.json", &history)
}

fn read_preferences(app: &AppHandle) -> Result<AppPreferences, String> {
    let prefs = read_json_file(app, "preferences.json")?.unwrap_or_default();
    validate_preferences(&prefs)?;
    Ok(prefs)
}

fn validate_preferences(preferences: &AppPreferences) -> Result<(), String> {
    if !["slight", "messenger", "bad_phone", "destroyed"].contains(&preferences.default_preset.as_str()) {
        return Err("Unsupported default preset".into());
    }
    Ok(())
}

async fn probe(app: &AppHandle, path: &Path) -> Result<VideoInfo, String> {
    let output = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| format!("Could not locate bundled FFprobe: {e}"))?
        .args([
            "-v".to_string(),
            "error".to_string(),
            "-show_entries".to_string(),
            "format=duration:stream=codec_type,width,height".to_string(),
            "-of".to_string(),
            "json".to_string(),
            path.to_string_lossy().into_owned(),
        ])
        .output()
        .await
        .map_err(|e| format!("Could not run FFprobe: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let data: ProbeEnvelope = serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    let video = data
        .streams
        .iter()
        .find(|stream| stream.codec_type.as_deref() == Some("video"))
        .ok_or_else(|| "No video stream was found in this file".to_string())?;

    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    Ok(VideoInfo {
        width: video.width.unwrap_or(0),
        height: video.height.unwrap_or(0),
        duration: data
            .format
            .duration
            .as_deref()
            .unwrap_or("0")
            .parse()
            .unwrap_or(0.0),
        has_audio: data
            .streams
            .iter()
            .any(|stream| stream.codec_type.as_deref() == Some("audio")),
        file_size: metadata.len(),
        filename: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("video")
            .to_string(),
    })
}

fn validate_settings(settings: &Settings) -> Result<(), String> {
    if !(20..=25).contains(&settings.fps) {
        return Err("FPS must be between 20 and 25".into());
    }
    if !(18..=45).contains(&settings.crf) {
        return Err("CRF must be between 18 and 45".into());
    }
    if !(0.2..=1.0).contains(&settings.downscale) {
        return Err("Downscale must be between 0.20 and 1.00".into());
    }
    if !(0.0..=2.0).contains(&settings.blur) {
        return Err("Blur must be between 0.00 and 2.00".into());
    }
    if settings.color_retention > 100 {
        return Err("Color retention must be between 0 and 100".into());
    }
    if ![0, 240, 360, 480, 720, 1080].contains(&settings.height) {
        return Err("Unsupported output height".into());
    }
    if settings.channels != 1 && settings.channels != 2 {
        return Err("Audio channels must be mono or stereo".into());
    }
    Ok(())
}

fn build_ffmpeg_args(input: &Path, output: &Path, s: &Settings, info: &VideoInfo) -> Vec<String> {
    let (final_w, final_h) = target_size(info.width, info.height, s.height);
    let downscale = s.downscale.clamp(0.2, 1.0);
    let small_w = even((final_w as f64 * downscale).round() as u32);
    let small_h = even((final_h as f64 * downscale).round() as u32);

    let mut vf = vec![format!("fps={}", s.fps)];
    if small_w != final_w || small_h != final_h {
        vf.push(format!("scale={small_w}:{small_h}:flags=area"));
        if s.blur > 0.0 {
            vf.push(format!("gblur=sigma={:.2}", s.blur));
        }
        vf.push(format!("scale={final_w}:{final_h}:flags=bicubic"));
    } else {
        if final_w != info.width || final_h != info.height {
            vf.push(format!("scale={final_w}:{final_h}:flags=lanczos"));
        }
        if s.blur > 0.0 {
            vf.push(format!("gblur=sigma={:.2}", s.blur));
        }
    }

    if s.color_retention < 100 {
        let saturation = s.color_retention as f64 / 100.0;
        vf.push(format!("eq=saturation={saturation:.3}"));
    }

    let mut args = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        input.to_string_lossy().into_owned(),
        "-map_metadata".into(),
        "-1".into(),
        "-vf".into(),
        vf.join(","),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "medium".into(),
        "-crf".into(),
        s.crf.to_string(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-movflags".into(),
        "+faststart".into(),
    ];

    if info.has_audio {
        let mut audio_filters = Vec::new();
        if s.highpass > 0 {
            audio_filters.push(format!("highpass=f={}", s.highpass));
        }
        if s.lowpass > 0 {
            audio_filters.push(format!("lowpass=f={}", s.lowpass));
        }
        if !audio_filters.is_empty() {
            args.extend(["-af".into(), audio_filters.join(",")]);
        }
        args.extend([
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            format!("{}k", s.audio_bitrate),
            "-ar".into(),
            s.sample_rate.to_string(),
            "-ac".into(),
            s.channels.to_string(),
        ]);
    } else {
        args.push("-an".into());
    }

    args.extend([
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.to_string_lossy().into_owned(),
    ]);
    args
}

fn target_size(src_w: u32, src_h: u32, requested_h: u32) -> (u32, u32) {
    if src_w == 0 || src_h == 0 {
        return (1280, 720);
    }
    if requested_h == 0 || requested_h >= src_h {
        return (even(src_w), even(src_h));
    }
    let height = even(requested_h);
    let width = even(((src_w as f64 / src_h as f64) * height as f64).round() as u32);
    (width, height)
}

fn even(value: u32) -> u32 {
    let value = value.max(2);
    if value % 2 == 0 { value } else { value - 1 }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ProcessState::default())
        .invoke_handler(tauri::generate_handler![
            probe_video,
            load_custom_presets,
            save_custom_preset,
            delete_custom_preset,
            load_history,
            clear_history,
            load_preferences,
            save_preferences,
            start_processing,
            cancel_processing
        ])
        .run(tauri::generate_context!())
        .expect("error while running VideoDowngrade");
}
