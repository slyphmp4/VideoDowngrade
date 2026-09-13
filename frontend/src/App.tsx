import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  Film,
  FolderOpen,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  UploadCloud,
  X,
} from 'lucide-react'
import { CustomPresetLibrary } from './custom-presets'
import { cancelProcessing, chooseOutput, chooseVideo, defaultOutputPath, probeVideo, startProcessing } from './native'
import { presets } from './presets'
import type { CustomPreset, PresetKey, Settings, VideoInfo } from './types'

type ProcessStatus = 'idle' | 'probing' | 'processing' | 'completed' | 'failed' | 'cancelled'
type ToastTone = 'success' | 'info'

type ProgressPayload = { progress: number }
type CompletePayload = { output_path: string }
type ErrorPayload = { message: string }
type ToastState = { tone: ToastTone; title: string; description?: string } | null
type PreviewMode = 'original' | 'processed'

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

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

function App() {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [preset, setPreset] = useState<PresetKey | null>('messenger')
  const [settings, setSettings] = useState<Settings>({ ...presets.messenger.settings })
  const [status, setStatus] = useState<ProcessStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('original')
  const [processedInfo, setProcessedInfo] = useState<VideoInfo | null>(null)

  const busy = status === 'probing' || status === 'processing'
  const originalPreviewUrl = useMemo(() => inputPath ? convertFileSrc(inputPath) : null, [inputPath])
  const processedPreviewUrl = useMemo(() => outputPath ? convertFileSrc(outputPath) : null, [outputPath])
  const previewUrl = previewMode === 'processed' && processedPreviewUrl ? processedPreviewUrl : originalPreviewUrl
  const previewInfo = previewMode === 'processed' ? processedInfo : info
  const previewPath = previewMode === 'processed' && outputPath ? outputPath : inputPath
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
          setPreviewMode('processed')
          setProcessedInfo(null)
          void probeVideo(payload.output_path).then(setProcessedInfo).catch(() => setProcessedInfo(null))
          setProgress(100)
          setStatus('completed')
          setToast({
            tone: 'success',
            title: 'Video saved successfully',
            description: fileName(payload.output_path),
          })
        }),
        listen<ErrorPayload>('processing-error', ({ payload }) => {
          setError(payload.message)
          setStatus('failed')
        }),
        listen('processing-cancelled', () => {
          setProgress(0)
          setStatus('cancelled')
          setToast({
            tone: 'info',
            title: 'Processing stopped',
            description: 'The current export was cancelled',
          })
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

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  function choosePreset(key: PresetKey) {
    setPreset(key)
    setSettings({ ...presets[key].settings })
  }

  function chooseCustomPreset(customPreset: CustomPreset) {
    setPreset(null)
    setSettings({ ...customPreset.settings })
  }

  async function selectPath(path: string) {
    if (busy) return
    setInputPath(path)
    setInfo(null)
    setOutputPath(null)
    setProcessedInfo(null)
    setPreviewMode('original')
    setProgress(0)
    setStatus('idle')
    setError(null)
    setToast(null)
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
    setToast(null)
    const destination = await chooseOutput(defaultOutputPath(inputPath))
    if (!destination) return
    setPreviewMode('original')
    setOutputPath(null)
    setProcessedInfo(null)
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
    setProcessedInfo(null)
    setPreviewMode('original')
    setProgress(0)
    setStatus('idle')
    setError(null)
    setToast(null)
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
        <a className="nav-icon github-link" href="https://github.com/slyphmp4/VideoDowngrade" target="_blank" rel="noreferrer" title="GitHub">GH</a>
      </aside>

      <main className="workspace">
        <div className="toast-layer" aria-live="polite" aria-atomic="true">
          {toast && (
            <div className={`toast-card ${toast.tone}`}>
              <div className="toast-indicator" />
              <div className="toast-copy">
                <strong>{toast.title}</strong>
                {toast.description && <span>{toast.description}</span>}
              </div>
              <button className="toast-close" onClick={() => setToast(null)} aria-label="Close message"><X size={14} /></button>
            </div>
          )}
        </div>

        <header className="topbar">
          <div>
            <div className="eyebrow">VIDEO LAB / DESKTOP 01</div>
            <h1>Degrade video.</h1>
          </div>
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
                    <div key={`${previewMode}:${previewUrl ?? 'empty'}`} className="preview-media-shell">
                      <video src={previewUrl ?? undefined} controls preload="metadata" />
                    </div>
                    <div className="preview-grid" />
                    {outputPath && (
                      <div className="compare-switch" role="group" aria-label="Compare original and processed video">
                        <button
                          type="button"
                          className={previewMode === 'original' ? 'active' : ''}
                          onClick={(e) => { e.stopPropagation(); setPreviewMode('original') }}
                        >
                          Original
                        </button>
                        <button
                          type="button"
                          className={previewMode === 'processed' ? 'active' : ''}
                          onClick={(e) => { e.stopPropagation(); setPreviewMode('processed') }}
                        >
                          Processed
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="file-meta">
                    <div className="file-icon"><Film size={18} /></div>
                    <div className="file-copy">
                      <strong>{previewInfo?.filename ?? (previewPath ? fileName(previewPath) : '')}</strong>
                      <span>
                        {previewInfo ? `${previewInfo.width}×${previewInfo.height} · ${duration(previewInfo.duration)} · ${bytes(previewInfo.file_size)} · ${previewInfo.has_audio ? 'audio' : 'silent'}` : previewMode === 'processed' ? 'reading processed media…' : 'reading media…'}
                      </span>
                    </div>
                    <div className="preview-state-label">{previewMode === 'processed' ? 'AFTER' : 'BEFORE'}</div>
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
              <CustomPresetLibrary
                currentSettings={settings}
                builtinPreset={preset}
                onApply={chooseCustomPreset}
                onNotice={(title, description) => setToast({ tone: 'success', title, description })}
                onError={(message) => setToast({ tone: 'info', title: 'Preset error', description: message })}
              />
            </section>
          </div>

          <aside className="control-panel">
            <div className="control-panel-scroll">
              <div className="control-header">
                <div><div className="eyebrow">MANUAL CONTROL</div><h2>Signal damage</h2></div>
                <button className="icon-text" onClick={() => choosePreset('messenger')}><RotateCcw size={14} /> reset</button>
              </div>

              <Control label="Frame rate" value={`${settings.fps} fps`}>
                <Slider min={20} max={25} value={settings.fps} onChange={(value) => setSettings({ ...settings, fps: value })} />
              </Control>
              <Control label="Compression" value={`CRF ${settings.crf}`} note={`${quality}% signal`}>
                <Slider min={18} max={45} value={settings.crf} onChange={(value) => setSettings({ ...settings, crf: value })} />
              </Control>
              <Control label="Internal scale" value={`${Math.round(settings.downscale * 100)}%`}>
                <Slider min={20} max={100} value={Math.round(settings.downscale * 100)} onChange={(value) => setSettings({ ...settings, downscale: value / 100 })} />
              </Control>
              <Control label="Blur" value={settings.blur.toFixed(2)}>
                <Slider min={0} max={2} step={0.05} value={settings.blur} onChange={(value) => setSettings({ ...settings, blur: value })} />
              </Control>
              <Control label="Color retention" value={`${settings.color_retention}%`} note={settings.color_retention === 0 ? 'monochrome' : settings.color_retention < 35 ? 'nearly lost' : undefined}>
                <Slider min={0} max={100} value={settings.color_retention} onChange={(value) => setSettings({ ...settings, color_retention: value })} />
              </Control>

              <div className="divider" />
              <div className="mini-title"><AudioLines size={15} /> Audio damage</div>
              <div className="two-controls">
                <SelectControl
                  label="Bitrate"
                  value={settings.audio_bitrate}
                  options={[24, 32, 40, 48, 64, 96, 128].map((v) => ({ value: v, label: `${v} kbps` }))}
                  onChange={(value) => setSettings({ ...settings, audio_bitrate: value })}
                />
                <SelectControl
                  label="Sample rate"
                  value={settings.sample_rate}
                  options={[8000, 12000, 16000, 22050, 24000, 32000, 44100, 48000].map((v) => ({ value: v, label: `${v / 1000} kHz` }))}
                  onChange={(value) => setSettings({ ...settings, sample_rate: value })}
                />
              </div>
              <div className="two-controls">
                <SelectControl
                  label="Channels"
                  value={settings.channels}
                  options={[{ value: 1, label: 'Mono' }, { value: 2, label: 'Stereo' }]}
                  onChange={(value) => setSettings({ ...settings, channels: value })}
                />
                <SelectControl
                  label="Output"
                  value={settings.height}
                  options={[{ value: 0, label: 'Original' }, ...[1080, 720, 480, 360, 240].map((v) => ({ value: v, label: `${v}p` }))]}
                  onChange={(value) => setSettings({ ...settings, height: value })}
                />
              </div>

              <div className="job-area">
                {error && <div className="error-box">{error}</div>}
                {status !== 'idle' && (
                  <div className="progress-card">
                    <div className="progress-line"><span>{status}</span><strong>{Math.round(progress)}%</strong></div>
                    <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
                    {status === 'completed' && outputPath && <div className="output-chip">ready · {fileName(outputPath)}</div>}
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

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: number
  options: Array<{ value: number; label: string }>
  onChange: (value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={`select-control custom-select ${open ? 'open' : ''}`} ref={rootRef}>
      <span>{label}</span>
      <button
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Slider({
  min,
  max,
  value,
  onChange,
  step = 1,
}: {
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  step?: number
}) {
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const progress = ((value - min) / (max - min)) * 100

  function clamp(next: number) {
    const stepped = Math.round(next / step) * step
    const bounded = Math.min(max, Math.max(min, stepped))
    return step < 1 ? Number(bounded.toFixed(2)) : bounded
  }

  function valueFromClientX(clientX: number) {
    const rect = sliderRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return value
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return clamp(min + ratio * (max - min))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    onChange(valueFromClientX(event.clientX))

    const move = (nextEvent: PointerEvent) => onChange(valueFromClientX(nextEvent.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(clamp(value - step))
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(clamp(value + step))
    }
    if (event.key === 'Home') {
      event.preventDefault()
      onChange(min)
    }
    if (event.key === 'End') {
      event.preventDefault()
      onChange(max)
    }
  }

  return (
    <div
      ref={sliderRef}
      className="app-slider"
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div className="app-slider-track" />
      <div className="app-slider-fill" style={{ width: `${progress}%` }} />
      <div className="app-slider-thumb" style={{ left: `${progress}%` }} />
    </div>
  )
}

export default App
