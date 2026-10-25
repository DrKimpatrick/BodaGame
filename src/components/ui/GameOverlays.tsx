import { useEffect, useRef, useState } from 'react'
import { downloadEvents } from '../../roadRules/analytics'
import { BILL, DECISION_TIME_S, JAIL_MEAL } from '../../roadRules/constants'
import { LIVE_RULES, type LiveRuleId } from '../../roadRules/liveRules'
import { SCENARIO_BY_ID } from '../../roadRules/scenarios'
import { speak } from '../../roadRules/fx/speech'
import { useRoadRulesStore, type Overlay } from '../../store/useRoadRulesStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Button, Chip, Modal, SignImg } from './primitives'
import { fmtUgx } from './format'

/** Road encounter card: the scene, three shuffled choices and an optional 12 s timer. */
function EncounterCard({ ov }: { ov: Extract<Overlay, { type: 'card' }> }) {
  const answer = useRoadRulesStore((s) => s.answerCard)
  const timed = useSettingsStore((s) => s.timer)
  const [left, setLeft] = useState(DECISION_TIME_S)
  const answered = useRef(false)
  const sc = ov.scenario

  useEffect(() => {
    if (!timed) return
    let last = performance.now()
    let remaining = DECISION_TIME_S
    // Counts only visible time: a hidden tab or locked phone does not burn the timer.
    const id = setInterval(() => {
      const now = performance.now()
      if (document.visibilityState === 'visible') remaining -= (now - last) / 1000
      last = now
      setLeft(Math.max(0, remaining))
      if (remaining <= 0 && !answered.current) {
        answered.current = true
        clearInterval(id)
        answer(null)
      }
    }, 100)
    return () => clearInterval(id)
  }, [sc.id, timed, answer])

  const choose = (i: number) => {
    if (answered.current) return
    answered.current = true
    answer(i)
  }

  return (
    <Modal labelledBy="card-title">
      <div className="animate-[cardIn_.3s_ease-out]">
        <div className="relative -mx-5 -mt-5 mb-4 h-40 overflow-hidden rounded-t-3xl bg-linear-to-b from-[#232c47] via-[#6f4658] to-[#e9873a]">
          <div className="absolute inset-x-0 bottom-0 h-14 border-t-4 border-[#3b3c43] bg-[#26272c]">
            <div className="lane-stripe absolute inset-x-0 bottom-5 h-1.5" />
          </div>
          <div className="absolute left-1/2 top-4 -translate-x-1/2 animate-[signDrop_.5s_cubic-bezier(.2,.9,.3,1.2)_both]">
            <SignImg sign={sc.sign} className="h-24 w-24" label="" />
          </div>
          <div className="absolute bottom-3 right-4 text-4xl leading-none">{sc.actors.join('')}</div>
          <p className="absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider">
            {sc.kind === 'sign' ? 'Road sign' : 'Road rule'} · {sc.name}
          </p>
        </div>
        {timed ? (
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-[width] duration-100 ${left < 4 ? 'bg-rose-500' : 'bg-[#f26b1d]'}`}
              style={{ width: `${(left / DECISION_TIME_S) * 100}%` }}
            />
          </div>
        ) : null}
        <h2 id="card-title" className="text-lg font-bold leading-snug">
          {sc.setup}
        </h2>
        <p className="mb-3 mt-1 text-sm text-zinc-400">What do you do?</p>
        <div className="flex flex-col gap-2.5">
          {ov.order.map((i, n) => (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              className="min-h-14 rounded-xl border-l-8 border-[#f26b1d] bg-[#f2f2ee] px-4 py-3 text-left text-[16px] font-semibold leading-snug text-zinc-950 transition active:scale-[.985]"
            >
              <span className="mr-2 font-black text-[#f26b1d]">{n + 1}</span>
              {sc.options[i]!.text}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => speak(`${sc.setup}. ${ov.order.map((i, n) => `Option ${n + 1}: ${sc.options[i]!.text}`).join('. ')}`, { force: true })}
          className="mt-3 text-sm font-bold text-zinc-400 underline-offset-2 hover:underline"
        >
          🔊 Read it to me
        </button>
      </div>
    </Modal>
  )
}

function ResultCard({ ov }: { ov: Extract<Overlay, { type: 'result' }> }) {
  const cont = useRoadRulesStore((s) => s.continueOverlay)
  const life = useRoadRulesStore((s) => s.rr?.life ?? 0)
  const learner = useRoadRulesStore((s) => s.rr?.difficulty === 'learner')
  const o = ov.outcome
  return (
    <Modal labelledBy="result-title" tone={o.ok ? 'good' : 'bad'}>
      <div className="flex items-start gap-4">
        <SignImg sign={ov.sign} className="h-16 w-16" />
        <div className={`border-l-8 pl-3 ${o.ok ? 'border-emerald-400' : 'border-rose-500'}`}>
          <p className="text-xs font-extrabold uppercase tracking-widest text-zinc-400">{ov.title}</p>
          <h2 id="result-title" className="text-2xl font-black">
            {o.ok ? 'Right move' : o.timedOut ? 'You froze' : 'Wrong move'}
          </h2>
        </div>
      </div>
      <p className="mt-3 text-[17px] leading-relaxed">{o.outcome}</p>
      <div className="my-3 flex flex-wrap gap-2">
        {o.earned ? <Chip tone="up">+{fmtUgx(o.earned)}</Chip> : null}
        {o.fined ? <Chip tone="down">−{fmtUgx(o.fined)} fine</Chip> : null}
        {o.lifeDelta ? <Chip tone={o.lifeDelta > 0 ? 'up' : 'down'}>{o.lifeDelta > 0 ? '+' : ''}{o.lifeDelta} life</Chip> : null}
        {o.jailDays ? <Chip tone="down">{o.jailDays} day{o.jailDays > 1 ? 's' : ''} in jail</Chip> : null}
        {learner && !o.ok ? <Chip>Learner: no penalty</Chip> : null}
      </div>
      <div className="rounded-2xl bg-white/5 p-4">
        <p className="mb-1 text-xs font-extrabold uppercase tracking-widest text-[#f5c518]">The rule</p>
        <p className="text-[16px] leading-relaxed">{o.rule}</p>
      </div>
      <Button className="mt-5 w-full" onClick={cont} autoFocus>
        {ov.pendingJail > 0 ? 'Go to jail' : life <= 0 ? 'Continue' : 'Ride on'}
      </Button>
    </Modal>
  )
}

function JailScreen({ ov }: { ov: Extract<Overlay, { type: 'jail' }> }) {
  const cont = useRoadRulesStore((s) => s.continueOverlay)
  const gentle = useSettingsStore((s) => s.gentle)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setShown((n) => (n >= ov.log.length ? n : n + 1)), 650)
    return () => clearInterval(id)
  }, [ov.log])
  const lost = ov.log.flatMap((d) => d.lost)
  return (
    <Modal labelledBy="jail-title" tone="bad">
      <p className="text-5xl">🚔</p>
      <h2 id="jail-title" className="mt-2 text-2xl font-black">
        {ov.days} day{ov.days > 1 ? 's' : ''} in jail
      </h2>
      <p className="mt-1 text-zinc-300">While you are inside, nobody earns. A neighbour feeds your children for {fmtUgx(JAIL_MEAL)} a day if you have savings.</p>
      <ul className="mt-4 space-y-2">
        {ov.log.slice(0, shown).map((d) => (
          <li key={d.day} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm animate-[toastIn_.25s_ease-out]">
            <span className="font-bold">Day {d.day}</span>
            <span className={d.neighbourPaid ? 'text-zinc-300' : 'text-rose-300'}>
              {d.neighbourPaid ? `Neighbour paid ${fmtUgx(JAIL_MEAL)}` : 'No money for food'} · children −{d.careLoss}
            </span>
          </li>
        ))}
      </ul>
      {shown >= ov.log.length && lost.length > 0 ? (
        <div className="mt-4 rounded-2xl border-l-8 border-rose-500 bg-rose-950/60 p-4">
          <p className="font-bold">
            {gentle
              ? `${lost.join(' and ')} went to live with relatives while you were in jail.`
              : `${lost.join(' and ')} did not survive while you were in jail.`}
          </p>
        </div>
      ) : null}
      <Button className="mt-5 w-full" onClick={cont} disabled={shown < ov.log.length}>
        Back to work
      </Button>
    </Modal>
  )
}

function ShiftSummaryScreen({ ov }: { ov: Extract<Overlay, { type: 'shift' }> }) {
  const cont = useRoadRulesStore((s) => s.continueOverlay)
  const gentle = useSettingsStore((s) => s.gentle)
  const { summary: s } = ov
  const L = s.ledger
  const rows: [string, number][] = [
    ['Fares', L.fares],
    ['Bonuses for right moves', L.bonuses],
    ['Fines', -L.fines],
    ['Neighbour (jail meals)', -L.jailMeals],
    ['Household bill', -s.billPaid],
  ]
  const next = { clear: '☀️ a clear day', rain: '🌧️ heavy rain: brakes grip less, slow down early', dusk: '🌆 dusk: switch your headlight on (💡 or L)' }[ov.nextWeather]
  return (
    <Modal labelledBy="shift-title" wide>
      <p className="text-xs font-extrabold uppercase tracking-widest text-zinc-400">End of shift {s.shift}</p>
      <h2 id="shift-title" className="text-2xl font-black">
        {s.billPaid >= s.billDue ? 'Bills paid. The children ate well.' : s.billPaid > 0 ? 'You could only pay part of the bills.' : 'No money for the bills tonight.'}
      </h2>
      <div className="mt-4 rounded-2xl bg-white/5 px-4 py-1">
        {rows.map(([label, v]) => (
          <div key={label} className="flex justify-between border-b border-white/5 py-2.5 last:border-0">
            <span className="text-zinc-300">{label}</span>
            <span className={`font-mono font-bold ${v > 0 ? 'text-emerald-300' : v < 0 ? 'text-rose-300' : 'text-zinc-500'}`}>
              {v > 0 ? '+' : v < 0 ? '−' : ''}
              {fmtUgx(Math.abs(v))}
            </span>
          </div>
        ))}
        <div className="flex justify-between py-2.5 font-black">
          <span>Cash carried to tomorrow</span>
          <span className="font-mono text-[#f5c518]">{fmtUgx(s.cashAfter)}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">The household bill is {fmtUgx(BILL)} per shift. Fuel and repairs come out of your cash as you ride.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {s.kids.map((k) => (
          <div key={k.name} className="rounded-2xl bg-white/5 p-3">
            <p className="font-bold">🧒 {k.name}</p>
            {k.lost ? (
              <p className="text-sm text-rose-300">{gentle ? 'Has gone to live with relatives.' : 'Did not survive. The bills went unpaid too long.'}</p>
            ) : !k.present ? (
              <p className="text-sm text-zinc-500">{gentle ? 'Living with relatives.' : 'Gone.'}</p>
            ) : (
              <p className={`text-sm font-bold ${k.after >= k.before ? 'text-emerald-300' : 'text-rose-300'}`}>
                Care {k.before} → {k.after}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip tone="up">+{s.lifeRest} life from rest</Chip>
        <Chip>Right {L.right} · Wrong {L.wrong}</Chip>
        {L.wrong === 0 ? <Chip tone="up">⭐ Clean shift</Chip> : null}
      </div>
      <p className="mt-4 rounded-2xl bg-indigo-950/60 p-3 text-sm">Next shift: {next}</p>
      <Button className="mt-5 w-full" onClick={cont} autoFocus>
        Start the next shift
      </Button>
    </Modal>
  )
}

function missedLabel(id: string): { name: string; sign: string; rule: string } {
  if (id.startsWith('live:')) {
    const r = LIVE_RULES[id.slice(5) as LiveRuleId]
    return { name: r.name, sign: r.sign, rule: r.rule }
  }
  const sc = SCENARIO_BY_ID.get(id)
  return sc ? { name: sc.name, sign: sc.sign, rule: sc.rule } : { name: id, sign: 'stop', rule: '' }
}

function GameOverScreen({ ov, onMenu }: { ov: Extract<Overlay, { type: 'gameover' }>; onMenu: () => void }) {
  const rr = useRoadRulesStore((s) => s.rr)
  const start = useRoadRulesStore((s) => s.start)
  const mode = useRoadRulesStore((s) => s.mode)
  const gentle = useSettingsStore((s) => s.gentle)
  const o = ov.over
  let title = 'Game over'
  let body = ''
  if (o.reason === 'broke') {
    title = 'Stranded'
    body = 'You cannot afford the fuel or repairs to keep riding.'
  } else if (o.reason === 'children') {
    title = gentle ? 'Your children are with relatives now' : 'Both children are gone'
    body = gentle
      ? 'Unpaid bills and days in jail meant you could no longer care for them. Every rule you keep protects your family as well as you.'
      : 'Jail and unpaid bills took them. Every rule you keep protects your family as well as you.'
  } else {
    title = gentle ? 'You were badly hurt' : 'You did not survive the road'
    const k = o.kidsPresent
    body = gentle
      ? `You will spend months in hospital and cannot ride. ${k ? `Your ${k === 2 ? 'children go' : 'child goes'} to stay with relatives.` : ''}`
      : k === 2
        ? 'Your two children are now orphans.'
        : k === 1
          ? 'Your remaining child is now an orphan.'
          : 'Your family has lost everyone.'
  }
  return (
    <Modal labelledBy="over-title" wide tone="bad">
      <h2 id="over-title" className="text-3xl font-black">
        {title}
      </h2>
      <p className="mt-2 text-[17px] leading-relaxed text-zinc-200">{body}</p>
      {rr ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip>Shifts: {rr.shift}</Chip>
          <Chip tone="up">Right: {rr.stats.right + rr.stats.goodMoves}</Chip>
          <Chip tone="down">Wrong: {rr.stats.wrong}</Chip>
          <Chip>Best streak: {rr.bestStreak}</Chip>
          <Chip>Days in jail: {rr.totalJailDays}</Chip>
        </div>
      ) : null}
      {rr && rr.missed.length > 0 ? (
        <>
          <h3 className="mt-5 text-lg font-black">Review these</h3>
          <ul className="mt-2 space-y-2">
            {rr.missed.slice(0, 8).map((id) => {
              const m = missedLabel(id)
              return (
                <li key={id} className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
                  <SignImg sign={m.sign} className="h-12 w-12" label="" />
                  <span>
                    <span className="block font-bold">{m.name}</span>
                    <span className="block text-sm leading-snug text-zinc-300">{m.rule}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button onClick={() => start(mode)}>Try again</Button>
        <Button tone="ghost" onClick={onMenu}>
          Main menu
        </Button>
      </div>
      <button type="button" onClick={downloadEvents} className="mt-3 text-sm font-bold text-zinc-400 hover:underline">
        Download the play log (for facilitators)
      </button>
    </Modal>
  )
}

export function GameOverlays({ onMenu }: { onMenu: () => void }) {
  const ov = useRoadRulesStore((s) => s.overlay)
  if (!ov) return null
  switch (ov.type) {
    case 'card':
      return <EncounterCard key={`${ov.scenario.id}-${ov.startedAt}`} ov={ov} />
    case 'result':
      return <ResultCard ov={ov} />
    case 'jail':
      return <JailScreen key={ov.log.length + ov.days} ov={ov} />
    case 'shift':
      return <ShiftSummaryScreen ov={ov} />
    case 'gameover':
      return <GameOverScreen ov={ov} onMenu={onMenu} />
  }
}
