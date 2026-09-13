import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './button-overrides.css'
import './contrast-overrides.css'
import './interaction-polish.css'
import './comparison-preview.css'
import './custom-presets.css'

function installUiGuards() {
  const prevent = (event: Event) => event.preventDefault()

  document.addEventListener('contextmenu', prevent, { capture: true })
  document.addEventListener('copy', prevent, { capture: true })
  document.addEventListener('cut', prevent, { capture: true })
  document.addEventListener('selectstart', prevent, { capture: true })

  document.addEventListener('dragstart', (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('img, video, svg, a')) event.preventDefault()
  }, { capture: true })

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    const devToolsShortcut =
      event.key === 'F12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (event.ctrlKey && key === 'u')

    const copyShortcut = event.ctrlKey && ['c', 'x'].includes(key)

    if (devToolsShortcut || copyShortcut) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, { capture: true })
}

installUiGuards()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
