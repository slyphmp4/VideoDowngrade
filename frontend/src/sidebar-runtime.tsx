import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { clearHistory, loadHistory, loadPreferences, savePreferences } from './native'
import { HistoryView, SettingsView } from './workspace-pages'
import { presets } from './presets'
import type { AppPreferences, HistoryEntry, Settings } from './types'

type WorkspaceView = 'degrader' | 'history' | 'settings'

const defaultPreferences: AppPreferences = {
  auto_preview_processed: true,
  motion_enabled: true,
  default_preset: 'messenger',
}

function clickSlider(slider: HTMLElement, target: number) {
  const min = Number(slider.getAttribute('aria-valuemin') ?? 0)
  const max = Number(slider.getAttribute('aria-valuemax') ?? 100)
  const step = max <= 2 ? 0.05 : 1
  slider.focus()
  slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  const count = Math.max(0, Math.round((target - min) / step))
  for (let i = 0; i < count; i += 1) {
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  }
}

function chooseSelect(label: string, optionText: string) {
  const controls = Array.from(document.querySelectorAll<HTMLElement>('.select-control'))
  const control = controls.find((item) => item.querySelector(':scope > span')?.textContent?.trim().toLowerCase() === label.toLowerCase())
  if (!control) return
  const trigger = control.querySelector<HTMLButtonElement>('.custom-select-trigger')
  if (!trigger) return
  trigger.click()
  requestAnimationFrame(() => {
    const option = Array.from(control.querySelectorAll<HTMLButtonElement>('.custom-select-option'))
      .find((item) => item.textContent?.trim().toLowerCase().startsWith(optionText.toLowerCase()))
    option?.click()
  })
}

function applySettings(settings: Settings) {
  const sliders = Array.from(document.querySelectorAll<HTMLElement>('.control-panel [role="slider"]'))
  const values = [settings.fps, settings.crf, Math.round(settings.downscale * 100), settings.blur, settings.color_retention]
  sliders.slice(0, values.length).forEach((slider, index) => clickSlider(slider, values[index]))

  window.setTimeout(() => chooseSelect('Bitrate', `${settings.audio_bitrate} kbps`), 40)
  window.setTimeout(() => chooseSelect('Sample rate', `${settings.sample_rate / 1000} kHz`), 110)
  window.setTimeout(() => chooseSelect('Channels', settings.channels === 1 ? 'Mono' : 'Stereo'), 180)
  window.setTimeout(() => chooseSelect('Output', settings.height === 0 ? 'Original' : `${settings.height}p`), 250)
}

function applyStartupPreset(preferences: AppPreferences) {
  const label = presets[preferences.default_preset].label.toLowerCase()
  const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('.preset-card'))
  cards.find((card) => card.textContent?.trim().toLowerCase().startsWith(label))?.click()
}

export function SidebarRuntime() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const viewRef = useRef<WorkspaceView>('degrader')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences)
  const preferencesRef = useRef(preferences)

  useEffect(() => {
    preferencesRef.current = preferences
    document.documentElement.classList.toggle('motion-disabled', !preferences.motion_enabled)
  }, [preferences])

  useEffect(() => {
    let disposed = false
    let unlisten: UnlistenFn | undefined
    let observer: MutationObserver | undefined
    const cleanups: Array<() => void> = []

    const mount = async () => {
      const workspace = document.querySelector<HTMLElement>('.workspace')
      const nav = document.querySelector<HTMLElement>('.side-nav')
      const buttons = nav ? Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-icon')) : []
      if (!workspace || buttons.length < 3) {
        window.setTimeout(() => void mount(), 50)
        return
      }
      if (disposed) return
      setHost(workspace)

      const renderNav = (nextView: WorkspaceView) => {
        workspace.classList.remove('view-degrader', 'view-history', 'view-settings')
        workspace.classList.add(`view-${nextView}`)
        buttons.slice(0, 3).forEach((button, index) => {
          button.disabled = false
          button.classList.toggle('active', index === (nextView === 'degrader' ? 0 : nextView === 'history' ? 1 : 2))
        })
      }

      const switchView = (nextView: WorkspaceView) => {
        viewRef.current = nextView
        renderNav(nextView)
      }

      const views: WorkspaceView[] = ['degrader', 'history', 'settings']
      buttons.slice(0, 3).forEach((button, index) => {
        const handler = (event: Event) => {
          event.preventDefault()
          event.stopPropagation()
          switchView(views[index])
        }
        button.addEventListener('click', handler, true)
        cleanups.push(() => button.removeEventListener('click', handler, true))
      })

      observer = new MutationObserver(() => renderNav(viewRef.current))
      observer.observe(nav!, { attributes: true, subtree: true, attributeFilter: ['disabled', 'class'] })
      renderNav('degrader')

      try {
        const [storedPreferences, storedHistory] = await Promise.all([loadPreferences(), loadHistory()])
        if (disposed) return
        preferencesRef.current = storedPreferences
        setPreferences(storedPreferences)
        setHistory(storedHistory)
        document.documentElement.classList.toggle('motion-disabled', !storedPreferences.motion_enabled)
        window.setTimeout(() => applyStartupPreset(storedPreferences), 60)
      } catch {
        // Keep defaults if the local config cannot be read.
      }

      unlisten = await listen('processing-complete', () => {
        void loadHistory().then(setHistory).catch(() => undefined)
        if (!preferencesRef.current.auto_preview_processed) {
          window.setTimeout(() => {
            const original = document.querySelector<HTMLButtonElement>('.compare-switch button:first-child')
            original?.click()
          }, 80)
        }
      })
    }

    void mount()
    return () => {
      disposed = true
      unlisten?.()
      observer?.disconnect()
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])

  async function updatePreferences(next: AppPreferences) {
    preferencesRef.current = next
    setPreferences(next)
    try {
      const stored = await savePreferences(next)
      preferencesRef.current = stored
      setPreferences(stored)
    } catch {
      // Keep the optimistic value in the UI; a later launch will fall back safely.
    }
  }

  async function clearStoredHistory() {
    try { setHistory(await clearHistory()) } catch { /* no-op */ }
  }

  function useHistorySettings(settings: Settings) {
    viewRef.current = 'degrader'
    const workspace = document.querySelector<HTMLElement>('.workspace')
    workspace?.classList.remove('view-history', 'view-settings')
    workspace?.classList.add('view-degrader')
    window.setTimeout(() => applySettings(settings), 40)
  }

  if (!host) return null

  return createPortal(
    <>
      <HistoryView entries={history} onUseSettings={useHistorySettings} onClear={() => void clearStoredHistory()} />
      <SettingsView preferences={preferences} historyCount={history.length} onChange={(next) => void updatePreferences(next)} onClearHistory={() => void clearStoredHistory()} />
    </>,
    host,
  )
}
