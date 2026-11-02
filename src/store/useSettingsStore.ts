import { create } from 'zustand'

/**
 * Player preferences, kept on the device. Everything is optional comfort: the game works with defaults
 * if storage is blocked.
 */

export type Quality = 'low' | 'medium' | 'high'
export type CameraMode = 'chase' | 'helmet'

export type Settings = {
  quality: Quality
  camera: CameraMode
  /** 12 s decision timer on road encounter cards. */
  timer: boolean
  /** Soften child-loss outcomes (keeps money and jail stakes). */
  gentle: boolean
  /** Read cards and instructor lines aloud. */
  voice: boolean
  /** Engine, horn, crashes, clicks and other effects. */
  sound: boolean
  music: boolean
  /** Master mute: silences everything, whatever the two above say. */
  muted: boolean
  /** Live riding tips and the key reminder. */
  coach: boolean
}

type SettingsStore = Settings & {
  set: (patch: Partial<Settings>) => void
  cycleCamera: () => void
  toggleMute: () => void
}

const KEY = 'wow-settings-v1'

/** Phones and small tablets start on low; laptops with a decent GPU on high. */
export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'medium'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const small = Math.min(window.innerWidth, window.innerHeight) < 600
  const cores = navigator.hardwareConcurrency ?? 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  if ((coarse && small) || cores <= 4 || mem <= 3) return 'low'
  if (coarse) return 'medium'
  return 'high'
}

function load(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {}
  } catch {
    return {}
  }
}

const defaults: Settings = {
  quality: detectQuality(),
  camera: 'chase',
  timer: true,
  gentle: false,
  voice: false,
  sound: true,
  music: true,
  muted: false,
  coach: true,
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaults,
  ...load(),
  set: (patch) => set(patch),
  cycleCamera: () => set({ camera: get().camera === 'chase' ? 'helmet' : 'chase' }),
  toggleMute: () => set({ muted: !get().muted }),
}))

useSettingsStore.subscribe((s) => {
  try {
    const { quality, camera, timer, gentle, voice, sound, music, muted, coach } = s
    localStorage.setItem(KEY, JSON.stringify({ quality, camera, timer, gentle, voice, sound, music, muted, coach }))
  } catch {
    /* storage blocked */
  }
})
