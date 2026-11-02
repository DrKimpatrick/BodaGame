import { getSharedAudioContext } from '../../audio/webAudioContext'
import { useSettingsStore } from '../../store/useSettingsStore'

/** Small synthesized cues (no audio files): police whistle, good-move chime, horn, siren. */

function ctx(): AudioContext | null {
  const s = useSettingsStore.getState()
  if (!s.sound || s.muted) return null
  try {
    const c = getSharedAudioContext()
    if (c.state === 'suspended') void c.resume()
    return c
  } catch {
    return null
  }
}

function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(c.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
  return o
}

/** Two sharp blasts of a traffic officer's whistle, with trill. */
export function playWhistle(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  for (const [start, dur] of [[0, 0.22], [0.3, 0.5]] as const) {
    const o = tone(c, 'sine', 2900, 2700, t + start, dur, 0.12)
    const lfo = c.createOscillator()
    const lg = c.createGain()
    lfo.frequency.value = 28
    lg.gain.value = 140
    lfo.connect(lg).connect(o.frequency)
    lfo.start(t + start)
    lfo.stop(t + start + dur)
  }
}

export function playChime(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'triangle', 880, 880, t, 0.18, 0.08)
  tone(c, 'triangle', 1320, 1320, t + 0.09, 0.28, 0.07)
}

export function playHorn(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'square', 420, 410, t, 0.32, 0.05)
  tone(c, 'square', 520, 505, t, 0.32, 0.04)
}

export function playCashRegister(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'sine', 1568, 1568, t, 0.12, 0.06)
  tone(c, 'sine', 2093, 2093, t + 0.07, 0.35, 0.06)
}

export function playThud(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'sine', 140, 40, t, 0.5, 0.2)
}
