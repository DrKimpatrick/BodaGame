/**
 * Looping background track (user-gesture primed — see {@link startGameMusicFromUserGesture}).
 */
const GAME_MUSIC_SRC = encodeURI('/textures/Aylex - Travelling (freetouse.com).mp3')

const DEFAULT_VOLUME = 0.38

let audio: HTMLAudioElement | null = null
let unlockHandlersAttached = false

function getOrCreateAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(GAME_MUSIC_SRC)
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = DEFAULT_VOLUME
  }
  return audio
}

function tryPlay(): Promise<void> {
  const el = getOrCreateAudio()
  return el.play().then(
    () => undefined,
    () => undefined,
  )
}

function attachUnlockOnInteraction(): void {
  if (unlockHandlersAttached || typeof window === 'undefined') return
  unlockHandlersAttached = true

  const unlock = () => {
    void tryPlay()
  }

  window.addEventListener('pointerdown', unlock, { once: true, passive: true })
  window.addEventListener('keydown', unlock, { once: true })
}

/**
 * Call from a click/tap handler so autoplay policies allow playback.
 * Music continues through the loading screen and gameplay.
 */
export function startGameMusicFromUserGesture(): void {
  void tryPlay().then(() => {
    /* ok */
  })
  attachUnlockOnInteraction()
}

/** Ensure music is running (e.g. after loading finishes or tab becomes visible). */
export function resumeGameMusicIfNeeded(): void {
  const el = audio
  if (!el || el.paused === false) return
  void tryPlay()
}

export function pauseGameMusic(): void {
  if (audio) {
    audio.pause()
  }
}

export function setGameMusicVolume(linear01: number): void {
  const el = getOrCreateAudio()
  el.volume = Math.min(1, Math.max(0, linear01))
}

export function disposeGameMusic(): void {
  if (audio) {
    audio.pause()
    audio.src = ''
    audio.load()
    audio = null
  }
  unlockHandlersAttached = false
}
