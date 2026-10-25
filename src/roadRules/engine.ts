/**
 * Road Rules engine: pure functions, no React / DOM / Three.js, so the same scoring can be ported to the
 * VR simulator. Every function returns a new state; nothing is mutated.
 */
import {
  BILL,
  CARE_MAX,
  DEFAULT_REWARD,
  GOOD_MOVE_BONUS,
  GOOD_MOVE_LIFE,
  JAIL_CARE_FED,
  JAIL_CARE_HUNGRY,
  JAIL_MEAL,
  KID_NAMES,
  LIFE_MAX,
  REST_LIFE,
  RIGHT_MOVE_LIFE,
  START_CARE,
  START_CASH,
  START_LIFE,
  STREAK_BONUS_AT,
  STREAK_MULTIPLIER,
} from './constants.ts'
import type { LiveRule } from './liveRules.ts'

export type ScenarioOption = {
  text: string
  ok: boolean
  outcome: string
  fine: number
  life: number
  jail: number
}

export type ScenarioTrigger = 'road' | 'pickup' | 'anytime'

export type Scenario = {
  id: string
  kind: 'sign' | 'rule'
  sign: string
  name: string
  setup: string
  actors: string[]
  rule: string
  options: ScenarioOption[]
  reward: number
  trigger: ScenarioTrigger
  source: string
}

/** `learner`: mistakes are explained but cost nothing. `shift`: full consequences. */
export type Difficulty = 'learner' | 'shift'

export type Kid = {
  name: string
  care: number
  /** False once care reached 0 (died, or in gentle mode: went to live with relatives). */
  present: boolean
  lostCause?: 'jail' | 'bills'
}

export type ShiftLedger = {
  fares: number
  bonuses: number
  fines: number
  jailMeals: number
  jailDays: number
  right: number
  wrong: number
}

export type RRState = {
  difficulty: Difficulty
  cash: number
  life: number
  kids: Kid[]
  streak: number
  bestStreak: number
  shift: number
  totalJailDays: number
  /** Ids (scenario or live rule) the rider got wrong, most recent first, unique. */
  missed: string[]
  ledger: ShiftLedger
  stats: { right: number; wrong: number; timeouts: number; goodMoves: number }
}

export type Outcome = {
  ok: boolean
  /** Money credited (fare / bonus). */
  earned: number
  /** Money actually taken (fine capped at cash on hand). */
  fined: number
  lifeDelta: number
  jailDays: number
  outcome: string
  rule: string
  timedOut: boolean
}

export function emptyLedger(): ShiftLedger {
  return { fares: 0, bonuses: 0, fines: 0, jailMeals: 0, jailDays: 0, right: 0, wrong: 0 }
}

