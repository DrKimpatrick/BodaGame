import { useEffect, type RefObject } from 'react'

/**
 * Procedural engine loop: pitch and volume follow `speedRef` (m/s).
 * Requires a user gesture to unlock AudioContext (keydown / pointerdown).
 */
export function useBikeEngineAudio(speedRef: RefObject<number>) {
  useEffect(() => {
    const ctx = new AudioContext()

    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 52
    osc.connect(master)

    const osc2 = ctx.createOscillator()
    osc2.type = 'square'
    osc2.frequency.value = 26
    const g2 = ctx.createGain()
    g2.gain.value = 0.12
    osc2.connect(g2)
    g2.connect(master)

    osc.start()
    osc2.start()

    const resume = () => {
      void ctx.resume()
    }
    window.addEventListener('keydown', resume)
    window.addEventListener('pointerdown', resume)

    let raf = 0
    const tick = () => {
      const s = Math.abs(speedRef.current ?? 0)
      const t = ctx.currentTime
      const running = s > 0.06
      const vol = running ? Math.min(0.22, 0.05 + s * 0.012) : 0
      const f1 = 48 + s * 6.5
      const f2 = f1 * 0.5
      master.gain.setTargetAtTime(vol, t, 0.06)
      osc.frequency.setTargetAtTime(f1, t, 0.08)
      osc2.frequency.setTargetAtTime(f2, t, 0.08)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('keydown', resume)
      window.removeEventListener('pointerdown', resume)
      cancelAnimationFrame(raf)
      osc.stop()
      osc2.stop()
      void ctx.close()
    }
  }, [speedRef])
}
