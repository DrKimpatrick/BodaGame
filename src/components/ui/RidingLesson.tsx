import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { headingFromYaw, leftOfCentre } from '../../game/roadRoute'
import { driveInput } from '../../input/driveInput'
import { speak, stopSpeaking } from '../../roadRules/fx/speech'
import { bikeTelemetry, lessonGate, routeTelemetry } from '../../roadRules/world/telemetry'
import { useGameStore } from '../../store/useGameStore'
import { useRoadRulesStore } from '../../store/useRoadRulesStore'
import { BrakeTurnDiagram, KeepLeftDiagram, RoundaboutDiagram, SignalDiagram } from './lessonDiagrams'
import { Button, Modal, SignImg } from './primitives'
import { useIsTouch } from './useIsTouch'

/**
 * The learner's lesson with Mama Sarah: one idea at a time. Each step explains the idea while the world waits (the
 * player decides when they've read it), then lets them try it on the road for as long as they need, and tells them
 * how it went before moving on. Nothing here runs on a timer, and rule penalties stay off until rules are taught.
 */

type Names = { gas: string; brake: string; steer: string }

/** What a practice task can see, sampled ten times a second. */
type Sample = {
  dt: number
  kmh: number
  gas: boolean
  brake: boolean
  steer: boolean
  /** Metres moved since the last sample. */
  moved: number
  /** Metres to the left of the centre line (negative: on the wrong side). */
  left: number
  yaw: number
  goodMoves: number
  deliveries: number
  phase: string | undefined
}

/** A running task: `step` takes a sample, returns progress 0–1 and what to say now. */
type Task = {
  goal: string
  step: (s: Sample) => { progress: number; say?: string; done?: string }
}

type Step = {
  id: string
  title: string
  body: ReactNode
  /** Plain text of the body, for reading aloud. */
  speech: string
  diagram?: ReactNode
  /** The sign shown beside the title. */
  sign?: string
  task?: () => Task
  /** The route line is only shown once it has been explained. */
  showsRoute?: boolean
  /** From here on, rules are watched and mistakes explained. */
  rulesOn?: boolean
}

