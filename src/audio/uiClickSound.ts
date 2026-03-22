import { getSharedAudioContext, unlockWebAudioFromUserGesture } from './webAudioContext'

/** Short UI tick for buttons (shared AudioContext; unlocks on first use). */
export function playUiClickSound(): void {
  try {
    unlockWebAudioFromUserGesture()
    const ctx = getSharedAudioContext()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(920, t)
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.042)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.085, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.065)
  } catch {
    /* ignore */
  }
}
