import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './audio/gameMusic'
import './index.css'
import { useGameStore } from './store/useGameStore'
import App from './App.tsx'

/** Before any R3F/physics frame — `useLayoutEffect` in App still runs after first layout. */
useGameStore.getState().resetSession()

// Offline play after the first visit (production only; the dev server must not be cached).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// Dev-only test hook (stripped from production builds).
if (import.meta.env.DEV) {
  void Promise.all([
    import('./store/useRoadRulesStore'),
    import('./roadRules/world/telemetry'),
    import('./store/useSettingsStore'),
  ]).then(([rr, tel, settings]) => {
    Object.assign(window, {
      __wow: { game: useGameStore, rules: rr.useRoadRulesStore, telemetry: tel, settings: settings.useSettingsStore },
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
