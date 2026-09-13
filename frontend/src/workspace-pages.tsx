import { Check, RotateCcw, Trash2 } from 'lucide-react'
import { presets } from './presets'
import type { AppPreferences, HistoryEntry, PresetKey, Settings } from './types'

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

function formatDate(timestamp: number) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(timestamp))
  } catch {
    return new Date(timestamp).toLocaleString()
  }
}

export function HistoryView({
  entries,
  onUseSettings,
  onClear,
}: {
  entries: HistoryEntry[]
  onUseSettings: (settings: Settings) => void
  onClear: () => void
}) {
  return (
    <section className="workspace-page history-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">ARCHIVE / LOCAL 02</div>
          <h1>History.</h1>
        </div>
        <div className="page-counter">{entries.length.toString().padStart(2, '0')} EXPORTS</div>
      </header>

      <div className="page-panel history-panel">
        <div className="page-panel-bar">
          <span>RECENT PROCESSING</span>
          <button className="page-text-button" type="button" onClick={onClear} disabled={entries.length === 0}><Trash2 size={13} /> Clear history</button>
        </div>

        {entries.length === 0 ? (
          <div className="history-empty">
            <strong>No exports yet.</strong>
            <span>Completed processing jobs will appear here automatically.</span>
          </div>
        ) : (
          <div className="history-list">
            {entries.map((entry, index) => (
              <article className="history-row" key={entry.id}>
                <div className="history-index">{String(index + 1).padStart(2, '0')}</div>
                <div className="history-main">
                  <strong>{fileName(entry.output_path)}</strong>
                  <span>{fileName(entry.input_path)} → {fileName(entry.output_path)}</span>
                </div>
                <div className="history-specs">
                  <span>{entry.settings.fps} FPS</span>
                  <span>CRF {entry.settings.crf}</span>
                  <span>{Math.round(entry.settings.downscale * 100)}% SCALE</span>
                  <span>{entry.settings.color_retention}% COLOR</span>
                </div>
                <time>{formatDate(entry.created_at)}</time>
                <div className="history-actions">
                  <button type="button" onClick={() => onUseSettings(entry.settings)} title="Reuse settings"><RotateCcw size={13} /> Use settings</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" className={`settings-toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

export function SettingsView({
  preferences,
  historyCount,
  onChange,
  onClearHistory,
}: {
  preferences: AppPreferences
  historyCount: number
  onChange: (preferences: AppPreferences) => void
  onClearHistory: () => void
}) {
  const setDefaultPreset = (default_preset: PresetKey) => onChange({ ...preferences, default_preset })

  return (
    <section className="workspace-page settings-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">PREFERENCES / LOCAL 03</div>
          <h1>Settings.</h1>
        </div>
      </header>

      <div className="settings-grid">
        <section className="page-panel settings-panel">
          <div className="page-panel-bar"><span>BEHAVIOUR</span></div>
          <div className="setting-row">
            <div><strong>Show processed result</strong><span>Automatically switch the preview to AFTER when export finishes.</span></div>
            <Toggle checked={preferences.auto_preview_processed} onChange={(auto_preview_processed) => onChange({ ...preferences, auto_preview_processed })} />
          </div>
          <div className="setting-row">
            <div><strong>Interface motion</strong><span>Keep reveal, popup, hover and transition animations enabled.</span></div>
            <Toggle checked={preferences.motion_enabled} onChange={(motion_enabled) => onChange({ ...preferences, motion_enabled })} />
          </div>
        </section>

        <section className="page-panel settings-panel">
          <div className="page-panel-bar"><span>STARTUP CHARACTER</span></div>
          <div className="settings-preset-grid">
            {(Object.keys(presets) as PresetKey[]).map((key) => (
              <button type="button" key={key} className={`settings-preset ${preferences.default_preset === key ? 'selected' : ''}`} onClick={() => setDefaultPreset(key)}>
                <span>{presets[key].label}</span>
                <small>{presets[key].hint}</small>
                {preferences.default_preset === key && <Check size={14} />}
              </button>
            ))}
          </div>
          <p className="settings-note">Used the next time VideoDowngrade starts. It does not overwrite your current manual controls.</p>
        </section>

        <section className="page-panel settings-panel settings-storage">
          <div className="page-panel-bar"><span>LOCAL DATA</span></div>
          <div className="setting-row">
            <div><strong>Processing history</strong><span>{historyCount} saved {historyCount === 1 ? 'export' : 'exports'} in the local app configuration.</span></div>
            <button type="button" className="settings-action" onClick={onClearHistory} disabled={historyCount === 0}><Trash2 size={13} /> Clear</button>
          </div>
          <div className="storage-note">Preferences, custom presets and history stay on this computer.</div>
        </section>
      </div>
    </section>
  )
}
