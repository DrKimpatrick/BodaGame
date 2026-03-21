import { useEffect, type RefObject } from 'react'

/** Matches `MAX_FORWARD` in Boda (m/s). */
const MAX_SPEED_MS = 14
/** Above this speed, volume and pitch ramp up (“overspeed” / high revs). */
const OVERSPEED_START_MS = 8

/** Clearly audible at standstill (speed 0). */
const IDLE_MASTER_GAIN = 0.14
const IDLE_FREQ_HZ = 50
const OVERSPEED_EXTRA_GAIN = 0.12
const OVERSPEED_EXTRA_FREQ = 22
/** Low triangle layer — strongest when stopped, tapers as speed builds. */
const IDLE_RUMBLE_BASE = 0.078

/**
 * Engine always audible at idle; extra loudness and pitch only when overspeeding.
 * Oscillators start only after AudioContext is running (avoids autoplay console spam).
 */
export function useBikeEngineAudio(speedRef: RefObject<number>) {
  useEffect(() => {
    const ctx = new AudioContext()

    const master = ctx.createGain()
    master.gain.value = IDLE_MASTER_GAIN
    master.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = IDLE_FREQ_HZ
    osc.connect(master)

    const osc2 = ctx.createOscillator()
    osc2.type = 'square'
    osc2.frequency.value = IDLE_FREQ_HZ * 0.5
    const g2 = ctx.createGain()
    g2.gain.value = 0.13
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
      const vol = IDLE_MASTER_GAIN + overspeedT * OVERSPEED_EXTRA_GAIN
      const f1 = IDLE_FREQ_HZ + overspeedT * OVERSPEED_EXTRA_FREQ
      const f2 = f1 * 0.5
      const harm = 0.13 + overspeedT * 0.055
      const rumble =
        IDLE_RUMBLE_BASE * (1 - overspeedT * 0.88) + overspeedT * 0.022
      master.gain.setTargetAtTime(vol, t, 0.07)
      osc.frequency.setTargetAtTime(f1, t, 0.09)
      osc2.frequency.setTargetAtTime(f2, t, 0.09)
      g2.gain.setTargetAtTime(harm, t, 0.09)
      g3.gain.setTargetAtTime(Math.max(0.018, rumble), t, 0.1)
      osc3.frequency.setTargetAtTime(34 + overspeedT * 10, t, 0.1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('keydown', resume)
      window.removeEventListener('pointerdown', resume)
      cancelAnimationFrame(raf)
      if (graphStarted) {
        osc.stop()
        osc2.stop()
        osc3.stop()
      }
      void ctx.close()
    }
  }, [speedRef])
}