function buildSteps(n: Names): Step[] {
  return [
    {
      id: 'welcome',
      title: 'Hello, I am Mama Sarah',
      body: (
        <>
          <p>I will teach you to ride a boda in Kampala, one small step at a time.</p>
          <p>The road waits while you read. Nothing is timed, so take as long as you need. After each step you try it yourself, and I tell you how it went.</p>
          <p>Mistakes are fine. They are how we learn, and here they cost you nothing.</p>
        </>
      ),
      speech: 'Hello, I am Mama Sarah. I will teach you to ride a boda in Kampala, one small step at a time. The road waits while you read. Nothing is timed. After each step you try it yourself. Mistakes are fine. They are how we learn.',
    },
    {
      id: 'keepleft',
      title: 'First rule: in Uganda we keep left',
      diagram: <KeepLeftDiagram />,
      body: (
        <>
          <p>Ride on the <b>left side</b> of the road. The line in the middle of the road should be on your <b>right</b>.</p>
          <p>Traffic coming towards you passes on your right. If you are on the other side, you are facing them head-on, and that is how people get killed.</p>
          <p>Everything else I teach you builds on this one rule.</p>
        </>
      ),
      speech: 'First rule. In Uganda we keep left. Ride on the left side of the road. The line in the middle of the road should be on your right. Traffic coming towards you passes on your right. Everything else I teach you builds on this one rule.',
    },
    {
      id: 'gas',
      title: 'The accelerator makes you go',
      body: (
        <>
          <p>Press and hold <b>{n.gas}</b>. The bike pulls away gently and speed builds up the longer you hold it.</p>
          <p>Watch the dial at the top of the screen: it shows your speed in km/h.</p>
          <p>Your turn: hold it until you reach <b>20 km/h</b>. Go straight, don't steer yet.</p>
        </>
      ),
      speech: 'The accelerator makes you go. Press and hold it. Speed builds up the longer you hold it. Watch the dial, it shows your speed. Hold it until you reach 20 kilometres an hour.',
      task: () => ({
        goal: `Hold ${n.gas} until you reach 20 km/h`,
        step: (s) => ({
          progress: s.kmh / 20,
          say: s.gas ? undefined : s.kmh > 2 ? `Keep holding ${n.gas}.` : `Press and hold ${n.gas}.`,
          done: s.kmh >= 20 ? 'Good. You felt it build up slowly: that is how a smooth rider pulls away.' : undefined,
        }),
      }),
    },
    {
      id: 'coast',
      title: 'Letting go slows you down',
      body: (
        <>
          <p>Now let go of <b>{n.gas}</b> completely. You won't stop suddenly. The bike rolls on and slowly loses speed.</p>
          <p>This is called coasting. Good riders do it all the time: it is the gentlest way to slow a little, and it saves fuel.</p>
          <p>Your turn: let go, and watch your speed fall to <b>10 km/h</b>.</p>
        </>
      ),
      speech: 'Letting go slows you down. Let go of the accelerator completely. The bike rolls on and slowly loses speed. This is called coasting. It is the gentlest way to slow a little, and it saves fuel.',
      task: () => {
        let coasted = 0
        return {
          goal: 'Let go of the accelerator and coast down',
          step: (s) => {
            if (s.gas) return { progress: 0, say: `Let go of ${n.gas}.` }
            if (s.kmh < 12 && coasted === 0) return { progress: 0, say: `You need some speed first: hold ${n.gas} up to 20 km/h, then let go.` }
            if (s.kmh > 0.5) coasted += s.dt
            return {
              progress: Math.min(1, (20 - s.kmh) / 10),
              done: s.kmh <= 10 && coasted > 0.5 ? 'Feel how gentle that was? No jolt, and your passenger barely notices.' : undefined,
            }
          },
        }
      },
    },
    {
      id: 'brake',
      title: 'The brake stops you',
      body: (
        <>
          <p>Press <b>{n.brake}</b> to slow down firmly. Keep holding it and the bike comes to a full stop, then stays still.</p>
          <p>Brake early, with the bike going straight. Braking hard while turning is how bikes fall over.</p>
          <p>A boda has no reverse, so the bike never rolls backwards.</p>
          <p>Your turn: get moving, then brake to a <b>complete stop</b>.</p>
        </>
      ),
      speech: 'The brake stops you. Press it to slow down firmly. Keep holding and the bike comes to a full stop. Brake early, with the bike going straight. Braking hard while turning is how bikes fall over. A boda has no reverse. Get moving, then brake to a complete stop.',
      task: () => {
        let moved = false
        let still = 0
        return {
          goal: 'Pick up speed, then brake to a complete stop',
          step: (s) => {
            if (s.kmh > 12) moved = true
            if (!moved) return { progress: Math.min(0.5, s.kmh / 24), say: `First pick up some speed with ${n.gas}.` }
            still = s.kmh < 0.5 ? still + s.dt : 0
            return {
              progress: 0.5 + Math.min(0.5, (12 - Math.min(12, s.kmh)) / 24),
              say: s.brake ? undefined : `Now press ${n.brake} and hold it.`,
              done: still > 0.7 ? 'A clean stop. You can now start and stop safely, and that is the most important skill there is.' : undefined,
            }
          },
        }
      },
    },
    {
      id: 'stayleft',
      title: 'Now stay on the left',
      diagram: <KeepLeftDiagram />,
      body: (
        <>
          <p>Steer with <b>{n.steer}</b>. Use short, gentle presses: a small press makes a small change. Holding it down swings you across the road.</p>
          <p>Keep the middle line on your right and stay in your lane.</p>
          <p>Your turn: ride <b>80 metres</b> on the left. I only count the metres you ride on the correct side.</p>
        </>
      ),
      speech: 'Now stay on the left. Steer with short, gentle presses. A small press makes a small change. Keep the middle line on your right. Ride 80 metres on the left. I only count the metres you ride on the correct side.',
      task: () => {
        let good = 0
        return {
          goal: 'Ride 80 m on the left of the road',
          step: (s) => {
            if (s.kmh > 1 && s.left > 0.3) good += s.moved
            let say: string | undefined
            if (s.left <= 0.3 && s.kmh > 1) say = 'You are on the wrong side. Steer gently to the left until the middle line is on your right.'
            else if (s.kmh < 1) say = `Press ${n.gas} to move.`
            else if (s.kmh > 45) say = 'A little slower. There is no rush while you learn.'
            return { progress: good / 80, say, done: good >= 80 ? 'Well done. Staying left is now a habit. Keep it for the rest of your riding life.' : undefined }
          },
        }
      },
    },
    {
      id: 'turn',
      title: 'How to take a corner smoothly',
      diagram: <BrakeTurnDiagram />,
      showsRoute: true,
      body: (
        <>
          <p>A coloured line now shows you the way, and the top of the screen tells you what is coming next.</p>
          <ol className="list-inside list-decimal space-y-1">
            <li><b>Before the corner:</b> let go of {n.gas} and brake with {n.brake}, down to about <b>20 km/h</b>.</li>
            <li><b>Turn in:</b> release the brake and steer steadily.</li>
            <li><b>Keep left:</b> end up on the left of the new road. When turning right, cross the other lane only when it is clear.</li>
            <li><b>Coming out:</b> straighten up, then accelerate gently.</li>
          </ol>
          <p>Your turn: follow the line round the next corner. I will tell you how fast you took it.</p>
        </>
      ),
      speech: 'How to take a corner smoothly. Before the corner, let go of the accelerator and brake, down to about 20 kilometres an hour. Then release the brake and steer steadily. End up on the left of the new road. When turning right, cross the other lane only when it is clear. As you come out, straighten up, then accelerate gently.',
      task: () => {
        let heading: string | null = null
        let lastTurn: number | null = null
        let attempts = 0
        // The fastest she was going during this press of the steering: that's the speed she turned in at.
        let turnInKmh = 0
        let sinceTurn = 99
        return {
          goal: 'Follow the line round the next corner, at about 20 km/h',
          step: (s) => {
            const h = headingFromYaw(s.yaw)
            heading ??= h
            turnInKmh = s.steer ? Math.max(turnInKmh, s.kmh) : 0
            if (h !== heading) {
              heading = h
              if (s.kmh > 3) {
                lastTurn = Math.max(turnInKmh, s.kmh)
                attempts++
                sinceTurn = 0
              }
            }
            sinceTurn += s.dt
            if (lastTurn !== null && sinceTurn < 7 && sinceTurn > 1.5) {
              // Give the rider a moment to come out of the corner before judging it.
              const speed = Math.round(lastTurn)
              if (lastTurn <= 32) return { progress: 1, done: `${speed} km/h through the corner, and well controlled. That's a smooth turn.` }
              if (attempts >= 2) return { progress: 1, done: `${speed} km/h is still quick for a corner, so keep practising: slow down earlier, before you steer. We'll move on.` }
              return { progress: 0.5, say: `That was ${speed} km/h: too fast, and it pushed you wide. Slow to about 20 km/h before the next one.` }
            }
            if (s.steer && s.kmh > 30) return { progress: attempts ? 0.5 : 0.25, say: 'Too fast to turn. Let go and brake first, then steer.' }
            return { progress: attempts ? 0.5 : 0.25, say: s.kmh < 1 ? `Press ${n.gas} and follow the line.` : undefined }
          },
        }
      },
    },
    {
      id: 'junctions',
      title: 'Lights and lines tell you when to go',
      diagram: <SignalDiagram />,
      sign: 'stop',
      rulesOn: true,
      body: (
        <>
          <p><b>Red:</b> stop behind the white line and wait. <b>Amber:</b> stop if you safely can. <b>Green:</b> go, if the way is clear.</p>
          <p><b>STOP sign:</b> stop completely at the line, look both ways, then go. <b>Give way:</b> slow down, and only go if nothing is coming.</p>
          <p><b>Zebra crossing:</b> slow down and let people cross.</p>
          <p>From now on I am watching for these. If you make a mistake the road will wait, and I will explain what happened.</p>
          <p>Your turn: keep following the line, and <b>stop correctly</b> at a junction.</p>
        </>
      ),
      speech: 'Lights and lines tell you when to go. Red: stop behind the white line and wait. Amber: stop if you safely can. Green: go, if the way is clear. Stop sign: stop completely at the line, look both ways, then go. Give way: slow down, and only go if nothing is coming. Zebra crossing: slow down and let people cross.',
      task: () => {
        let start: number | null = null
        return {
          goal: 'Stop correctly at a red light, STOP sign or give-way line',
          step: (s) => {
            start ??= s.goodMoves
            return {
              progress: s.goodMoves > start ? 1 : 0.15,
              say: s.kmh < 1 ? 'Follow the line to the next junction.' : undefined,
              done: s.goodMoves > start ? 'You read the junction and did the right thing. Drivers around you could trust you.' : undefined,
            }
          },
        }
      },
    },
    {
      id: 'roundabout',
      title: 'Roundabouts go clockwise',
      diagram: <RoundaboutDiagram />,
      sign: 'giveway',
      body: (
        <>
          <p>Because we keep left, you <b>turn left</b> to join a roundabout and go round <b>clockwise</b>.</p>
          <p>Give way to traffic already on it, coming from your <b>right</b>. Join when there is a gap, then leave at your road, turning left again.</p>
          <p>The line will show you the way when you reach one. There is nothing to try right now.</p>
        </>
      ),
      speech: 'Roundabouts go clockwise. Because we keep left, you turn left to join a roundabout. Give way to traffic already on it, coming from your right. Join when there is a gap, then leave at your road, turning left again.',
    },
    {
      id: 'passenger',
      title: 'Your first passenger',
      showsRoute: true,
      body: (
        <>
          <p>Now we put it all together. The line takes you to a passenger waiting at the roadside, always on your <b>left</b>.</p>
          <p>Slow down, pull in to the left kerb beside them and <b>stop</b>. They climb on. Then the line changes colour and leads to where they are going. Stop at the kerb again to drop them off and get paid.</p>
          <p>Remember: a smooth ride is a safe ride, and happy passengers come back.</p>
        </>
      ),
      speech: 'Your first passenger. The line takes you to a passenger waiting at the roadside, always on your left. Slow down, pull in to the left kerb beside them and stop. They climb on. Then follow the line to where they are going. Stop at the kerb again to drop them off and get paid.',
      task: () => {
        let startDeliveries: number | null = null
        return {
          goal: 'Pick up your passenger and drop them off',
          step: (s) => {
            startDeliveries ??= s.deliveries
            const done = s.deliveries > startDeliveries
            const carrying = s.phase === 'carrying'
            return {
              progress: done ? 1 : carrying ? 0.5 : 0.1,
              say: carrying ? 'They are on. Ride gently, and follow the blue line.' : 'Follow the red line. Stop at the left kerb beside your passenger.',
              done: done ? 'Your first fare! You earned that by riding well.' : undefined,
            }
          },
        }
      },
    },
    {
      id: 'done',
      title: 'You can ride!',
      body: (
        <>
          <p>Look at what you have learned:</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>Keep left, always</li>
            <li>Pull away gently, coast, and brake in a straight line</li>
            <li>Slow down <b>before</b> a corner</li>
            <li>Obey lights, STOP signs and give-way lines</li>
            <li>Go clockwise round roundabouts</li>
            <li>Pick passengers up and drop them off at the left kerb</li>
          </ul>
          <p>Keep riding for as long as you like. Situation cards will now start to appear, asking what you would do. When you feel ready, try <b>Work a shift</b> from the main menu.</p>
        </>
      ),
      speech: 'You can ride. Keep left, always. Pull away gently, coast, and brake in a straight line. Slow down before a corner. Obey lights, stop signs and give way lines. Go clockwise round roundabouts. Keep riding for as long as you like. When you feel ready, try Work a shift from the main menu.',
    },
  ]
}

