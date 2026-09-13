import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import {
  AudioLines,
  Check,
  ChevronRight,
  CircleGauge,
  Film,
  FolderOpen,
  Github,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  UploadCloud,
  X,
} from 'lucide-react'
import { cancelProcessing, chooseOutput, chooseVideo, defaultOutputPath, probeVideo, startProcessing } from './native'
import { presets } from './presets'
import type { PresetKey, Settings, VideoInfo } from './types'

type ProcessStatus = 'idle' | 'probing' | 'processing' | 'completed' | 'failed' | 'cancelled'

type ProgressPayload = { progress: number }
type CompletePayload = { output_path: string }
type ErrorPayload = { message: string }

function bytes(value: number) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** i).toFixed(i > 1 ? 2 : 1)} ${units[i]}`
}

function duration(value: number) {
  if (!Number.isFinite(value)) return '0:00'
  const min = Math.floor(value / 60)
  const sec = Math.floor(value % 60).toString().padStart(2, '0')
  return `${min}:${sec}`
}

function App() {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [preset, setPreset] = useState<PresetKey>('messenger')
  const [settings, setSettings] = useState<Settings>({ ...presets.messenger.settings })
  const [status, setStatus] = useState<ProcessStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const busy = status === 'probing' || status === 'processing'
  const previewUrl = useMemo(() => inputPath ? convertFileSrc(inputPath) : null, [inputPath])
  const quality = useMemo(() => Math.round((1 - (settings.crf - 18) / 27) * 100), [settings.crf])

  useEffect(() => {
    const unlisteners: UnlistenFn[] = []
    let disposed = false

    async function connect() {
      const listeners = await Promise.all([
        listen<string>('processing-status', ({ payload }) => {
          if (payload === 'probing' || payload === 'processing') setStatus(payload)
        }),
        listen<ProgressPayload>('processing-progress', ({ payload }) => setProgress(payload.progress)),
        listen<CompletePayload>('processing-complete', ({ payload }) => {
          setOutputPath(payload.output_path)
          setProgress(100)
          setStatus('completed')
        }),
        listen<ErrorPayload>('processing-error', ({ payload }) => {
          setError(payload.message)
          setStatus('failed')
        }),
        listen('processing-cancelled', () => {
          setProgress(0)
          setStatus('cancelled')
        }),
        getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === 'enter' || event.payload.type === 'over') setDragging(true)
          if (event.payload.type === 'leave') setDragging(false)
          if (event.payload.type === 'drop') {
            setDragging(false)
            const path = event.payload.paths[0]
            if (path) void selectPath(path)
          }
        }),
      ])
      if (disposed) listeners.forEach((off) => off())
      else unlisteners.push(...listeners)
    }

    void connect()
    return () => {
      disposed = true
      unlisteners.forEach((off) => off())
    }
  }, [])

  function choosePreset(key: PresetKey) {
    setPreset(key)
    setSettings({ ...presets[key].settings })
  }

  async function selectPath(path: string) {
    if (busy) return
    setInputPath(path)
    setInfo(null)
    setOutputPath(null)
    setProgress(0)
    setStatus('idle')
    setError(null)
    try {
      setInfo(await probeVideo(path))
    } catch (e) {
      setInputPath(null)
      setError(String(e))
    }
  }

  async function browse() {
    const path = await chooseVideo()
    if (path) await selectPath(path)
  }

  async function start() {
    if (!inputPath || busy) return
    setError(null)
    const destination = await chooseOutput(defaultOutputPath(inputPath))
    if (!destination) return
    setOutputPath(destination)
    setProgress(0)
    setStatus('probing')
    try {
      await startProcessing(inputPath, destination, settings)
    } catch (e) {
      setStatus('failed')
      setError(String(e))
    }
  }

  async function cancel() {
    if (!busy) return
    try {
      await cancelProcessing()
    } catch (e) {
      setError(String(e))
    }
  }

  function clearFile() {
    if (busy) return
    setInputPath(null)
    setInfo(null)
    setOutputPath(null)
    setProgress(0)
    setStatus('idle')
    setError(null)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><Film size={19} strokeWidth={1.8} /></div>
        <nav className="side-nav" aria-label="Workspace">
          <button className="nav-icon active" title="Degrader"><Sparkles size={18} /></button>
          <button className="nav-icon" title="History" disabled><CircleGauge size={18} /></button>
          <button className="nav-icon" title="Settings" disabled><SlidersHorizontal size={18} /></button>
        </nav>
        <a className="nav-icon github" href="https://github.com/slyphmp4/VideoDowngrade" target="_blank" rel="noreferrer" title="GitHub"><Github size={18} /></a>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">VIDEO LAB / DESKTOP 01</div>
            <h1>Degrade video.</h1>
          </div>
          <div className="engine-badge"><span className="engine-dot" /> TAURI + RUST + FFMPEG</div>
        </header>

        <section className="stage-grid">
          <div className="left-column">
            <section
              className={`dropzone ${inputPath ? 'has-file' : ''} ${dragging ? 'dragging' : ''}`}
              onClick={() => !inputPath && void browse()}
            >
              {!inputPath ? (
                <div className="empty-drop">
                  <div className="upload-orb"><UploadCloud size={23} /></div>
                  <h2>Drop a video here</h2>
                  <p>native file access · nothing is uploaded anywhere</p>
                  <button className="ghost-button" onClick={(e) => { e.stopPropagation(); void browse() }}><FolderOpen size={16} /> Choose video</button>
                </div>
              ) : (
                <div className="file-card">
                  <div className="preview-surface">
                    <video src={previewUrl ?? undefined} controls preload="metadata" />
                    <div className="preview-grid" />
                  </div>
                  <div className="file-meta">
                    <div className="file-icon"><Film size={18} /></div>
                    <div className="file-copy">
                      <strong>{info?.filename ?? inputPath.split(/[\\/]/).pop()}</strong>
                      <span>
                        {info ? `${info.width}×${info.height} · ${duration(info.duration)} · ${bytes(info.file_size)} · ${info.has_audio ? 'audio' : 'silent'}` : 'reading media…'}
                      </span>
                    </div>
                    <button className="clear-button" disabled={busy} onClick={(e) => { e.stopPropagation(); clearFile() }} title="Remove"><X size={17} /></button>
                  </div>
                </div>
              )}
            </section>

            <section className="presets-panel">
              <div className="section-heading">
                <div><span>01</span><h3>Character</h3></div>
                <p>choose how the damage should feel</p>
              </div>
              <div className="preset-grid">
                {(Object.keys(presets) as PresetKey[]).map((key) => (
                  <button key={key} className={`preset-card ${preset === key ? 'selected' : ''}`} onClick={() => choosePreset(key)}>
                    <div className="preset-top"><span>{presets[key].label}</span>{preset === key && <Check size={15} />}</div>
                    <small>{presets[key].hint}</small>
                    <div className={`texture texture-${key}`} />
                  </button>
                ))}
              </div>
            </section>
          </div>

          <aside className="control-panel">
            <div className="control-header">
              <div><div className="eyebrow">MANUAL CONTROL</div><h2>Signal damage</h2></div>
              <button className="icon-text" onClick={() => choosePreset('messenger')}><RotateCcw size={14} /> reset</button>
            </div>

            <Control label="Frame rate" value={`${settings.fps} fps`}>
              <input type="range" min="20" max="25" value={settings.fps} onChange={(e) => setSettings({ ...settings, fps: +e.target.value })} />
            </Control>
            <Control label="Compression" value={`CRF ${settings.crf}`} note={`${quality}% signal`}>
              <input type="range" min="18" max="45" value={settings.crf} onChange={(e) => setSettings({ ...settings, crf: +e.target.value })} />
            </Control>
            <Control label="Internal scale" value={`${Math.round(settings.downscale * 100)}%`}>
              <input type="range" min="20" max="100" value={Math.round(settings.downscale * 100)} onChange={(e) => setSettings({ ...settings, downscale: +e.target.value / 100 })} />
            </Control>
            <Control label="Blur" value={settings.blur.toFixed(2)}>
              <input type="range" min="0" max="2" step="0.05" value={settings.blur} onChange={(e) => setSettings({ ...settings, blur: +e.target.value })} />
            </Control>

            <div className="divider" />
            <div className="mini-title"><AudioLines size={15} /> Audio damage</div>
            <div className="two-controls">
              <label className="select-control"><span>Bitrate</span><select value={settings.audio_bitrate} onChange={(e) => setSettings({ ...settings, audio_bitrate: +e.target.value })}>{[24, 32, 40, 48, 64, 96, 128].map(v => <option key={v} value={v}>{v} kbps</option>)}</select></label>
              <label className="select-control"><span>Sample rate</span><select value={settings.sample_rate} onChange={(e) => setSettings({ ...settings, sample_rate: +e.target.value })}>{[8000, 12000, 16000, 22050, 24000, 32000, 44100, 48000].map(v => <option key={v} value={v}>{v / 1000} kHz</option>)}</select></label>
            </div>
            <div className="two-controls">
              <label className="select-control"><span>Channels</span><select value={settings.channels} onChange={(e) => setSettings({ ...settings, channels: +e.target.value })}><option value="1">Mono</option><option value="2">Stereo</option></select></label>
              <label className="select-control"><span>Output</span><select value={settings.height} onChange={(e) => setSettings({ ...settings, height: +e.target.value })}><option value="0">Original</option>{[1080, 720, 480, 360, 240].map(v => <option key={v} value={v}>{v}p</option>)}</select></label>
            </div>

            <div className="job-area">
              {error && <div className="error-box">{error}</div>}
              {status !== 'idle' && (
                <div className="progress-card">
                  <div className="progress-line"><span>{status}</span><strong>{Math.round(progress)}%</strong></div>
                  <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
                  {status === 'completed' && outputPath && <div className="output-path">saved · {outputPath}</div>}
                </div>
              )}

              {busy ? (
                <button className="process-button cancel" onClick={() => void cancel()}><Square size={16} fill="currentColor" /> Stop processing</button>
              ) : (
                <button className={`process-button ${status === 'completed' ? 'done' : ''}`} disabled={!inputPath || !info} onClick={() => void start()}>
                  {status === 'completed' ? 'Process again' : 'Process video'} <ChevronRight size={17} />
                </button>
              )}
              <p className="privacy-note">100% local · native Rust core · bundled FFmpeg</p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

function Control({ label, value, note, children }: { label: string; value: string; note?: string; children: ReactNode }) {
  return (
    <div className="control">
      <div className="control-line"><span>{label}</span><div><strong>{value}</strong>{note && <small>{note}</small>}</div></div>
      {children}
    </div>
  )
}

export default App
