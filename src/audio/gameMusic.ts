/**
 * Intro: Maurice Kirya — splash / loader.
 * Gameplay: Aylex — loops in-world.
 *
 * Browsers often block *audible* autoplay. We try unmuted first; if that fails, we start *muted*
 * (allowed) so playback begins immediately, then unmute on first pointer/key.
 */

import { unlockWebAudioFromUserGesture } from './webAudioContext'

const INTRO_SRC = encodeURI('/textures/Maurice-kirya-Boda-boda.mp3')
const GAMEPLAY_SRC = encodeURI('/textures/Aylex - Travelling (freetouse.com).mp3')

const INTRO_VOLUME = 0.44
const GAMEPLAY_VOLUME = 0.38

let introAudio: HTMLAudioElement | null = null
let gameplayAudio: HTMLAudioElement | null = null
let gameplayUnlockAttached = false
let introUnmuteListenersAttached = false

function attachIntroUnmuteOnFirstGesture(): void {
  if (introUnmuteListenersAttached || typeof window === 'undefined') return
  introUnmuteListenersAttached = true

  const unmuteIfNeeded = () => {
    const el =
      introAudio ??
      (typeof document !== 'undefined'
        ? (document.getElementById('boda-intro') as HTMLAudioElement | null)
        : null)
    if (!el) return
    if (!introAudio && el.id === 'boda-intro') introAudio = el
    if (!el.muted) return
    el.muted = false
    el.volume = INTRO_VOLUME
    void el.play().catch(() => {})
  }

  window.addEventListener('pointerdown', unmuteIfNeeded, { capture: true, passive: true })
  window.addEventListener('keydown', unmuteIfNeeded, { capture: true })
  window.addEventListener('touchstart', unmuteIfNeeded, { capture: true, passive: true })
}

function getIntro(): HTMLAudioElement {
  if (!introAudio) {
    if (typeof document !== 'undefined') {
      const fromDom = document.getElementById('boda-intro')
      if (fromDom instanceof HTMLAudioElement) {
        introAudio = fromDom
        introAudio.loop = false
        introAudio.preload = 'auto'
        introAudio.volume = INTRO_VOLUME
        try {
          ;(introAudio as HTMLAudioElement & { fetchPriority?: string }).fetchPriority = 'high'
        } catch {
          /* ignore */
        }
        return introAudio
      }
    }
    introAudio = new Audio(INTRO_SRC)
    introAudio.loop = false
    introAudio.preload = 'auto'
    introAudio.volume = INTRO_VOLUME
    introAudio.muted = false
    try {
      ;(introAudio as HTMLAudioElement & { fetchPriority?: string }).fetchPriority = 'high'
    } catch {
      /* ignore */
    }
  }
  return introAudio
}

function getGameplay(): HTMLAudioElement {
  if (!gameplayAudio) {
    gameplayAudio = new Audio(GAMEPLAY_SRC)
    gameplayAudio.loop = true
    gameplayAudio.preload = 'auto'
    gameplayAudio.volume = GAMEPLAY_VOLUME
  }
  return gameplayAudio
}

/**
 * First pointerdown anywhere on the splash (including Start) — play intro once.
 * Intro keeps running through loading until {@link startGameplayMusic}.
 */
export function playIntroFromUserGesture(introStartedRef: { current: boolean }): void {
  unlockWebAudioFromUserGesture()
  const el = getIntro()
  el.muted = false
  el.volume = INTRO_VOLUME

  if (!el.paused && !el.ended) {
    introStartedRef.current = true
    return
  }

  if (introStartedRef.current) return
  introStartedRef.current = true
  el.currentTime = 0
  void el.play().catch(() => {
    introStartedRef.current = false
  })
}

/** Ensure the intro element exists so the browser can buffer (never call `load()` here). */
export function warmIntroAudio(): void {
  void getIntro()
}

/**
 * Start intro as soon as possible: unmuted autoplay if allowed, else muted autoplay + unmute on
 * first gesture (playback timeline starts on load in both cases).
 */
