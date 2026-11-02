import { useEffect, useRef, useState, type ReactNode } from 'react'
import { driveInput, inputGate } from '../../input/driveInput'
import { bikeTelemetry, lessonGate } from '../../roadRules/world/telemetry'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Button, Modal } from './primitives'
import { useIsTouch } from './useIsTouch'

/** How to ride: the controls, what each one does and how to take a turn smoothly, plus live tips while riding. */

function Key({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex min-w-7 items-center justify-center rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[12px] font-black text-white ring-1 ring-white/25">{children}</kbd>
}

function Control({ title, keys, touch, children }: { title: string; keys: ReactNode; touch: string; children: ReactNode }) {
  const isTouch = useIsTouch()
  return (
    <div className="rounded-2xl bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold text-white">{title}</h3>
        <span className="flex flex-wrap items-center gap-1 text-[12px] text-zinc-300">{isTouch ? <b className="text-[#f5c518]">{touch}</b> : keys}</span>
      </div>
      <p className="mt-1 text-sm leading-snug text-zinc-300">{children}</p>
    </div>
  )
}

export function HowToRide({ onClose }: { onClose: () => void }) {
  const isTouch = useIsTouch()
  return (
    <Modal labelledBy="ride-guide-title">
      <h2 id="ride-guide-title" className="text-2xl font-black">How to ride</h2>
      <p className="mt-1 text-sm text-zinc-400">{isTouch ? 'Use the on-screen buttons: steer with your left thumb, GAS and BRAKE with your right.' : 'Use the keyboard. Keep one hand on accelerate and brake, the other on steering.'}</p>
      <div className="mt-3 grid gap-2">
        <Control title="Accelerator" touch="GAS" keys={<><Key>W</Key> or <Key>↑</Key></>}>
          Hold to pull away: speed builds gradually. Let go and the bike slowly coasts down, which is the easiest way to lose a little speed.
        </Control>
        <Control title="Brake" touch="BRAKE" keys={<><Key>S</Key>, <Key>↓</Key> or <Key>Space</Key></>}>
          Slows you firmly, then holds the bike still at a red light. Brake early and in a straight line. A boda has no reverse: if you stop against a wall, steer on the spot to turn away, then pull off.
        </Control>
        <Control title="Steering" touch="◀ ▶" keys={<><Key>A</Key> <Key>D</Key> or <Key>←</Key> <Key>→</Key></>}>
          Short presses make small corrections. The faster you go, the wider you turn, so a tight corner needs a slow bike. The arrows on the road show where you're heading.
        </Control>
      </div>
      <div className="mt-3 rounded-2xl border-l-4 border-[#f5c518] bg-[#f5c518]/10 p-3">
        <h3 className="font-extrabold text-white">A smooth turn, in four steps</h3>
        <ol className="mt-1 list-inside list-decimal space-y-0.5 text-sm leading-snug text-zinc-200">
          <li><b>Before the corner:</b> let go of the accelerator, then brake, down to about 20 km/h.</li>
          <li><b>Turn in:</b> release the brake, then hold the steering steadily.</li>
          <li><b>Through it:</b> look at your exit and keep left of the road you are joining.</li>
          <li><b>Coming out:</b> straighten up, then accelerate gently.</li>
        </ol>
      </div>
      <p className="mt-3 text-sm leading-snug text-zinc-300">
        <b className="text-white">Passengers:</b> stop inside the marked bay. <b className="text-white">Rain:</b> brakes and grip are weaker, so slow down earlier.
      </p>
      {!isTouch ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
          <span><Key>L</Key> headlight</span>
          <span><Key>V</Key> camera</span>
          <span><Key>H</Key> horn</span>
          <span><Key>T</Key> arrows</span>
          <span><Key>M</Key> mute</span>
          <span><Key>?</Key> this guide</span>
          <span><Key>Esc</Key> pause</span>
        </p>
      ) : null}
      <Button className="mt-4 w-full" onClick={onClose} autoFocus>
        Got it, let&apos;s ride
      </Button>
    </Modal>
  )
}

