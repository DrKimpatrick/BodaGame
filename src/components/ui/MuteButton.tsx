import { useSettingsStore } from '../../store/useSettingsStore'

/**
 * The one mute button, shown on every screen from the app root: above the menus, the loading screen, the ride and
 * every dialog. Same place everywhere; the ride HUD leaves its slot free and dialogs stop short of it.
 */
export function MuteButton() {
  const muted = useSettingsStore((s) => s.muted)
  const toggleMute = useSettingsStore((s) => s.toggleMute)
  const label = muted ? 'Unmute (M)' : 'Mute (M)'
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={muted}
      title={label}
      onClick={toggleMute}
      className={`fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex h-10 w-10 select-none items-center justify-center rounded-full text-base ring-1 backdrop-blur-md transition sm:h-12 sm:w-12 sm:text-xl ${
        muted ? 'bg-[#f5c518] text-zinc-950 ring-[#f5c518]' : 'bg-black/55 text-white ring-white/15 hover:bg-black/75'
      }`}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
