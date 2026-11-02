import { useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { HowToRide } from './RideGuide'
import { timeAgo, type SavedRide } from '../../roadRules/saveFormat'
import { clearAllRides, clearRide, latestRide, loadRide } from '../../store/savedRide'
import { TUTORIALS } from '../../roadRules/tutorials'
import { BILL, DELIVERIES_PER_SHIFT, START_CASH } from '../../roadRules/constants'
import { hasCertificateRequirements, useRoadRulesStore, type GameMode } from '../../store/useRoadRulesStore'
import { useSettingsStore, type Quality } from '../../store/useSettingsStore'
import { Certificate, RuleBook, SignQuiz } from './Library'
import { Button, Modal, SignImg, Toggle } from './primitives'
import { fmtUgx } from './format'

const MODES: { id: GameMode; title: string; tag: string; body: string; icon: string }[] = [
  {
    id: 'learn',
    title: 'Learn with Mama Sarah',
    tag: 'Start here',
    icon: '🎓',
    body: 'Your instructor warns you before every junction, crossing and school. Mistakes are explained, not fined.',
  },
  {
    id: 'shift',
    title: 'Work a shift',
    tag: 'Real stakes',
    icon: '🏍️',
    body: `Earn fares, pay ${fmtUgx(BILL)} in household bills each shift and feed two children. Break a rule and it costs money, health or days in jail.`,
  },
  {
    id: 'free',
    title: 'Free ride',
    tag: 'No rules',
    icon: '🗺️',
    body: 'Explore Kampala and deliver passengers with no rule checks.',
  },
]

/** On a shared phone, someone may want a clean slate. Two taps, so it can't happen by accident. */
function ForgetProgress() {
  const forget = useRoadRulesStore((s) => s.forgetProgress)
  const [stage, setStage] = useState<'idle' | 'sure' | 'done'>('idle')
  return (
    <div className="pt-1">
      <p className="text-xs leading-snug text-zinc-500">Your progress is saved on this device only, with no account. Clearing this browser's data removes it.</p>
      <button
        type="button"
        disabled={stage === 'done'}
        onClick={() => {
          if (stage === 'idle') {
            setStage('sure')
            return
          }
          clearAllRides()
          forget()
          setStage('done')
        }}
        className="mt-1 min-h-11 text-sm font-bold text-rose-300 hover:underline disabled:text-zinc-500 disabled:no-underline"
      >
        {stage === 'idle' ? 'Forget my progress on this device' : stage === 'sure' ? 'Tap again to forget everything' : 'Progress forgotten'}
      </button>
    </div>
  )
}

export function SettingsPanel() {
  const s = useSettingsStore()
  return (
    <div className="divide-y divide-white/5">
      <Toggle label="Decision timer" hint="12 seconds to answer road encounter cards" checked={s.timer} onChange={(v) => s.set({ timer: v })} />
      <Toggle label="Read aloud" hint="Cards and instructor tips are spoken" checked={s.voice} onChange={(v) => s.set({ voice: v })} />
      <Toggle label="Mute everything" hint="Press M at any time" checked={s.muted} onChange={(v) => s.set({ muted: v })} />
      <Toggle label="Music" checked={s.music} onChange={(v) => s.set({ music: v })} />
      <Toggle label="Sound effects" hint="Engine, horn, crashes and clicks" checked={s.sound} onChange={(v) => s.set({ sound: v })} />
      <Toggle label="Riding tips" hint="Live advice and the key reminder while you ride" checked={s.coach} onChange={(v) => s.set({ coach: v })} />
      <Toggle label="Steering pointer" hint="Arrows on the road showing where you're heading (T)" checked={s.pointer} onChange={(v) => s.set({ pointer: v })} />
      <Toggle label="Speed beside the bike" hint="As well as on the dial" checked={s.speedByBike} onChange={(v) => s.set({ speedByBike: v })} />
      <ForgetProgress />
      <Toggle
        label="Gentle mode"
        hint="Children go to relatives instead of dying. Money and jail stakes stay."
        checked={s.gentle}
        onChange={(v) => s.set({ gentle: v })}
      />
      <div className="py-3">
        <p className="text-[15px] font-bold">Graphics</p>
        <p className="text-[13px] text-zinc-400">Low runs smoothly on most phones. High adds sharper shadows and more clouds.</p>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
          {(['low', 'medium', 'high'] as Quality[]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => s.set({ quality: q })}
              className={`min-h-11 rounded-lg text-sm font-extrabold capitalize ${s.quality === q ? 'bg-[#f5c518] text-zinc-950' : 'text-zinc-300'}`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function TutorialsPanel({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const done = useRoadRulesStore((s) => s.progress.tutorialsDone)
  const count = TUTORIALS.filter((t) => done.includes(t.id)).length
  return (
    <Modal labelledBy="tutorials-title" wide>
      <h2 id="tutorials-title" className="text-2xl font-black">Tutorials</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-zinc-300">
        Pick a skill. Mama Sarah rides it first so you can see exactly what to do, then you try it yourself. Nothing is timed, and nothing costs you anything.
      </p>
      {count > 0 ? <p className="mt-1 text-sm font-bold text-emerald-300">{count} of {TUTORIALS.length} practised</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {TUTORIALS.map((t) => (
          <button key={t.id} type="button" onClick={() => onPick(t.id)} className="flex min-h-16 items-center gap-3 rounded-2xl bg-white/6 p-3 text-left ring-1 ring-white/10 hover:bg-white/12">
            <span className="text-2xl" aria-hidden>{t.icon}</span>
            <span className="min-w-0">
              <span className="block font-extrabold text-white">
                {t.title}
                {done.includes(t.id) ? <span className="ml-1.5 text-emerald-300" aria-label="practised">✓</span> : null}
              </span>
              <span className="block text-[13px] leading-snug text-zinc-400">{t.blurb}</span>
            </span>
          </button>
        ))}
      </div>
      <Button tone="ghost" className="mt-3 w-full" onClick={onClose}>
        Back
      </Button>
    </Modal>
  )
}

const MODE_NAME: Record<GameMode, string> = { learn: 'Lesson', shift: 'Shift', free: 'Free ride' }

/** One line saying where this ride had got to. */
function whereStopped(ride: SavedRide, lessonStep: { step: number; steps: number; title: string; done: boolean }): string {
  if (ride.mode === 'learn' && !lessonStep.done && lessonStep.steps > 0) return `Step ${lessonStep.step + 1} of ${lessonStep.steps}: ${lessonStep.title}`
  if (ride.mode === 'shift' && ride.rr) return `Shift ${ride.rr.shift}, trip ${ride.deliveriesThisShift + 1} · ${fmtUgx(ride.money)}`
  return `Riding freely · ${fmtUgx(ride.money)}`
}

export function StartScreen({
  onStart,
  onResume,
  onTutorial,
  startOnTutorials = false,
}: {
  onStart: (mode: GameMode) => void
  onResume: (ride: SavedRide) => void
  onTutorial: (id: string) => void
  startOnTutorials?: boolean
}) {
  const [latest] = useState(() => latestRide())
  const [mode, setMode] = useState<GameMode>(() => latest?.mode ?? 'learn')
  const [saves, setSaves] = useState(() => ({ learn: loadRide('learn'), shift: loadRide('shift'), free: loadRide('free') }))
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [now] = useState(() => Date.now())
  const lessonStep = useStoreWithEqualityFn(useRoadRulesStore, (s) => ({ step: s.progress.lessonStep, steps: s.progress.lessonSteps, title: s.progress.lessonStepTitle, done: s.progress.lessonDone }), shallow)
  const [panel, setPanel] = useState<null | 'book' | 'quiz' | 'cert' | 'settings' | 'guide' | 'tutorials'>(startOnTutorials ? 'tutorials' : null)
  const progress = useRoadRulesStore((s) => s.progress)
  const certReady = hasCertificateRequirements(progress)

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0f1014] text-zinc-100">
      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] lg:flex-row lg:items-center lg:gap-12">
        <header className="lg:w-[44%]">
          <div className="flex items-center gap-3">
            <SignImg sign="giveway" className="h-12 w-12" label="" />
            <SignImg sign="zebra" className="h-12 w-12" label="" />
            <SignImg sign="speed50" className="h-12 w-12" label="" />
          </div>
          <p className="mt-5 text-sm font-extrabold uppercase tracking-[0.3em] text-[#f26b1d]">Women on Wheels</p>
          <h1 className="mt-1 text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl">
            Road
            <br />
            Rules
          </h1>
          <div className="lane-stripe mt-4 h-1.5 w-40 rounded" />
          <p className="mt-4 max-w-md text-lg leading-relaxed text-zinc-300">
            Ride a boda through Kampala and learn Uganda&apos;s road signs and rules the way they matter: every choice you make reaches your family.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={() => setPanel('tutorials')} className="min-h-11 rounded-full bg-[#f5c518] px-4 font-bold text-zinc-950 hover:brightness-110">
              🎬 Tutorials
            </button>
            <button type="button" onClick={() => setPanel('guide')} className="min-h-11 rounded-full bg-white/8 px-4 font-bold ring-1 ring-white/10 hover:bg-white/12">
              🏍️ How to ride
            </button>
            <button type="button" onClick={() => setPanel('book')} className="min-h-11 rounded-full bg-white/8 px-4 font-bold ring-1 ring-white/10 hover:bg-white/12">
              📖 Rule book
            </button>
            <button type="button" onClick={() => setPanel('quiz')} className="min-h-11 rounded-full bg-white/8 px-4 font-bold ring-1 ring-white/10 hover:bg-white/12">
              ✏️ Sign quiz
            </button>
            <button type="button" onClick={() => setPanel('cert')} className="min-h-11 rounded-full bg-white/8 px-4 font-bold ring-1 ring-white/10 hover:bg-white/12">
              {certReady ? '🏆' : '🎖️'} Certificate
            </button>
            <button type="button" onClick={() => setPanel('settings')} className="min-h-11 rounded-full bg-white/8 px-4 font-bold ring-1 ring-white/10 hover:bg-white/12">
              ⚙️ Settings
            </button>
          </div>
        </header>

        <main className="mt-8 flex-1 lg:mt-0">
          {latest ? (
            <button
              type="button"
              onClick={() => onResume(latest)}
              className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-emerald-600 p-4 text-left text-white shadow-lg ring-1 ring-emerald-300/40 transition hover:bg-emerald-500"
            >
              <span className="text-3xl" aria-hidden>▶️</span>
              <span className="min-w-0">
                <span className="block text-[12px] font-extrabold uppercase tracking-widest text-emerald-100">Continue · {MODE_NAME[latest.mode]} · {timeAgo(latest.savedAt, now)}</span>
                <span className="block truncate text-[17px] font-black">{whereStopped(latest, lessonStep)}</span>
              </span>
            </button>
          ) : null}
          <div className="grid gap-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className={`flex gap-4 rounded-2xl p-4 text-left ring-2 transition ${
                  mode === m.id ? 'bg-[#f5c518]/10 ring-[#f5c518]' : 'bg-white/5 ring-transparent hover:bg-white/8'
                }`}
              >
                <span className="text-3xl leading-none">{m.icon}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-black">{m.title}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-zinc-300">{m.tag}</span>
                  </span>
                  <span className="mt-1 block text-[15px] leading-snug text-zinc-300">{m.body}</span>
                </span>
              </button>
            ))}
          </div>

          {mode !== 'free' ? (
            <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm leading-relaxed text-zinc-300">
              <p>
                You start with {fmtUgx(START_CASH)} and two children, Atim and Mukisa. A shift is {DELIVERIES_PER_SHIFT} passenger trips. Rules are checked from how you ride: lights, STOP and give-way lines, speed limits, zebra crossings, keeping left, pavements and headlights. Situation cards pop up along the way.
              </p>
              <p className="mt-2 rounded-xl border-l-4 border-amber-400 bg-amber-950/40 p-3 text-amber-100">
                Content note: in this mode a rider&apos;s mistakes or poverty can lead to her children dying. Switch on <b>Gentle mode</b> in Settings to soften this. Fines and jail terms are game values, not real penalties.
              </p>
            </div>
          ) : null}

          {saves[mode] ? (
            <>
              <Button className="mt-5 w-full text-lg" onClick={() => onResume(saves[mode]!)}>
                Continue where you stopped
              </Button>
              <Button
                tone="ghost"
                className="mt-2 w-full"
                onClick={() => {
                  if (!confirmRestart) {
                    setConfirmRestart(true)
                    return
                  }
                  clearRide(mode)
                  setSaves((s) => ({ ...s, [mode]: null }))
                  setConfirmRestart(false)
                  onStart(mode)
                }}
              >
                {confirmRestart ? 'Tap again to start over and lose this progress' : 'Start over'}
              </Button>
            </>
          ) : (
            <Button className="mt-5 w-full text-lg" onClick={() => onStart(mode)}>
              {mode === 'learn' ? 'Start lesson' : mode === 'shift' ? 'Start shift' : 'Ride'}
            </Button>
          )}
          <p className="mt-3 text-center text-xs text-zinc-500">
            Laptop: W accelerate, S or Space brake, A D steer (or the arrow keys) · M mute · ? how to ride. Phone and tablet: on-screen buttons.
          </p>
          {progress.bestShift > 0 ? <p className="mt-1 text-center text-xs text-zinc-500">Best: reached shift {progress.bestShift}</p> : null}
        </main>
      </div>

      {panel === 'tutorials' ? <TutorialsPanel onPick={onTutorial} onClose={() => setPanel(null)} /> : null}
      {panel === 'guide' ? <HowToRide onClose={() => setPanel(null)} /> : null}
      {panel === 'book' ? <RuleBook onClose={() => setPanel(null)} /> : null}
      {panel === 'quiz' ? <SignQuiz onClose={() => setPanel(null)} /> : null}
      {panel === 'cert' ? <Certificate onClose={() => setPanel(null)} /> : null}
      {panel === 'settings' ? (
        <Modal labelledBy="settings-title">
          <h2 id="settings-title" className="mb-2 text-2xl font-black">Settings</h2>
          <SettingsPanel />
          <Button className="mt-4 w-full" onClick={() => setPanel(null)}>
            Done
          </Button>
        </Modal>
      ) : null}
    </div>
  )
}

export function PauseMenu({ onResume, onMenu }: { onResume: () => void; onMenu: () => void }) {
  const [panel, setPanel] = useState<null | 'book' | 'guide'>(null)
  if (panel === 'book') return <RuleBook onClose={() => setPanel(null)} />
  if (panel === 'guide') return <HowToRide onClose={() => setPanel(null)} />
  return (
    <Modal labelledBy="pause-title">
      <h2 id="pause-title" className="text-2xl font-black">Paused</h2>
      <SettingsPanel />
      <div className="mt-4 grid gap-2">
        <Button onClick={onResume} autoFocus>
          Resume
        </Button>
        <Button tone="ghost" onClick={() => setPanel('guide')}>
          🏍️ How to ride
        </Button>
        <Button tone="ghost" onClick={() => setPanel('book')}>
          📖 Rule book
        </Button>
        <Button tone="ghost" onClick={onMenu}>
          Quit to menu
        </Button>
      </div>
    </Modal>
  )
}
