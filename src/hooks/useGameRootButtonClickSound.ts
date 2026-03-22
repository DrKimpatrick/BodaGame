import { useEffect } from 'react'
import { playUiClickSound } from '../audio/uiClickSound'

/**
 * Plays a light click on any real `<button>` under `[data-game-root]` (splash + HUD).
 * Capture phase runs before React handlers; skips disabled buttons.
 */
export function useGameRootButtonClickSound(): void {
  useEffect(() => {
    const root = document.querySelector('[data-game-root]')
    if (!root) return

    const onClickCapture: EventListener = (e) => {
      const el = e.target
      if (!(el instanceof Element)) return
      const btn = el.closest('button')
      if (!btn || !root.contains(btn)) return
      const b = btn as HTMLButtonElement
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') return
      playUiClickSound()
    }

    root.addEventListener('click', onClickCapture, true)
    return () => root.removeEventListener('click', onClickCapture, true)
  }, [])
}
