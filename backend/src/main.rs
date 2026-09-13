use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path as AxumPath, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use serde::{Deserialize, Serialize};
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
    sync::{RwLock, watch},
};
use tokio_util::io::ReaderStream;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    jobs: Arc<RwLock<HashMap<Uuid, Arc<JobEntry>>>>,
    data_dir: PathBuf,
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
}

struct JobEntry {
    view: RwLock<JobView>,
    cancel_tx: watch::Sender<bool>,
}

#[derive(Clone, Debug, Serialize)]
struct JobView {
    id: Uuid,
    filename: String,
    status: JobStatus,
    progress: f64,
    output_filename: Option<String>,
    error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum JobStatus {
    Queued,
    Probing,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Deserialize)]
struct Settings {
    fps: u32,
    height: u32,
    crf: u32,
    downscale: f64,
    blur: f64,
    audio_bitrate: u32,
    sample_rate: u32,
    channels: u32,
    highpass: u32,
    lowpass: u32,
}

#[derive(Clone, Debug, Deserialize)]
struct ProbeEnvelope {
    streams: Vec<ProbeStream>,
    format: ProbeFormat,
}

#[derive(Clone, Debug, Deserialize)]
struct ProbeStream {
    codec_type: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Clone, Debug, Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
}

#[derive(Clone, Debug)]
struct VideoInfo {
    width: u32,
    height: u32,
    duration: f64,
    has_audio: bool,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

type ApiResult<T> = Result<T, (StatusCode, Json<ErrorBody>)>;

#[tokio::main]
async fn main() {
    let data_dir = PathBuf::from("data/jobs");
    fs::create_dir_all(&data_dir).await.expect("create data directory");

    let ffmpeg = discover_binary("ffmpeg").await.expect("FFmpeg not found. Put it in backend/bin or PATH");
    let ffprobe = discover_binary("ffprobe").await.expect("FFprobe not found. Put it in backend/bin or PATH");
    let state = AppState {
        jobs: Arc::new(RwLock::new(HashMap::new())),
        data_dir,
        ffmpeg,
        ffprobe,
    };

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/jobs", post(create_job))
        .route("/api/jobs/{id}", get(get_job).delete(cancel_job))
        .route("/api/jobs/{id}/download", get(download_job))
        .layer(DefaultBodyLimit::max(12 * 1024 * 1024 * 1024usize))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8787").await.unwrap();
    println!("Degrader backend → http://127.0.0.1:8787");
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> &'static str { "ok" }

async fn create_job(State(state): State<AppState>, mut multipart: Multipart) -> ApiResult<(StatusCode, Json<JobView>)> {
    let id = Uuid::new_v4();
    let job_dir = state.data_dir.join(id.to_string());
    fs::create_dir_all(&job_dir).await.map_err(internal)?;

    let mut settings: Option<Settings> = None;
    let mut input_path: Option<PathBuf> = None;
    let mut original_name = String::from("input.mp4");

    while let Some(mut field) = multipart.next_field().await.map_err(bad_request)? {
        let field_name = field.name().map(str::to_owned);
        match field_name.as_deref() {
            Some("settings") => {
                let text = field.text().await.map_err(bad_request)?;
                settings = Some(serde_json::from_str(&text).map_err(bad_request)?);
            }
            Some("file") => {
                if let Some(name) = field.file_name() {
                    original_name = sanitize_filename(name);
                }
                let ext = Path::new(&original_name).extension().and_then(|s| s.to_str()).unwrap_or("mp4");
                let path = job_dir.join(format!("input.{ext}"));
                let mut target = fs::File::create(&path).await.map_err(internal)?;
                while let Some(chunk) = field.chunk().await.map_err(bad_request)? {
                    target.write_all(&chunk).await.map_err(internal)?;
                }
                target.flush().await.map_err(internal)?;
                input_path = Some(path);
            }
            _ => {}
        }
    }

    let settings = settings.ok_or_else(|| bad_request("missing settings"))?;
    validate_settings(&settings)?;
    let input_path = input_path.ok_or_else(|| bad_request("missing video file"))?;
    let output_path = job_dir.join("output.mp4");
    let (cancel_tx, cancel_rx) = watch::channel(false);

    let view = JobView {
        id,
        filename: original_name,
        status: JobStatus::Queued,
        progress: 0.0,
        output_filename: None,
        error: None,
    };
    let entry = Arc::new(JobEntry { view: RwLock::new(view.clone()), cancel_tx });
    state.jobs.write().await.insert(id, entry.clone());

    tokio::spawn(run_job(
        entry,
        input_path,
        output_path,
        settings,
        cancel_rx,
        state.ffmpeg.clone(),
        state.ffprobe.clone(),
    ));
    Ok((StatusCode::ACCEPTED, Json(view)))
}

async fn get_job(State(state): State<AppState>, AxumPath(id): AxumPath<Uuid>) -> ApiResult<Json<JobView>> {
    let entry = find_job(&state, id).await?;
    let view = entry.view.read().await.clone();
    Ok(Json(view))
}

async fn cancel_job(State(state): State<AppState>, AxumPath(id): AxumPath<Uuid>) -> ApiResult<StatusCode> {
    let entry = find_job(&state, id).await?;
    let _ = entry.cancel_tx.send(true);
    Ok(StatusCode::ACCEPTED)
}

async fn download_job(State(state): State<AppState>, AxumPath(id): AxumPath<Uuid>) -> ApiResult<Response> {
    let entry = find_job(&state, id).await?;
    let view = entry.view.read().await.clone();
    if !matches!(view.status, JobStatus::Completed) {
        return Err((StatusCode::CONFLICT, Json(ErrorBody { error: "job is not completed".into() })));
    }
    let path = state.data_dir.join(id.to_string()).join("output.mp4");
    let file = fs::File::open(path).await.map_err(internal)?;
    let stream = ReaderStream::new(file);
    let filename = view.output_filename.unwrap_or_else(|| "degraded.mp4".into());
    let mut response = Response::new(Body::from_stream(stream));
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("video/mp4"));
    let disposition = format!("attachment; filename=\"{}\"", sanitize_filename(&filename));
    response.headers_mut().insert(header::CONTENT_DISPOSITION, HeaderValue::from_str(&disposition).unwrap());
    Ok(response)
}

async fn run_job(
    entry: Arc<JobEntry>,
    input: PathBuf,
    output: PathBuf,
    settings: Settings,
    mut cancel_rx: watch::Receiver<bool>,
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
) {
    set_status(&entry, JobStatus::Probing, 0.0, None).await;
    let info = match probe_video(&ffprobe, &input).await {
        Ok(info) => info,
        Err(err) => { set_status(&entry, JobStatus::Failed, 0.0, Some(err)).await; return; }
    };

    if *cancel_rx.borrow() { set_status(&entry, JobStatus::Cancelled, 0.0, None).await; return; }
    set_status(&entry, JobStatus::Processing, 0.0, None).await;

    let args = build_ffmpeg_args(&input, &output, &settings, &info);
    let mut child = match Command::new(&ffmpeg)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => { set_status(&entry, JobStatus::Failed, 0.0, Some(err.to_string())).await; return; }
    };

