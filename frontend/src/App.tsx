import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownToLine,
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
import { cancelJob, createJob, getJob } from './api'
import { presets } from './presets'
import type { Job, PresetKey, Settings } from './types'

const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])

function bytes(value: number) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** i).toFixed(i > 1 ? 2 : 1)} ${units[i]}`
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [preset, setPreset] = useState<PresetKey>('messenger')
  const [settings, setSettings] = useState<Settings>({ ...presets.messenger.settings })
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const busy = Boolean(job && !terminalStatuses.has(job.status))
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file])
  const quality = useMemo(() => Math.round((1 - (settings.crf - 18) / 27) * 100), [settings.crf])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  useEffect(() => {
    if (!job || terminalStatuses.has(job.status)) return
    const timer = window.setInterval(async () => {
      try {
        const next = await getJob(job.id)
        setJob(next)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read job state')
      }
    }, 600)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  function choosePreset(key: PresetKey) {
    setPreset(key)
    setSettings({ ...presets[key].settings })
  }

  function selectFile(next: File | null) {
    if (!next) return
    setFile(next)
    setJob(null)
    setError(null)
  }

  async function start() {
    if (!file || busy) return
    setError(null)
    try {
      const created = await createJob(file, settings)
      setJob(created)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  async function cancel() {
    if (!job || !busy) return
    await cancelJob(job.id)
    setJob(await getJob(job.id))
  }

  const progress = job?.progress ?? 0

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><Film size={19} strokeWidth={1.8} /></div>
        <nav className="side-nav" aria-label="Workspace">
          <button className="nav-icon active" title="Degrader"><Sparkles size={18} /></button>
          <button className="nav-icon" title="History" disabled><CircleGauge size={18} /></button>
          <button className="nav-icon" title="Settings" disabled><SlidersHorizontal size={18} /></button>
        </nav>
        <a className="nav-icon github" href="https://github.com" target="_blank" rel="noreferrer" title="GitHub"><Github size={18} /></a>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">VIDEO LAB / 01</div>
            <h1>Degrade video.</h1>
          </div>
          <div className="engine-badge"><span className="engine-dot" /> RUST + FFMPEG</div>
        </header>

        <section className="stage-grid">
          <div className="left-column">
            <section
              className={`dropzone ${file ? 'has-file' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); selectFile(e.dataTransfer.files[0] ?? null) }}
              onClick={() => !file && inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept="video/*" hidden onChange={(e) => selectFile(e.target.files?.[0] ?? null)} />
              {!file ? (
                <div className="empty-drop">
                  <div className="upload-orb"><UploadCloud size={23} /></div>
                  <h2>Drop a video here</h2>
                  <p>or choose a file from your computer</p>
                  <button className="ghost-button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}><FolderOpen size={16} /> Choose video</button>
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
                      <strong>{file.name}</strong>
                      <span>{bytes(file.size)} · local source</span>
                    </div>
                    <button className="clear-button" onClick={(e) => { e.stopPropagation(); setFile(null); setJob(null) }} title="Remove"><X size={17} /></button>
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
              <label className="select-control"><span>Output</span><select value={settings.height} onChange={(e) => setSettings({ ...settings, height: +e.target.value })}>{[1080, 720, 480, 360, 240].map(v => <option key={v} value={v}>{v}p</option>)}</select></label>
            </div>

            <div className="job-area">
              {error && <div className="error-box">{error}</div>}
              {job && (
                <div className="progress-card">
                  <div className="progress-line"><span>{job.status}</span><strong>{Math.round(progress)}%</strong></div>
                  <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
                </div>
              )}

              {job?.status === 'completed' ? (
                <a className="process-button done" href={`/api/jobs/${job.id}/download`}><ArrowDownToLine size={18} /> Download result <ChevronRight size={17} /></a>
              ) : busy ? (
                <button className="process-button cancel" onClick={cancel}><Square size={16} fill="currentColor" /> Stop processing</button>
              ) : (
                <button className="process-button" disabled={!file} onClick={start}>Process video <ChevronRight size={17} /></button>
              )}
              <p className="privacy-note">Files stay on the machine running the Rust backend.</p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

function Control({ label, value, note, children }: { label: string; value: string; note?: string; children: ReactNode }) {
  return <div className="control"><div className="control-line"><span>{label}</span><div><strong>{value}</strong>{note && <small>{note}</small>}</div></div>{children}</div>
}

export default App
