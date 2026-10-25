import { useState } from 'react'
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

export function SettingsPanel() {
  const s = useSettingsStore()
  return (
    <div className="divide-y divide-white/5">
      <Toggle label="Decision timer" hint="12 seconds to answer road encounter cards" checked={s.timer} onChange={(v) => s.set({ timer: v })} />
      <Toggle label="Read aloud" hint="Cards and instructor tips are spoken" checked={s.voice} onChange={(v) => s.set({ voice: v })} />
      <Toggle label="Sound" checked={s.sound} onChange={(v) => s.set({ sound: v })} />
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

export function StartScreen({ onStart }: { onStart: (mode: GameMode) => void }) {
  const [mode, setMode] = useState<GameMode>('learn')
  const [panel, setPanel] = useState<null | 'book' | 'quiz' | 'cert' | 'settings'>(null)
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

          <Button className="mt-5 w-full text-lg" onClick={() => onStart(mode)}>
            {mode === 'learn' ? 'Start lesson' : mode === 'shift' ? 'Start shift' : 'Ride'}
          </Button>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Laptop: W A S D or arrows · L headlight · V camera · Esc pause. Phone and tablet: on-screen buttons.
          </p>
          {progress.bestShift > 0 ? <p className="mt-1 text-center text-xs text-zinc-500">Best: reached shift {progress.bestShift}</p> : null}
        </main>
      </div>

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
  const [panel, setPanel] = useState<null | 'book'>(null)
  if (panel === 'book') return <RuleBook onClose={() => setPanel(null)} />
  return (
    <Modal labelledBy="pause-title">
      <h2 id="pause-title" className="text-2xl font-black">Paused</h2>
      <SettingsPanel />
      <div className="mt-4 grid gap-2">
        <Button onClick={onResume} autoFocus>
          Resume
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
