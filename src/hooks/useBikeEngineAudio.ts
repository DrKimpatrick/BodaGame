import { useEffect, type RefObject } from 'react'
import { getSharedAudioContext } from '../audio/webAudioContext'

/** Matches `MAX_FORWARD` in Boda (m/s). */
const MAX_SPEED_MS = 14
/** Above this speed, volume and pitch ramp up (“overspeed” / high revs). */
const OVERSPEED_START_MS = 8

/**
 * Master output multiplier vs background music (~0.38 linear MP3). Keeps the engine in the
 * same “layer” as the soundtrack instead of on top of it.
 */
const MIX_WITH_BG_MUSIC = 0.42

/** ~0–3 m/s: extra duck so parked / crawl is subtle; full weight by ~3 m/s. */
const CRAWL_BLEND_MS = 2.85

/** Base levels (before crawl shaping & MIX_WITH_BG_MUSIC). */
const IDLE_MASTER_GAIN = 0.056
const IDLE_FREQ_HZ = 50
const OVERSPEED_EXTRA_GAIN = 0.064
const OVERSPEED_EXTRA_FREQ = 22
const IDLE_RUMBLE_BASE = 0.032
const HARM_IDLE = 0.062
const HARM_OVERSPEED = 0.028
const RUMBLE_OVERSPEED_FLOOR = 0.014

/**
 * Engine sits under the looping gameplay track: lower gains, speed-adaptive crawl ducking,
 * and a fixed mix bus so it reads as ambience rather than a second lead.
 */
export function useBikeEngineAudio(speedRef: RefObject<number>) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const ctx = getSharedAudioContext()

    const master = ctx.createGain()
    master.gain.value = IDLE_MASTER_GAIN * 0.5

    const mixOut = ctx.createGain()
    mixOut.gain.value = MIX_WITH_BG_MUSIC
    master.connect(mixOut)
    mixOut.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = IDLE_FREQ_HZ
    osc.connect(master)

    const osc2 = ctx.createOscillator()
    osc2.type = 'square'
    osc2.frequency.value = IDLE_FREQ_HZ * 0.5
    const g2 = ctx.createGain()
    g2.gain.value = HARM_IDLE
    osc2.connect(g2)
    g2.connect(master)

    const osc3 = ctx.createOscillator()
    osc3.type = 'triangle'
    osc3.frequency.value = 36
    const g3 = ctx.createGain()
    g3.gain.value = IDLE_RUMBLE_BASE
    osc3.connect(g3)
    g3.connect(master)

    let graphStarted = false
    const startGraph = () => {
      if (graphStarted || ctx.state !== 'running') return
      graphStarted = true
      osc.start()
      osc2.start()
      osc3.start()
    }

    const resume = () => {
      void ctx.resume().then(startGraph)
    }

    window.addEventListener('keydown', resume)
    window.addEventListener('pointerdown', resume)

    void ctx.resume().then(startGraph)
    if (ctx.state === 'running') startGraph()

    let raf = 0
    const tick = () => {
      if (ctx.state !== 'running') {
        raf = requestAnimationFrame(tick)
        return
      }
      startGraph()
      const s = Math.abs(speedRef.current ?? 0)
      const t = ctx.currentTime
      const band = Math.max(0.001, MAX_SPEED_MS - OVERSPEED_START_MS)
      const overspeedT = Math.min(
        1,
        Math.max(0, s - OVERSPEED_START_MS) / band,
      )
      /** Ease overspeed contribution so high revs swell gently, not a cliff. */
      const overCurve = overspeedT * overspeedT * (3 - 2 * overspeedT)

      const crawlT = Math.min(1, s / CRAWL_BLEND_MS)
      const speedAdaptive = 0.52 + 0.48 * crawlT * crawlT

      const volRaw = IDLE_MASTER_GAIN + overCurve * OVERSPEED_EXTRA_GAIN
      const vol = volRaw * speedAdaptive

      const f1 = IDLE_FREQ_HZ + overCurve * OVERSPEED_EXTRA_FREQ
      const f2 = f1 * 0.5
      const harm = HARM_IDLE + overCurve * HARM_OVERSPEED
      const rumble =
        (IDLE_RUMBLE_BASE * (1 - overCurve * 0.88) +
          overCurve * RUMBLE_OVERSPEED_FLOOR) *
        speedAdaptive *
        0.92

      master.gain.setTargetAtTime(vol, t, 0.09)
      osc.frequency.setTargetAtTime(f1, t, 0.1)
      osc2.frequency.setTargetAtTime(f2, t, 0.1)
      g2.gain.setTargetAtTime(harm * speedAdaptive, t, 0.1)
      g3.gain.setTargetAtTime(
        Math.max(0.01, rumble * speedAdaptive),
        t,
        0.11,
      )
      osc3.frequency.setTargetAtTime(34 + overCurve * 10, t, 0.11)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('keydown', resume)
      window.removeEventListener('pointerdown', resume)
      cancelAnimationFrame(raf)
      if (graphStarted) {
        try {
          osc.stop()
          osc2.stop()
          osc3.stop()
        } catch {
          /* already stopped */
        }
      }
      try {
        osc.disconnect()
        osc2.disconnect()
        osc3.disconnect()
        g2.disconnect()
        g3.disconnect()
        master.disconnect()
        mixOut.disconnect()
      } catch {
        /* ignore */
      }
    }
  }, [speedRef])
}