    let stdout = child.stdout.take().unwrap();
    let mut lines = BufReader::new(stdout).lines();
    let duration_us = (info.duration * 1_000_000.0).max(1.0);

    loop {
        tokio::select! {
            changed = cancel_rx.changed() => {
                if changed.is_ok() && *cancel_rx.borrow() {
                    let _ = child.kill().await;
                    let _ = fs::remove_file(&output).await;
                    set_status(&entry, JobStatus::Cancelled, 0.0, None).await;
                    return;
                }
            }
            line = lines.next_line() => {
                match line {
                    Ok(Some(line)) if line.starts_with("out_time_us=") => {
                        if let Ok(now) = line.trim_start_matches("out_time_us=").parse::<f64>() {
                            let progress = (now * 100.0 / duration_us).clamp(0.0, 99.0);
                            update_progress(&entry, progress).await;
                        }
                    }
                    Ok(Some(line)) if line == "progress=end" => update_progress(&entry, 100.0).await,
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(err) => { set_status(&entry, JobStatus::Failed, 0.0, Some(err.to_string())).await; return; }
                }
            }
        }
    }

    match child.wait().await {
        Ok(status) if status.success() => {
            let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
            let name = format!("{stem}_degraded.mp4");
            let mut view = entry.view.write().await;
            view.status = JobStatus::Completed;
            view.progress = 100.0;
            view.output_filename = Some(name);
        }
        Ok(status) => set_status(&entry, JobStatus::Failed, 0.0, Some(format!("ffmpeg exited with {status}"))).await,
        Err(err) => set_status(&entry, JobStatus::Failed, 0.0, Some(err.to_string())).await,
    }
}

async fn probe_video(ffprobe: &Path, path: &Path) -> Result<VideoInfo, String> {
    let output = Command::new(ffprobe)
        .args(["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json"])
        .arg(path)
        .output().await.map_err(|e| e.to_string())?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).into_owned()); }
    let probe: ProbeEnvelope = serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    let video = probe.streams.iter().find(|s| s.codec_type.as_deref() == Some("video")).ok_or("no video stream")?;
    Ok(VideoInfo {
        width: video.width.unwrap_or(0),
        height: video.height.unwrap_or(0),
        duration: probe.format.duration.as_deref().unwrap_or("0").parse().unwrap_or(0.0),
        has_audio: probe.streams.iter().any(|s| s.codec_type.as_deref() == Some("audio")),
    })
}