/** One-line reminder of the keys, for keyboards. */
export function KeyStrip() {
  const isTouch = useIsTouch()
  const coach = useSettingsStore((s) => s.coach)
  if (isTouch || !coach) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 hidden justify-center lg:flex">
      <p className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-bold text-zinc-200 backdrop-blur-md">
        <Key>W</Key> accelerate <Key>S</Key> brake <Key>A</Key><Key>D</Key> steer <Key>?</Key> how to ride
      </p>
    </div>
  )
}

type Tip = 'start' | 'tooFast' | 'brakeTurn' | 'gasTurn' | 'cornerAdvice'

/** How long a tip stays up, and how long before the same one can return (s). */
const TIP_SHOW = 3.5
const TIP_AGAIN = 20
const POLL_S = 0.2

/** Watches how you ride and gives one short tip at a time. Polls a few times a second: nothing per-frame. */
export function RideCoach() {
  const isTouch = useIsTouch()
  const enabled = useSettingsStore((s) => s.coach)
  const [tip, setTip] = useState<Tip | null>(null)
  const state = useRef({ steerHeld: 0, moved: false, ridden: 0, shownUntil: 0, last: new Map<Tip, number>(), now: 0 })

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => {
      const s = state.current
      if (lessonGate.active) {
        // The lesson does the teaching; afterwards there's no need to say how to pull away.
        s.moved = true
        s.last.set('cornerAdvice', s.now)
      }
      if (!inputGate.riding || lessonGate.active) {
        setTip(null)
        return
      }
      s.now += POLL_S
      const speed = bikeTelemetry.speed
      const steering = driveInput.left || driveInput.right
      s.steerHeld = steering ? s.steerHeld + POLL_S : 0
      if (speed > 1) {
        s.moved = true
        s.ridden += POLL_S
      }
      let want: Tip | null = null
      if (!s.moved) want = s.now > 1.5 ? 'start' : null
      else if (s.steerHeld >= 0.4 && speed > 8 && driveInput.back) want = 'brakeTurn'
      else if (s.steerHeld >= 0.4 && speed > 8 && driveInput.forward) want = 'gasTurn'
      else if (s.steerHeld >= 0.6 && speed > 11) want = 'tooFast'
      else if (s.ridden > 6 && !s.last.has('cornerAdvice')) want = 'cornerAdvice'

      if (s.now < s.shownUntil) {
        // The opening tip goes as soon as it has been followed.
        if (s.moved) setTip((t) => (t === 'start' ? null : t))
        return
      }
      if (want && (want === 'start' || s.now - (s.last.get(want) ?? -TIP_AGAIN) >= TIP_AGAIN)) {
        s.last.set(want, s.now)
        s.shownUntil = s.now + TIP_SHOW
        setTip(want)
      } else {
        setTip(null)
      }
    }, POLL_S * 1000)
    return () => clearInterval(id)
  }, [enabled])

  if (!enabled || !tip) return null
  const gas = isTouch ? 'GAS' : 'W or ↑'
  const brake = isTouch ? 'BRAKE' : 'S or ↓'
  const text: Record<Tip, string> = {
    start: `Hold ${gas} to pull away.`,
    tooFast: `Wide turn: you're going fast. Slow to about 20 km/h before you steer.`,
    brakeTurn: `Brake in a straight line, before the corner, then steer.`,
    gasTurn: `Ease off the accelerator through the turn, and accelerate as you straighten up.`,
    cornerAdvice: `Corner coming? Let go of ${gas}, brake with ${brake}, then steer.`,
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-4 [@media(pointer:coarse)]:bottom-auto [@media(pointer:coarse)]:top-[calc(max(0.75rem,env(safe-area-inset-top))+13rem)] [@media(pointer:coarse)_and_(max-height:500px)]:top-16" aria-live="polite">
      <p className="max-w-md rounded-2xl bg-indigo-950/90 px-4 py-2 text-center text-sm font-bold text-white shadow-xl ring-1 ring-indigo-300/40 backdrop-blur-md animate-[toastIn_.25s_ease-out]">
        🏍️ {text[tip]}
      </p>
    </div>
  )
}
