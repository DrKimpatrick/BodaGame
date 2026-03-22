/**
 * Haptics, screen shake, and synthetic impact SFX when the bike hits a walker or is struck by traffic.
 * Invoked from the game store (not React effects) so StrictMode does not double-play.
 */

export type ImpactKind = 'pedestrian' | 'vehicle' | 'restricted'

const GAME_ROOT = '[data-game-root]'

let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!sharedCtx) sharedCtx = new AudioContext()
  return sharedCtx
}

function pulseHaptic(kind: ImpactKind) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return
  }
  try {
    if (kind === 'vehicle') {
      navigator.vibrate([90, 35, 110, 40, 95, 30, 70])
    } else if (kind === 'restricted') {
      navigator.vibrate([16, 12, 22])
    } else {
      navigator.vibrate([38, 22, 48])
    }
  } catch {
    /* blocked or unsupported */
  }
}

function shakeGameRoot(kind: ImpactKind) {
  if (typeof document === 'undefined') return
  const el = document.querySelector(GAME_ROOT)
  if (!el) return
  const strong = kind === 'vehicle'
  const soft = kind === 'restricted'
  el.classList.remove('impact-shake', 'impact-shake-strong')
  void el.getBoundingClientRect()
  el.classList.add(strong ? 'impact-shake-strong' : 'impact-shake')
  window.setTimeout(() => {
    el.classList.remove('impact-shake', 'impact-shake-strong')
  }, strong ? 480 : soft ? 240 : 320)
}

function playPedThud(ctx: AudioContext) {
  const t = ctx.currentTime
  const dur = 0.14
  const nSamples = Math.floor(ctx.sampleRate * dur)
  const buffer = ctx.createBuffer(1, nSamples, ctx.sampleRate)
  const ch = buffer.getChannelData(0)
  for (let i = 0; i < nSamples; i++) ch[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 380
  bp.Q.value = 0.85
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.22, t)
  g.gain.exponentialRampToValueAtTime(0.008, t + 0.11)
  src.connect(bp)
  bp.connect(g)
  g.connect(ctx.destination)
  src.start(t)
  src.stop(t + dur + 0.02)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(128, t)
  osc.frequency.exponentialRampToValueAtTime(72, t + 0.16)
  const og = ctx.createGain()
  og.gain.setValueAtTime(0, t)
  og.gain.linearRampToValueAtTime(0.28, t + 0.012)
  og.gain.exponentialRampToValueAtTime(0.008, t + 0.2)
  osc.connect(og)
  og.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.22)
}

function playVehicleKnock(ctx: AudioContext) {
  const t = ctx.currentTime
  const dur = 0.34
  const nSamples = Math.floor(ctx.sampleRate * dur)
  const buffer = ctx.createBuffer(1, nSamples, ctx.sampleRate)
  const ch = buffer.getChannelData(0)
  for (let i = 0; i < nSamples; i++) ch[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.setValueAtTime(1400, t)
  low.frequency.exponentialRampToValueAtTime(240, t + 0.26)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.48, t)
  g.gain.exponentialRampToValueAtTime(0.008, t + 0.24)
  src.connect(low)
  low.connect(g)
  g.connect(ctx.destination)
  src.start(t)
  src.stop(t + dur + 0.02)

  const thud = ctx.createOscillator()
  thud.type = 'sine'
  thud.frequency.setValueAtTime(168, t)
  thud.frequency.exponentialRampToValueAtTime(48, t + 0.4)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0, t)
  tg.gain.linearRampToValueAtTime(0.62, t + 0.018)
  tg.gain.exponentialRampToValueAtTime(0.008, t + 0.48)
  thud.connect(tg)
  tg.connect(ctx.destination)
  thud.start(t)
  thud.stop(t + 0.52)

  const clang = ctx.createOscillator()
  clang.type = 'square'
  clang.frequency.setValueAtTime(285, t)
  clang.frequency.exponentialRampToValueAtTime(120, t + 0.12)
  const cg = ctx.createGain()
  cg.gain.setValueAtTime(0, t)
  cg.gain.linearRampToValueAtTime(0.14, t + 0.006)
  cg.gain.exponentialRampToValueAtTime(0.008, t + 0.16)
  const cf = ctx.createBiquadFilter()
  cf.type = 'highpass'
  cf.frequency.value = 180
  clang.connect(cf)
  cf.connect(cg)
  cg.connect(ctx.destination)
  clang.start(t)
  clang.stop(t + 0.2)
}

/** Rough illegal-zone riding — quiet scrape so ~1 Hz ticks are not harsh. */
function playRestrictedTerrain(ctx: AudioContext) {
  const t = ctx.currentTime
  const dur = 0.09
  const nSamples = Math.floor(ctx.sampleRate * dur)
  const buffer = ctx.createBuffer(1, nSamples, ctx.sampleRate)
  const ch = buffer.getChannelData(0)
  for (let i = 0; i < nSamples; i++) ch[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 520
  bp.Q.value = 0.55
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.065, t)
  g.gain.exponentialRampToValueAtTime(0.006, t + 0.08)
  src.connect(bp)
  bp.connect(g)
  g.connect(ctx.destination)
  src.start(t)
  src.stop(t + dur + 0.02)
}

export function playBloodImpactFeedback(kind: ImpactKind) {
  pulseHaptic(kind)
  shakeGameRoot(kind)

  const ctx = getAudioContext()
  if (!ctx) return
  void ctx.resume().then(() => {
    if (kind === 'vehicle') playVehicleKnock(ctx)
    else if (kind === 'restricted') playRestrictedTerrain(ctx)
    else playPedThud(ctx)
  })
}
