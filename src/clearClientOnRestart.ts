import {
  SESSION_STORAGE_PROGRESS_KEY,
  useGameStore,
} from './store/useGameStore'

declare global {
  interface Window {
    /** Set before storage wipe so the UI can explain the fresh load. */
    __BODA_HAD_ACTIVE_SESSION__?: boolean
  }
}

function deleteAllCaches(): void {
  if (typeof caches === 'undefined') return
  void caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
}

function unregisterServiceWorkers(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) void r.unregister()
  })
}

/**
 * Run once at startup (from `main.tsx` before React): remember if the last tab had real progress,
 * then wipe session/local storage, Cache API, and service workers.
 */
export function runInitialClientCleanup(): void {
  if (typeof window === 'undefined') return

  let hadActiveSession = false
  try {
    hadActiveSession = sessionStorage.getItem(SESSION_STORAGE_PROGRESS_KEY) === '1'
  } catch {
    /* */
  }
  window.__BODA_HAD_ACTIVE_SESSION__ = hadActiveSession

  try {
    sessionStorage.clear()
  } catch {
    /* */
  }

  try {
    localStorage.clear()
  } catch {
    /* */
  }

  deleteAllCaches()
  unregisterServiceWorkers()
}

/**
 * In-game “nuclear” reset: Zustand defaults, wipe storage & caches, full reload (new Rapier world + HUD state).
 */
export function fullNuclearResetAndReload(): void {
  useGameStore.getState().resetSession()
  try {
    sessionStorage.clear()
  } catch {
    /* */
  }
  try {
    localStorage.clear()
  } catch {
    /* */
  }
  deleteAllCaches()
  unregisterServiceWorkers()
  window.location.reload()
}