export function newGame(difficulty: Difficulty, cash = START_CASH): RRState {
  return {
    difficulty,
    cash,
    life: START_LIFE,
    kids: KID_NAMES.map((name) => ({ name, care: START_CARE, present: true })),
    streak: 0,
    bestStreak: 0,
    shift: 1,
    totalJailDays: 0,
    missed: [],
    ledger: emptyLedger(),
    stats: { right: 0, wrong: 0, timeouts: 0, goodMoves: 0 },
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

function addMissed(missed: string[], id: string): string[] {
  return [id, ...missed.filter((m) => m !== id)]
}

/** Integrity rules for scenario content (kept as tests). */
export function validateScenario(s: Scenario): string[] {
  const errs: string[] = []
  if (!s.id) errs.push('missing id')
  if (!s.setup.trim()) errs.push(`${s.id}: empty setup`)
  if (!s.rule.trim()) errs.push(`${s.id}: empty rule`)
  if (s.options.length < 3) errs.push(`${s.id}: fewer than 3 options`)
  const ok = s.options.filter((o) => o.ok).length
  if (ok !== 1) errs.push(`${s.id}: ${ok} correct options (need exactly 1)`)
  for (const o of s.options) {
    if (o.fine < 0 || o.life < 0 || o.jail < 0 || o.jail > 7) errs.push(`${s.id}: bad penalty values`)
  }
  return errs
}

function applyRight(state: RRState, base: number): { state: RRState; earned: number } {
  const streak = state.streak + 1
  const earned = Math.round(streak >= STREAK_BONUS_AT ? base * STREAK_MULTIPLIER : base)
  return {
    earned,
    state: {
      ...state,
      cash: state.cash + earned,
      life: clamp(state.life + RIGHT_MOVE_LIFE, 0, LIFE_MAX),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      stats: { ...state.stats, right: state.stats.right + 1 },
      ledger: { ...state.ledger, bonuses: state.ledger.bonuses + earned, right: state.ledger.right + 1 },
    },
  }
}

function applyWrong(
  state: RRState,
  id: string,
  fine: number,
  life: number,
  jail: number,
  timedOut: boolean,
): { state: RRState; fined: number; lifeDelta: number; jailDays: number } {
  const learner = state.difficulty === 'learner'
  const fined = learner ? 0 : Math.min(Math.max(0, state.cash), fine)
  const lifeLoss = learner ? 0 : life
  const jailDays = learner ? 0 : jail
  return {
    fined,
    lifeDelta: -lifeLoss,
    jailDays,
    state: {
      ...state,
      cash: state.cash - fined,
      life: clamp(state.life - lifeLoss, 0, LIFE_MAX),
      streak: 0,
      missed: addMissed(state.missed, id),
      stats: {
        ...state.stats,
        wrong: state.stats.wrong + 1,
        timeouts: state.stats.timeouts + (timedOut ? 1 : 0),
      },
      ledger: { ...state.ledger, fines: state.ledger.fines + fined, wrong: state.ledger.wrong + 1 },
    },
  }
}

/**
 * Resolve a card choice. `optionIndex` is into `scenario.options` (data order); `null` means the timer ran
 * out, which counts as the first wrong option ("you froze").
 */
export function resolveChoice(
  state: RRState,
  scenario: Scenario,
  optionIndex: number | null,
): { state: RRState; outcome: Outcome } {
  const timedOut = optionIndex == null
  const opt = timedOut
    ? scenario.options.find((o) => !o.ok)!
    : scenario.options[optionIndex]
  if (!opt) throw new Error(`Option ${optionIndex} not in ${scenario.id}`)
  if (opt.ok) {
    const r = applyRight(state, scenario.reward || DEFAULT_REWARD)
    return {
      state: r.state,
      outcome: {
        ok: true,
        earned: r.earned,
        fined: 0,
        lifeDelta: RIGHT_MOVE_LIFE,
        jailDays: 0,
        outcome: opt.outcome,
        rule: scenario.rule,
        timedOut: false,
      },
    }
  }
  const w = applyWrong(state, scenario.id, opt.fine, opt.life, opt.jail, timedOut)
  return {
    state: w.state,
    outcome: {
      ok: false,
      earned: 0,
      fined: w.fined,
      lifeDelta: w.lifeDelta,
      jailDays: w.jailDays,
      outcome: timedOut ? `You froze. ${opt.outcome}` : opt.outcome,
      rule: scenario.rule,
      timedOut,
    },
  }
}

/** A rule broken while riding. */
export function resolveViolation(state: RRState, rule: LiveRule): { state: RRState; outcome: Outcome } {
  const w = applyWrong(state, `live:${rule.id}`, rule.fine, rule.life, rule.jail, false)
  return {
    state: w.state,
    outcome: {
      ok: false,
      earned: 0,
      fined: w.fined,
      lifeDelta: w.lifeDelta,
      jailDays: w.jailDays,
      outcome: rule.outcome,
      rule: rule.rule,
      timedOut: false,
    },
  }
}

/** A rule obeyed while riding (clean stop, giving way). Small reward; builds the streak. */
export function resolveGoodMove(state: RRState): { state: RRState; earned: number } {
  const streak = state.streak + 1
  const earned = streak >= STREAK_BONUS_AT ? Math.round(GOOD_MOVE_BONUS * STREAK_MULTIPLIER) : GOOD_MOVE_BONUS
  return {
    earned,
    state: {
      ...state,
      cash: state.cash + earned,
      life: clamp(state.life + GOOD_MOVE_LIFE, 0, LIFE_MAX),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      stats: { ...state.stats, goodMoves: state.stats.goodMoves + 1 },
      ledger: { ...state.ledger, bonuses: state.ledger.bonuses + earned },
    },
  }
}

/** Fare from a completed passenger trip. */
export function addFare(state: RRState, fare: number): RRState {
  const f = Math.max(0, Math.round(fare))
  return { ...state, cash: state.cash + f, ledger: { ...state.ledger, fares: state.ledger.fares + f } }
}

export type JailDay = {
  day: number
  neighbourPaid: boolean
  careLoss: number
  /** Names of children lost on this day. */
  lost: string[]
}

/** Serve `days` in jail. Each day the neighbour is paid if savings allow, otherwise the children go hungry. */
export function serveJail(state: RRState, days: number): { state: RRState; log: JailDay[] } {
  let s = state
  const log: JailDay[] = []
  for (let d = 1; d <= days; d++) {
    const paid = s.cash >= JAIL_MEAL
    const careLoss = paid ? JAIL_CARE_FED : JAIL_CARE_HUNGRY
    const lost: string[] = []
    const kids = s.kids.map((k) => {
      if (!k.present) return k
      const care = Math.max(0, k.care - careLoss)
      if (care === 0) {
        lost.push(k.name)
        return { ...k, care, present: false, lostCause: 'jail' as const }
      }
      return { ...k, care }
    })
    s = {
      ...s,
      cash: paid ? s.cash - JAIL_MEAL : s.cash,
      kids,
      totalJailDays: s.totalJailDays + 1,
      ledger: {
        ...s.ledger,
        jailMeals: s.ledger.jailMeals + (paid ? JAIL_MEAL : 0),
        jailDays: s.ledger.jailDays + 1,
      },
    }
    log.push({ day: d, neighbourPaid: paid, careLoss, lost })
  }
  return { state: s, log }
}

export type ShiftSummary = {
  shift: number
  ledger: ShiftLedger
  billDue: number
  billPaid: number
  /** Per child: care change and whether they were lost this shift-end. */
  kids: { name: string; before: number; after: number; lost: boolean; present: boolean }[]
  lifeRest: number
  cashAfter: number
}

/** Pay the household bill, update the children, rest, and start the next shift. */
export function endShift(state: RRState): { state: RRState; summary: ShiftSummary } {
  const ratio = Math.min(1, Math.max(0, state.cash) / BILL)
  const billPaid = Math.round(ratio * BILL)
  const delta = Math.round(-15 + 23 * ratio)
  const kidsOut: ShiftSummary['kids'] = []
  const kids = state.kids.map((k) => {
    if (!k.present) {
      kidsOut.push({ name: k.name, before: 0, after: 0, lost: false, present: false })
      return k
    }
    const care = clamp(k.care + delta, 0, CARE_MAX)
    const lost = care === 0
    kidsOut.push({ name: k.name, before: k.care, after: care, lost, present: !lost })
    return lost ? { ...k, care, present: false, lostCause: 'bills' as const } : { ...k, care }
  })
  const lifeAfter = clamp(state.life + REST_LIFE, 0, LIFE_MAX)
  const summary: ShiftSummary = {
    shift: state.shift,
    ledger: state.ledger,
    billDue: BILL,
    billPaid,
    kids: kidsOut,
    lifeRest: lifeAfter - state.life,
    cashAfter: state.cash - billPaid,
  }
  return {
    summary,
    state: {
      ...state,
      cash: state.cash - billPaid,
      kids,
      life: state.life > 0 ? lifeAfter : 0,
      shift: state.shift + 1,
      ledger: emptyLedger(),
    },
  }
}

export type GameOver = { reason: 'rider' | 'children'; kidsPresent: number }

export function checkGameOver(state: RRState): GameOver | null {
  const kidsPresent = state.kids.filter((k) => k.present).length
  if (state.life <= 0) return { reason: 'rider', kidsPresent }
  if (kidsPresent === 0) return { reason: 'children', kidsPresent }
  return null
}

/* ---------- Spaced repetition (Leitner boxes) ---------- */

/** Box 0 = just missed (shown most), box 4 = mastered. */
export type SrsBoxes = Record<string, number>

export const SRS_MAX_BOX = 4

export function srsUpdate(boxes: SrsBoxes, id: string, correct: boolean): SrsBoxes {
  const cur = boxes[id] ?? 1
  return { ...boxes, [id]: correct ? Math.min(SRS_MAX_BOX, cur + 1) : 0 }
}

/**
 * Pick the next scenario: unseen-this-shift first, weighted toward low boxes (missed ones come back more).
 * `rng` returns [0,1).
 */
export function pickScenario(
  pool: Scenario[],
  boxes: SrsBoxes,
  usedThisShift: ReadonlySet<string>,
  triggers: ScenarioTrigger[],
  rng: () => number,
): Scenario | null {
  const eligible = pool.filter((s) => triggers.includes(s.trigger) && !usedThisShift.has(s.id))
  if (eligible.length === 0) return null
  const weights = eligible.map((s) => 2 ** (SRS_MAX_BOX - (boxes[s.id] ?? 1)))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i]!
    if (r < 0) return eligible[i]!
  }
  return eligible[eligible.length - 1]!
}

/** Fisher–Yates on a copy, returning original indices so answers map back to data order. */
export function shuffledOrder(n: number, rng: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = a[i]!
    a[i] = a[j]!
    a[j] = t
  }
  return a
}