type Phase = { kind: 'explain' } | { kind: 'practice' } | { kind: 'result'; text: string; skipped?: boolean }

export function RidingLesson({ onModalChange }: { onModalChange: (open: boolean) => void }) {
  const isTouch = useIsTouch()
  const overlay = useRoadRulesStore((s) => s.overlay)
  const names: Names = isTouch ? { gas: 'GAS', brake: 'BRAKE', steer: 'the ◀ ▶ buttons' } : { gas: 'W or ↑', brake: 'S, ↓ or Space', steer: 'A and D, or ← and →' }
  const steps = useRef(buildSteps(names)).current
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'explain' })
  const [finished, setFinished] = useState(false)
  const [live, setLive] = useState<{ progress: number; say?: string }>({ progress: 0 })
  const step = steps[index]!
  const task = useRef<Task | null>(null)

  const modalOpen = !finished && !overlay && (phase.kind === 'explain' || phase.kind === 'result')
  useEffect(() => onModalChange(modalOpen), [modalOpen, onModalChange])
  useEffect(() => () => onModalChange(false), [onModalChange])

  // Rules, cards and the route stay off until each has been taught.
  useEffect(() => {
    let rules = false
    let route = false
    for (let k = 0; k <= index; k++) {
      rules ||= !!steps[k]!.rulesOn
      route ||= !!steps[k]!.showsRoute
    }
    lessonGate.active = !finished
    lessonGate.rulesOff = !finished && !rules
    routeTelemetry.hidden = !finished && !route
    return () => {
      lessonGate.active = false
      lessonGate.rulesOff = false
      routeTelemetry.hidden = false
    }
  }, [index, finished, steps])

  const next = useCallback(() => {
    stopSpeaking()
    task.current = null
    setLive({ progress: 0 })
    setPhase({ kind: 'explain' })
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        setFinished(true)
        return i
      }
      return i + 1
    })
  }, [steps.length])

  const startPractice = () => {
    stopSpeaking()
    if (!step.task) {
      next()
      return
    }
    task.current = step.task()
    setLive({ progress: 0 })
    setPhase({ kind: 'practice' })
  }

  const skipLesson = () => {
    stopSpeaking()
    setFinished(true)
  }

  // Practice: a light poll of the bike, ten times a second. It stops while a card or explanation is up.
  const last = useRef({ x: 0, z: 0, t: 0, valid: false })
  const goodMoves = useRoadRulesStore((s) => s.rr?.stats.goodMoves ?? 0)
  const goodRef = useRef(goodMoves)
  useEffect(() => {
    goodRef.current = goodMoves
  }, [goodMoves])
  useEffect(() => {
    if (phase.kind !== 'practice' || overlay) return
    last.current.valid = false
    const id = setInterval(() => {
      const t = task.current
      if (!t) return
      const b = bikeTelemetry
      const now = performance.now()
      const l = last.current
      const dt = l.valid ? (now - l.t) / 1000 : 0.1
      const moved = l.valid ? Math.hypot(b.x - l.x, b.z - l.z) : 0
      last.current = { x: b.x, z: b.z, t: now, valid: true }
      const g = useGameStore.getState()
      const r = t.step({
        dt,
        kmh: Math.abs(b.speed) * 3.6,
        gas: driveInput.forward,
        brake: driveInput.back,
        steer: driveInput.left || driveInput.right,
        moved: moved < 6 ? moved : 0,
        left: leftOfCentre(b.x, b.z, headingFromYaw(b.yaw)),
        yaw: b.yaw,
        goodMoves: goodRef.current,
        deliveries: g.rideCompletedDeliveries,
        phase: g.rideJob?.phase,
      })
      setLive((prev) => {
        const progress = Math.max(0, Math.min(1, r.progress))
        return prev.say === r.say && Math.abs(prev.progress - progress) < 0.01 ? prev : { progress, say: r.say }
      })
      if (r.done) {
        task.current = null
        setPhase({ kind: 'result', text: r.done })
      }
    }, 100)
    return () => clearInterval(id)
  }, [phase.kind, overlay])

  if (finished || overlay) return null

  const readAloud = (text: string) => speak(text, { force: true })

  if (phase.kind === 'explain') {
    return (
      <Modal labelledBy="lesson-title" wide>
        <p className="text-[12px] font-extrabold uppercase tracking-widest text-[#f5c518]">
          Lesson · Step {index + 1} of {steps.length}
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h2 id="lesson-title" className="text-2xl font-black leading-tight">
            {step.title}
          </h2>
          {step.sign ? <SignImg sign={step.sign} className="h-14 w-14" label="" /> : null}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#f5c518]" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        {step.diagram ? <div className="mt-3 flex justify-center rounded-2xl bg-[#101114] p-2">{step.diagram}</div> : null}
        <div className="mt-3 space-y-2 text-[16px] leading-relaxed text-zinc-200">{step.body}</div>
        <Button className="mt-4 w-full text-lg" onClick={startPractice} autoFocus>
          {step.task ? 'I understand, let me try' : index === steps.length - 1 ? 'Keep riding' : 'I understand, next'}
        </Button>
        <div className="mt-2 flex items-center justify-between text-sm font-bold">
          <button type="button" onClick={() => readAloud(step.speech)} className="min-h-11 text-zinc-300 hover:underline">
            🔈 Read this to me
          </button>
          {index < steps.length - 1 ? (
            <button type="button" onClick={skipLesson} className="min-h-11 text-zinc-500 hover:underline">
              Skip the lesson
            </button>
          ) : null}
        </div>
      </Modal>
    )
  }

  if (phase.kind === 'result') {
    return (
      <Modal labelledBy="lesson-result" tone="good">
        <p className="text-[12px] font-extrabold uppercase tracking-widest text-emerald-300">Step {index + 1} done</p>
        <h2 id="lesson-result" className="mt-1 text-2xl font-black">
          Mama Sarah says
        </h2>
        <p className="mt-2 text-[17px] leading-relaxed text-zinc-100">{phase.text}</p>
        <Button className="mt-4 w-full text-lg" onClick={next} autoFocus>
          Next step
        </Button>
        <Button tone="ghost" className="mt-2 w-full" onClick={() => setPhase({ kind: 'explain' })}>
          Explain this again
        </Button>
      </Modal>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+8.5rem)] z-20 flex justify-center px-3 md:top-[calc(max(0.75rem,env(safe-area-inset-top))+6.5rem)] [@media(max-height:500px)]:top-16" aria-live="polite">
      <div className="pointer-events-auto w-[min(94vw,440px)] rounded-2xl bg-[#17181d]/92 p-3 shadow-xl ring-1 ring-[#f5c518]/50 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#f5c518]">Your turn · Step {index + 1}</p>
          <div className="flex gap-3 text-[12px] font-bold text-zinc-400">
            <button type="button" onClick={() => setPhase({ kind: 'explain' })} className="hover:underline">
              Explain again
            </button>
            <button type="button" onClick={next} className="hover:underline">
              Skip
            </button>
          </div>
        </div>
        <p className="mt-1 text-[15px] font-extrabold leading-snug text-white">{task.current?.goal}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-150" style={{ width: `${live.progress * 100}%` }} />
        </div>
        {live.say ? <p className="mt-1.5 text-[13px] font-bold leading-snug text-amber-200">{live.say}</p> : null}
      </div>
    </div>
  )
}