export function trySplashIntroAutoplay(introStartedRef: { current: boolean }): void {
  const el = getIntro()

  if (!el.paused && !el.ended) {
    introStartedRef.current = true
    attachIntroUnmuteOnFirstGesture()
    return
  }

  if (el.ended) el.currentTime = 0

  const markStarted = () => {
    introStartedRef.current = true
    attachIntroUnmuteOnFirstGesture()
  }

  el.volume = INTRO_VOLUME
  el.muted = false

  const tryUnmuted = el.play()
  if (tryUnmuted === undefined) {
    markStarted()
    return
  }

  void tryUnmuted.then(markStarted).catch(() => {
    el.muted = true
    el.volume = INTRO_VOLUME
    const tryMuted = el.play()
    if (tryMuted === undefined) {
      markStarted()
      return
    }
    void tryMuted
      .then(markStarted)
      .catch(() => {
        attachIntroUnmuteOnFirstGesture()
      })
  })
}

export function stopIntroMusic(): void {
  if (!introAudio) return
  introAudio.pause()
  introAudio.currentTime = 0
  introAudio.muted = false
}

export function pauseIntroMusic(): void {
  introAudio?.pause()
}

export function resumeIntroMusicIfNeeded(): void {
  const el = introAudio
  if (!el || el.ended || el.paused === false) return
  void el.play().catch(() => {})
}

/**
 * Start click: unlock Web Audio, begin gameplay at **volume 0** (still playing).
 * Intro is **not** stopped here — it runs through the splash + loader until the world is ready.
 */
export function onGameStartButtonClicked(): void {
  unlockWebAudioFromUserGesture()
  const g = getGameplay()
  g.volume = 0
  g.currentTime = 0
  const p = g.play()
  if (p !== undefined) {
    void p.catch(() => {
      attachGameplayUnlockOnInteraction()
    })
  }
}

function attachGameplayUnlockOnInteraction(): void {
  if (gameplayUnlockAttached || typeof window === 'undefined') return
  gameplayUnlockAttached = true
  const tryPlay = () => {
    unlockWebAudioFromUserGesture()
    const g = getGameplay()
    void g
      .play()
      .then(() => undefined)
      .catch(() => undefined)
  }
  window.addEventListener('pointerdown', tryPlay, { once: true, passive: true })
  window.addEventListener('keydown', tryPlay, { once: true })
}

/** Rider is in the world — audible Travelling (track should already be playing at 0 volume). */
export function startGameplayMusic(): void {
  stopIntroMusic()
  const g = getGameplay()
  g.volume = GAMEPLAY_VOLUME
  if (g.paused) {
    void g.play().catch(() => {
      attachGameplayUnlockOnInteraction()
    })
  }
}

export function resumeGameplayMusicIfNeeded(): void {
  const el = gameplayAudio
  if (!el || el.paused === false) return
  el.volume = GAMEPLAY_VOLUME
  void el.play().catch(() => {
    attachGameplayUnlockOnInteraction()
  })
}

export function pauseGameplayMusic(): void {
  gameplayAudio?.pause()
}

export function pauseAllMusic(): void {
  pauseIntroMusic()
  pauseGameplayMusic()
}

export function setGameplayMusicVolume(linear01: number): void {
  const el = getGameplay()
  el.volume = Math.min(1, Math.max(0, linear01))
}

export function setIntroMusicVolume(linear01: number): void {
  const el = getIntro()
  el.volume = Math.min(1, Math.max(0, linear01))
}

export function disposeGameMusic(): void {
  if (introAudio) {
    introAudio.pause()
    if (introAudio.id !== 'boda-intro') {
      introAudio.src = ''
      introAudio.load()
    }
    introAudio = null
  }
  if (gameplayAudio) {
    gameplayAudio.pause()
    gameplayAudio.src = ''
    gameplayAudio.load()
    gameplayAudio = null
  }
  gameplayUnlockAttached = false
  introUnmuteListenersAttached = false
}

/** Start buffering intro MP3 as soon as this module loads (before React paint). */
if (typeof window !== 'undefined') {
  queueMicrotask(() => {
    try {
      void getIntro()
    } catch {
      /* ignore */
    }
  })
}
