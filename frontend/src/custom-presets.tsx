import { useEffect, useState, type FormEvent } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { deleteCustomPreset, loadCustomPresets, saveCustomPreset } from './native'
import type { CustomPreset, PresetKey, Settings } from './types'

type ModalState =
  | { mode: 'save'; name: string }
  | { mode: 'rename'; preset: CustomPreset; name: string }
  | { mode: 'delete'; preset: CustomPreset }
  | null

type Props = {
  currentSettings: Settings
  builtinPreset: PresetKey | null
  onApply: (preset: CustomPreset) => void
  onNotice: (title: string, description?: string) => void
  onError: (message: string) => void
}

function makePresetId() {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function CustomPresetLibrary({ currentSettings, builtinPreset, onApply, onNotice, onError }: Props) {
  const [presets, setPresets] = useState<CustomPreset[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadCustomPresets()
      .then(setPresets)
      .catch((error) => onError(String(error)))
  }, [])

  useEffect(() => {
    if (builtinPreset !== null) setActiveId(null)
  }, [builtinPreset])

  function applyPreset(preset: CustomPreset) {
    setActiveId(preset.id)
    onApply(preset)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!modal || modal.mode === 'delete' || saving) return

    const name = modal.name.trim()
    if (!name) return

    setSaving(true)
    try {
      if (modal.mode === 'save') {
        const preset: CustomPreset = {
          id: makePresetId(),
          name,
          settings: { ...currentSettings },
        }
        const next = await saveCustomPreset(preset)
        setPresets(next)
        setActiveId(preset.id)
        onApply(preset)
        onNotice('Preset saved', preset.name)
      } else {
        const renamed: CustomPreset = { ...modal.preset, name }
        const next = await saveCustomPreset(renamed)
        setPresets(next)
        if (activeId === renamed.id) onApply(renamed)
        onNotice('Preset renamed', renamed.name)
      }
      setModal(null)
    } catch (error) {
      onError(String(error))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!modal || modal.mode !== 'delete' || saving) return
    setSaving(true)
    try {
      const next = await deleteCustomPreset(modal.preset.id)
      setPresets(next)
      if (activeId === modal.preset.id) setActiveId(null)
      onNotice('Preset deleted', modal.preset.name)
      setModal(null)
    } catch (error) {
      onError(String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="custom-preset-library">
      <div className="custom-preset-heading">
        <div>
          <span>MY PRESETS</span>
          <small>{presets.length.toString().padStart(2, '0')}</small>
        </div>
        <button type="button" className="save-preset-button" onClick={() => setModal({ mode: 'save', name: '' })}>
          <Plus size={13} /> Save preset
        </button>
      </div>

      {presets.length > 0 ? (
        <div className="custom-preset-grid">
          {presets.map((preset) => (
            <div key={preset.id} className={`custom-preset-card ${activeId === preset.id ? 'selected' : ''}`}>
              <button type="button" className="custom-preset-apply" onClick={() => applyPreset(preset)}>
                <div className="custom-preset-name">
                  <strong>{preset.name}</strong>
                  {activeId === preset.id && <Check size={13} />}
                </div>
                <span>{preset.settings.fps} FPS · CRF {preset.settings.crf} · {preset.settings.color_retention}% COLOR</span>
              </button>
              <div className="custom-preset-actions">
                <button type="button" title="Rename preset" onClick={() => setModal({ mode: 'rename', preset, name: preset.name })}>
                  <Pencil size={12} />
                </button>
                <button type="button" title="Delete preset" onClick={() => setModal({ mode: 'delete', preset })}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="custom-preset-empty">Save the current signal settings to reuse them later.</div>
      )}

      {modal && (
        <div className="preset-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !saving) setModal(null)
        }}>
          <div className="preset-modal" role="dialog" aria-modal="true" aria-label={modal.mode === 'delete' ? 'Delete preset' : modal.mode === 'rename' ? 'Rename preset' : 'Save preset'}>
            <div className="preset-modal-header">
              <div>
                <span>{modal.mode === 'delete' ? 'REMOVE PRESET' : modal.mode === 'rename' ? 'RENAME PRESET' : 'NEW PRESET'}</span>
                <strong>{modal.mode === 'delete' ? modal.preset.name : 'Character memory'}</strong>
              </div>
              <button type="button" className="preset-modal-close" disabled={saving} onClick={() => setModal(null)}><X size={15} /></button>
            </div>

            {modal.mode === 'delete' ? (
              <div className="preset-delete-copy">
                <p>This removes the saved preset from VideoDowngrade. Your built-in presets and video files stay untouched.</p>
                <div className="preset-modal-actions">
                  <button type="button" className="preset-secondary" disabled={saving} onClick={() => setModal(null)}>Cancel</button>
                  <button type="button" className="preset-primary" disabled={saving} onClick={() => void confirmDelete()}>{saving ? 'Deleting…' : 'Delete preset'}</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                <label className="preset-name-field">
                  <span>Preset name</span>
                  <input
                    autoFocus
                    maxLength={48}
                    value={modal.name}
                    onChange={(event) => setModal({ ...modal, name: event.target.value })}
                    placeholder="e.g. Broken VHS"
                  />
                </label>
                {modal.mode === 'save' && (
                  <div className="preset-setting-summary">
                    <span>{currentSettings.fps} FPS</span>
                    <span>CRF {currentSettings.crf}</span>
                    <span>{Math.round(currentSettings.downscale * 100)}% SCALE</span>
                    <span>{currentSettings.color_retention}% COLOR</span>
                  </div>
                )}
                <div className="preset-modal-actions">
                  <button type="button" className="preset-secondary" disabled={saving} onClick={() => setModal(null)}>Cancel</button>
                  <button type="submit" className="preset-primary" disabled={saving || !modal.name.trim()}>{saving ? 'Saving…' : modal.mode === 'rename' ? 'Rename' : 'Save preset'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
