/**
 * Intro: Maurice Kirya — splash (tap outside Start).
 * Gameplay: Aylex — loops in-world; starts muted on Start click, un-mutes when `playing`.
 */

import { unlockWebAudioFromUserGesture } from './webAudioContext'

const INTRO_SRC = encodeURI('/textures/Maurice-kirya-Boda-boda.mp3')
const GAMEPLAY_SRC = encodeURI('/textures/Aylex - Travelling (freetouse.com).mp3')

const INTRO_VOLUME = 0.44
const GAMEPLAY_VOLUME = 0.38

let introAudio: HTMLAudioElement | null = null
let gameplayAudio: HTMLAudioElement | null = null
let gameplayUnlockAttached = false

function getIntro(): HTMLAudioElement {
  if (!introAudio) {
    introAudio = new Audio(INTRO_SRC)
    introAudio.loop = false
    introAudio.preload = 'auto'
    introAudio.volume = INTRO_VOLUME
    // Hint faster fetch when supported (Chromium).
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
 * Intro keeps running through loading until {@link startGameplayMusic} stops it.
 */
export function playIntroFromUserGesture(introStartedRef: { current: boolean }): void {
  unlockWebAudioFromUserGesture()
  if (introStartedRef.current) return
  introStartedRef.current = true
  const el = getIntro()
  el.currentTime = 0
  void el.play().catch(() => {
    introStartedRef.current = false
  })
}

/** Ensure the intro element exists so the browser can buffer (never call `load()` here — it resets the element and delays first playback). */
export function warmIntroAudio(): void {
  void getIntro()
}

/**
 * Try to start intro as soon as the app opens (and again after splash assets settle).
 * Keeps playing through the loading screen until {@link startGameplayMusic}.
 * On failure, {@link playIntroFromUserGesture} still runs on first pointerdown.
 */
export function trySplashIntroAutoplay(introStartedRef: { current: boolean }): void {
  const el = getIntro()
  if (!el.paused && !el.ended) {
    introStartedRef.current = true
    return
  }
  if (el.ended) el.currentTime = 0
  void el
    .play()
    .then(() => {
      introStartedRef.current = true
    })
    .catch(() => {
      /* policy blocked — wait for gesture */
    })
}

export function stopIntroMusic(): void {
  if (!introAudio) return
  introAudio.pause()
  introAudio.currentTime = 0
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
    introAudio.src = ''
    introAudio.load()
    introAudio = null
  }
  if (gameplayAudio) {
    gameplayAudio.pause()
    gameplayAudio.src = ''
    gameplayAudio.load()
    gameplayAudio = null
  }
  gameplayUnlockAttached = false
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
