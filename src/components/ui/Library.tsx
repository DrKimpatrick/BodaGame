import { useMemo, useState } from 'react'
import { shuffledOrder } from '../../roadRules/engine'
import { LIVE_RULES } from '../../roadRules/liveRules'
import { SCENARIOS } from '../../roadRules/scenarios'
import { speak } from '../../roadRules/fx/speech'
import { hasCertificateRequirements, useRoadRulesStore } from '../../store/useRoadRulesStore'
import { Button, Modal, SignImg } from './primitives'

/** Rule book, sign quiz (pre-test / post-test) and the Road Ready certificate. */

export function RuleBook({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'riding' | 'cards'>('riding')
  const live = Object.values(LIVE_RULES)
  return (
    <Modal labelledBy="book-title" wide>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="book-title" className="text-2xl font-black">Rule book</h2>
        <button type="button" onClick={onClose} className="h-11 w-11 rounded-full bg-white/10 text-xl" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
        {(['riding', 'cards'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`min-h-11 rounded-lg text-sm font-extrabold ${tab === t ? 'bg-[#f5c518] text-zinc-950' : 'text-zinc-300'}`}
          >
            {t === 'riding' ? 'Checked while you ride' : 'Signs & situations'}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {(tab === 'riding' ? live.map((r) => ({ id: r.id, name: r.name, sign: r.sign, rule: r.rule })) : SCENARIOS).map((r) => (
          <li key={r.id} className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
            <SignImg sign={r.sign} className="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{r.name}</p>
              <p className="text-sm leading-snug text-zinc-300">{r.rule}</p>
            </div>
            <button type="button" aria-label={`Read ${r.name} aloud`} onClick={() => speak(`${r.name}. ${r.rule}`, { force: true })} className="h-11 w-11 shrink-0 rounded-full bg-white/10">
              🔊
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        Signs are drawn in the British-derived style used by the Uganda Highway Code; they are not official artwork. Rules still need checking against the Traffic and Road Safety Act before public use. Fines and jail terms in the game are game values, not real penalties.
      </p>
    </Modal>
  )
}

const QUIZ_LEN = 10

export function SignQuiz({ onClose }: { onClose: () => void }) {
  const record = useRoadRulesStore((s) => s.recordQuiz)
  const scores = useRoadRulesStore((s) => s.progress.quizScores)
  const questions = useMemo(() => {
    const pick = shuffledOrder(SCENARIOS.length, Math.random).slice(0, QUIZ_LEN)
    return pick.map((i) => {
      const sc = SCENARIOS[i]!
      return { sc, order: shuffledOrder(sc.options.length, Math.random) }
    })
  }, [])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const done = idx >= questions.length
  const q = questions[idx]

  const choose = (i: number) => {
    if (picked != null || !q) return
    setPicked(i)
    if (q.sc.options[i]!.ok) setScore((s) => s + 1)
  }
  const next = () => {
    const last = idx + 1 >= questions.length
    if (last) record(score, questions.length)
    setIdx(idx + 1)
    setPicked(null)
  }
  const first = scores[0]
  return (
    <Modal labelledBy="quiz-title">
      {done ? (
        <div className="text-center">
          <p className="text-6xl">{score / questions.length >= 0.8 ? '🏆' : '📘'}</p>
          <h2 id="quiz-title" className="mt-2 text-2xl font-black">
            {score} / {questions.length}
          </h2>
          <p className="mt-2 text-zinc-300">
            {score / questions.length >= 0.8 ? 'Excellent. You know your road rules.' : 'Ride a few shifts and try again: missed rules come back more often.'}
          </p>
          {first && scores.length > 1 ? (
            <p className="mt-2 text-sm text-emerald-300">
              First quiz: {first.score}/{first.total} → now {score}/{questions.length}
            </p>
          ) : null}
          <Button className="mt-5 w-full" onClick={onClose} autoFocus>
            Done
          </Button>
        </div>
      ) : q ? (
        <>
          <div className="mb-3 flex items-center justify-between text-sm font-bold text-zinc-400">
            <span id="quiz-title">Sign quiz</span>
            <span>
              {idx + 1} / {questions.length} · Score {score}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <SignImg sign={q.sc.sign} className="h-20 w-20" />
            <p className="text-[17px] font-semibold leading-snug">{q.sc.setup}</p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {q.order.map((i) => {
              const o = q.sc.options[i]!
              const state = picked == null ? '' : o.ok ? 'ring-4 ring-emerald-400' : picked === i ? 'ring-4 ring-rose-500 opacity-80' : 'opacity-50'
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => choose(i)}
                  className={`min-h-14 rounded-xl bg-[#f2f2ee] px-4 py-3 text-left font-semibold text-zinc-950 transition ${state}`}
                >
                  {o.text}
                </button>
              )
            })}
          </div>
          {picked != null ? (
            <div className="mt-4 rounded-2xl bg-white/5 p-3 text-[15px] leading-relaxed">
              <p className="mb-1 font-extrabold text-[#f5c518]">{q.sc.options[picked]!.ok ? 'Correct' : 'Not quite'}</p>
              {q.sc.rule}
            </div>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button tone="ghost" className="flex-1" onClick={onClose}>
              Stop
            </Button>
            <Button className="flex-1" onClick={next} disabled={picked == null}>
              {idx + 1 >= questions.length ? 'Finish' : 'Next'}
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  )
}

export function Certificate({ onClose }: { onClose: () => void }) {
  const progress = useRoadRulesStore((s) => s.progress)
  const setName = useRoadRulesStore((s) => s.setCertificateName)
  const [name, setLocal] = useState(progress.certificateName ?? '')
  const earned = hasCertificateRequirements(progress)
  const bestQuiz = Math.max(0, ...progress.quizScores.map((q) => Math.round((q.score / q.total) * 100)))
  return (
    <Modal labelledBy="cert-title" wide>
      <h2 id="cert-title" className="text-2xl font-black">Road Ready certificate</h2>
      {earned ? (
        <>
          <label className="mt-3 block text-sm font-bold text-zinc-300">
            Name on the certificate
            <input
              value={name}
              onChange={(e) => setLocal(e.target.value)}
              onBlur={() => setName(name)}
              maxLength={40}
              className="mt-1 block min-h-12 w-full rounded-xl bg-white/10 px-3 text-lg text-white"
            />
          </label>
          <div className="mt-4 rounded-2xl border-4 border-double border-[#f5c518] bg-[#fffbea] p-6 text-center text-zinc-900 print:border-black">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#b45309]">Women on Wheels</p>
            <p className="mt-2 text-3xl font-black">Road Ready</p>
            <p className="mt-3 text-sm">This certifies that</p>
            <p className="mt-1 text-2xl font-black italic">{name || '________'}</p>
            <p className="mt-3 text-sm leading-relaxed">
              completed a clean riding shift and scored {bestQuiz}% on the road sign quiz in the Road Rules training game.
            </p>
            <p className="mt-4 text-xs text-zinc-500">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · Training record only, not a riding permit.</p>
          </div>
          <div className="mt-4 flex gap-2">
            <Button tone="ghost" className="flex-1" onClick={onClose}>
              Close
            </Button>
            <Button className="flex-1" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-zinc-300">Earn it by doing both:</p>
          <ul className="mt-3 space-y-2">
            <li className="rounded-xl bg-white/5 p-3">{progress.cleanShifts >= 1 ? '✅' : '⬜'} Finish a shift with no mistakes</li>
            <li className="rounded-xl bg-white/5 p-3">{bestQuiz >= 80 ? '✅' : '⬜'} Score 80% or more on the sign quiz (best so far: {bestQuiz}%)</li>
          </ul>
          <Button className="mt-5 w-full" onClick={onClose}>
            OK
          </Button>
        </>
      )}
    </Modal>
  )
}