fn build_ffmpeg_args(input: &Path, output: &Path, s: &Settings, info: &VideoInfo) -> Vec<String> {
    let (final_w, final_h) = target_size(info.width, info.height, s.height);
    let downscale = s.downscale.clamp(0.2, 1.0);
    let small_w = even((final_w as f64 * downscale).round() as u32);
    let small_h = even((final_h as f64 * downscale).round() as u32);
    let mut vf = vec![format!("fps={}", s.fps)];
    if small_w != final_w || small_h != final_h {
        vf.push(format!("scale={small_w}:{small_h}:flags=area"));
        if s.blur > 0.0 { vf.push(format!("gblur=sigma={:.2}", s.blur)); }
        vf.push(format!("scale={final_w}:{final_h}:flags=bicubic"));
    } else {
        if final_w != info.width || final_h != info.height { vf.push(format!("scale={final_w}:{final_h}:flags=lanczos")); }
        if s.blur > 0.0 { vf.push(format!("gblur=sigma={:.2}", s.blur)); }
    }

    let mut args = vec![
        "-y".into(), "-hide_banner".into(), "-loglevel".into(), "error".into(), "-i".into(), input.to_string_lossy().into_owned(),
        "-map_metadata".into(), "-1".into(), "-vf".into(), vf.join(","), "-c:v".into(), "libx264".into(), "-preset".into(), "medium".into(),
        "-crf".into(), s.crf.to_string(), "-pix_fmt".into(), "yuv420p".into(), "-movflags".into(), "+faststart".into(),
    ];
    if info.has_audio {
        let mut af = Vec::new();
        if s.highpass > 0 { af.push(format!("highpass=f={}", s.highpass)); }
        if s.lowpass > 0 { af.push(format!("lowpass=f={}", s.lowpass)); }
        if !af.is_empty() { args.extend(["-af".into(), af.join(",")]); }
        args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), format!("{}k", s.audio_bitrate), "-ar".into(), s.sample_rate.to_string(), "-ac".into(), s.channels.to_string()]);
    } else { args.push("-an".into()); }
    args.extend(["-progress".into(), "pipe:1".into(), "-nostats".into(), output.to_string_lossy().into_owned()]);
    args
}

fn target_size(src_w: u32, src_h: u32, requested_h: u32) -> (u32, u32) {
    if requested_h == 0 || requested_h >= src_h { return (even(src_w), even(src_h)); }
    let h = even(requested_h);
    let w = even(((src_w as f64 / src_h as f64) * h as f64).round() as u32);
    (w, h)
}

fn even(value: u32) -> u32 {
    let v = value.max(2);
    if v % 2 == 0 { v } else { v - 1 }
}

fn validate_settings(s: &Settings) -> ApiResult<()> {
    if !(20..=25).contains(&s.fps) { return Err(bad_request("fps must be between 20 and 25")); }
    if !(18..=45).contains(&s.crf) { return Err(bad_request("crf must be between 18 and 45")); }
    if !(0.2..=1.0).contains(&s.downscale) { return Err(bad_request("downscale must be between 0.2 and 1.0")); }
    if s.channels != 1 && s.channels != 2 { return Err(bad_request("channels must be 1 or 2")); }
    Ok(())
}

async fn find_job(state: &AppState, id: Uuid) -> ApiResult<Arc<JobEntry>> {
    state.jobs.read().await.get(&id).cloned().ok_or_else(|| (StatusCode::NOT_FOUND, Json(ErrorBody { error: "job not found".into() })))
}

async fn set_status(entry: &JobEntry, status: JobStatus, progress: f64, error: Option<String>) {
    let mut view = entry.view.write().await;
    view.status = status;
    view.progress = progress;
    view.error = error;
}

async fn update_progress(entry: &JobEntry, progress: f64) { entry.view.write().await.progress = progress; }

async fn discover_binary(name: &str) -> Result<PathBuf, String> {
    let exe = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    let bundled = PathBuf::from("bin").join(&exe);
    let candidates = [bundled, PathBuf::from(&exe), PathBuf::from(name)];
    for candidate in candidates {
        let status = Command::new(&candidate)
            .arg("-version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await;
        if matches!(status, Ok(s) if s.success()) {
            return Ok(candidate);
        }
    }
    Err(format!("{name} is not available"))
}

fn sanitize_filename(name: &str) -> String {
    let clean: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' }).collect();
    if clean.is_empty() { "video.mp4".into() } else { clean }
}

fn bad_request<E: std::fmt::Display>(err: E) -> (StatusCode, Json<ErrorBody>) {
    (StatusCode::BAD_REQUEST, Json(ErrorBody { error: err.to_string() }))
}
fn internal<E: std::fmt::Display>(err: E) -> (StatusCode, Json<ErrorBody>) {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorBody { error: err.to_string() }))
}
