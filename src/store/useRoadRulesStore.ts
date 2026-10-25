import { create } from 'zustand'
import { logEvent, newSessionId } from '../roadRules/analytics'
import { DELIVERIES_PER_SHIFT, ENCOUNTERS_PER_SHIFT, START_CASH } from '../roadRules/constants'
import {
  addFare,
  checkGameOver,
  endShift,
  newGame,
  pickScenario,
  resolveChoice,
  resolveGoodMove,
  resolveViolation,
  serveJail,
  shuffledOrder,
  srsUpdate,
  type GameOver,
  type JailDay,
  type Outcome,
  type RRState,
  type Scenario,
  type ScenarioTrigger,
  type ShiftSummary,
  type SrsBoxes,
} from '../roadRules/engine'
import { playChime, playThud, playWhistle } from '../roadRules/fx/sfx'
import { speak } from '../roadRules/fx/speech'
import { LIVE_RULES, type LiveRuleId } from '../roadRules/liveRules'
import { SCENARIOS } from '../roadRules/scenarios'
import { worldClock } from '../roadRules/world/telemetry'
import { useGameStore, type Weather } from './useGameStore'

/**
 * Women on Wheels game state: wraps the pure engine, keeps the ride wallet (useGameStore.money) in sync
 * with the engine's cash, drives the overlays (cards, results, jail, shift end, game over) and the
 * non-blocking toasts for live rule checks.
 */

export type GameMode = 'learn' | 'shift' | 'free'

export type Overlay =
  | { type: 'card'; scenario: Scenario; order: number[]; startedAt: number }
  | {
      type: 'result'
      title: string
      sign: string
      outcome: Outcome
      /** Jail days still to serve after this screen. */
      pendingJail: number
    }
  | { type: 'jail'; days: number; log: JailDay[] }
  | { type: 'shift'; summary: ShiftSummary; nextWeather: Weather }
  | { type: 'gameover'; over: GameOver | { reason: 'broke' } }

export type Toast = {
  id: number
  tone: 'good' | 'bad' | 'hint'
  title: string
  body: string
  sign?: string
  money?: number
  life?: number
}

type Progress = {
  srs: SrsBoxes
  bestShift: number
  quizScores: { at: number; score: number; total: number }[]
  certificateName: string | null
  cleanShifts: number
}

const PROGRESS_KEY = 'wow-progress-v1'

function loadProgress(): Progress {
  const empty: Progress = { srs: {}, bestShift: 0, quizScores: [], certificateName: null, cleanShifts: 0 }
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Progress>) } : empty
  } catch {
    return empty
  }
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
  } catch {
    /* storage blocked */
  }
}

/** Seconds between road encounter cards while riding. */
const CARD_INTERVAL_S = 38
/** Same live rule cannot fire again within this many seconds. */
const RULE_COOLDOWN_S = 12
const WEATHER_CYCLE: Weather[] = ['clear', 'rain', 'dusk']

type Store = {
  mode: GameMode
  rr: RRState | null
  sessionId: string
  overlay: Overlay | null
  toasts: Toast[]
  progress: Progress
  usedThisShift: string[]
  encountersThisShift: number
  deliveriesThisShift: number
  lastCardAt: number
  ruleCooldown: Partial<Record<LiveRuleId, number>>
  /** Shift end waiting for the current overlay to close. */
  shiftEndPending: boolean
  /** Highest drop-off total already counted (makes `onDelivery` idempotent). */
  lastDeliveryCount: number

  start: (mode: GameMode) => void
  quit: () => void
  presentCard: (triggers: ScenarioTrigger[]) => boolean
  answerCard: (optionIndex: number | null) => void
  reportViolation: (id: LiveRuleId) => void
  reportGoodMove: (id: LiveRuleId) => void
  hint: (text: string, sign?: string) => void
  /** `count` is the ride store's running drop-off total; repeats of the same count are ignored. */
  onDelivery: (count: number) => void
  continueOverlay: () => void
  dismissToast: (id: number) => void
  recordQuiz: (score: number, total: number) => void
  setCertificateName: (name: string) => void
}

let toastId = 1

function setFreeze(on: boolean) {
  useGameStore.getState().setHudModalFreezesWorld(on)
}

/** Apply the engine's cash to the ride wallet (single source of truth stays useGameStore.money). */
function syncWallet(cash: number, label: string) {
  const g = useGameStore.getState()
  const diff = Math.round(cash) - Math.floor(g.money)
  if (diff > 0) g.earnUgx(diff, label)
  else if (diff < 0) g.spendUgx(Math.min(-diff, Math.floor(g.money)), label)
}

/** Engine state with cash refreshed from the wallet (fuel and repairs spend from it too). */
function withWallet(rr: RRState): RRState {
  return { ...rr, cash: Math.floor(useGameStore.getState().money) }
}

function eventBase(get: () => Store) {
  const rr = get().rr
  return {
    sessionId: get().sessionId,
    at: Date.now(),
    shift: rr?.shift ?? 0,
    cash: Math.floor(useGameStore.getState().money),
    life: rr?.life ?? 0,
  }
}

export const useRoadRulesStore = create<Store>((set, get) => {
  const pushToast = (t: Omit<Toast, 'id'>) => {
    const toast = { ...t, id: toastId++ }
    set((s) => ({ toasts: [...s.toasts.slice(-2), toast] }))
    return toast.id
  }

  const finishOrGameOver = (): boolean => {
    const rr = get().rr
    if (!rr) return false
    const over = checkGameOver(rr)
    if (!over) return false
    const p = { ...get().progress, bestShift: Math.max(get().progress.bestShift, rr.shift) }
    saveProgress(p)
    logEvent({ ...eventBase(get), type: 'game_over', detail: over.reason })
    set({ overlay: { type: 'gameover', over }, progress: p })
    setFreeze(true)
    return true
  }

  const openShiftEnd = () => {
    const rr0 = get().rr
    if (!rr0) return
    const before = withWallet(rr0)
    const clean = before.ledger.wrong === 0
    const { state, summary } = endShift(before)
    syncWallet(state.cash, `Household bill (shift ${summary.shift})`)
    const g = useGameStore.getState()
    const idx = WEATHER_CYCLE.indexOf(g.weather)
    const nextWeather = WEATHER_CYCLE[(idx + 1) % WEATHER_CYCLE.length]!
    const progress = {
      ...get().progress,
      bestShift: Math.max(get().progress.bestShift, summary.shift),
      cleanShifts: get().progress.cleanShifts + (clean ? 1 : 0),
    }
    saveProgress(progress)
    logEvent({ ...eventBase(get), type: 'shift_end', detail: JSON.stringify({ billPaid: summary.billPaid, clean }) })
    set({
      rr: state,
      progress,
      overlay: { type: 'shift', summary, nextWeather },
      shiftEndPending: false,
      usedThisShift: [],
      encountersThisShift: 0,
      deliveriesThisShift: 0,
      lastCardAt: worldClock.t,
    })
    setFreeze(true)
  }

  return {
    mode: 'free',
    rr: null,
    sessionId: newSessionId(),
    overlay: null,
    toasts: [],
    progress: loadProgress(),
    usedThisShift: [],
    encountersThisShift: 0,
    deliveriesThisShift: 0,
    lastCardAt: 0,
    ruleCooldown: {},
    shiftEndPending: false,
    lastDeliveryCount: 0,

    start: (mode) => {
      const g = useGameStore.getState()
      g.setEconomy(mode === 'free' ? 'free' : 'rules')
      g.setWeather('clear')
      g.resetSession()
      if (g.headlight) g.toggleHeadlight()
      const rr = mode === 'free' ? null : newGame(mode === 'learn' ? 'learner' : 'shift', START_CASH)
      set({
        mode,
        rr,
        sessionId: newSessionId(),
        overlay: null,
        toasts: [],
        usedThisShift: [],
        encountersThisShift: 0,
        deliveriesThisShift: 0,
        lastCardAt: worldClock.t,
        ruleCooldown: {},
        shiftEndPending: false,
        lastDeliveryCount: useGameStore.getState().rideCompletedDeliveries,
      })
      setFreeze(false)
      if (mode === 'learn') {
        speak(
          'Hello, I am Mama Sarah, your riding instructor. Pick up your passenger, keep left, and watch the signs. I will warn you before each junction.',
        )
      }
    },

    quit: () => {
      set({ overlay: null, toasts: [], rr: null })
      setFreeze(false)
    },

    presentCard: (triggers) => {
      const s = get()
      if (!s.rr || s.overlay || s.encountersThisShift >= ENCOUNTERS_PER_SHIFT) return false
      if (useGameStore.getState().hudModalFreezesWorld) return false
      const sc = pickScenario(SCENARIOS, s.progress.srs, new Set(s.usedThisShift), triggers, Math.random)
      if (!sc) return false
      set({
        overlay: { type: 'card', scenario: sc, order: shuffledOrder(sc.options.length, Math.random), startedAt: performance.now() },
        usedThisShift: [...s.usedThisShift, sc.id],
        encountersThisShift: s.encountersThisShift + 1,
        lastCardAt: worldClock.t,
      })
      setFreeze(true)
      speak(`${sc.setup} What do you do?`)
      return true
    },

    answerCard: (optionIndex) => {
      const s = get()
      if (s.overlay?.type !== 'card' || !s.rr) return
      const { scenario, startedAt } = s.overlay
      const { state, outcome } = resolveChoice(withWallet(s.rr), scenario, optionIndex)
      syncWallet(state.cash, outcome.ok ? `Right call: ${scenario.name}` : `Fine: ${scenario.name}`)
      const progress = { ...s.progress, srs: srsUpdate(s.progress.srs, scenario.id, outcome.ok) }
      saveProgress(progress)
      logEvent({
        ...eventBase(get),
        type: 'card',
        scenarioId: scenario.id,
        chosenOption: optionIndex == null ? undefined : scenario.options[optionIndex]?.text,
        correct: outcome.ok,
        timedOut: outcome.timedOut,
        timeToAnswerMs: Math.round(performance.now() - startedAt),
        life: state.life,
      })
      if (outcome.ok) playChime()
      else playWhistle()
      speak(`${outcome.outcome} ${outcome.ok ? '' : scenario.rule}`)
      set({
        rr: state,
        progress,
        overlay: {
          type: 'result',
          title: scenario.name,
          sign: scenario.sign,
          outcome,
          pendingJail: outcome.jailDays,
        },
      })
    },

    reportViolation: (id) => {
      const s = get()
      if (!s.rr || s.overlay) return
      const t = worldClock.t
      const last = s.ruleCooldown[id]
      if (last != null && t - last < RULE_COOLDOWN_S) return
      const rule = LIVE_RULES[id]
      const { state, outcome } = resolveViolation(withWallet(s.rr), rule)
      syncWallet(state.cash, `Fine: ${rule.name}`)
      const progress = { ...s.progress, srs: srsUpdate(s.progress.srs, `live:${id}`, false) }
      saveProgress(progress)
      logEvent({ ...eventBase(get), type: 'violation', scenarioId: `live:${id}`, correct: false, life: state.life })
      set({ rr: state, progress, ruleCooldown: { ...s.ruleCooldown, [id]: t } })
      if (id === 'crash' || id === 'hitPedestrian') playThud()
      playWhistle()

      const learner = state.difficulty === 'learner'
      if (outcome.jailDays > 0 || state.life <= 0) {
        set({ overlay: { type: 'result', title: rule.name, sign: rule.sign, outcome, pendingJail: outcome.jailDays } })
        setFreeze(true)
        speak(`${rule.outcome} ${rule.rule}`)
        return
      }
      pushToast({
        tone: 'bad',
        title: learner ? `Mama Sarah: ${rule.name}` : rule.name,
        body: learner ? rule.rule : `${rule.outcome} ${rule.rule}`,
        sign: rule.sign,
        money: -outcome.fined,
        life: outcome.lifeDelta,
      })
      speak(learner ? `Careful. ${rule.rule}` : `${rule.name}. ${rule.rule}`)
    },

    reportGoodMove: (id) => {
      const s = get()
      if (!s.rr || s.overlay) return
      const rule = LIVE_RULES[id]
      const { state, earned } = resolveGoodMove(withWallet(s.rr))
      syncWallet(state.cash, `Good riding: ${rule.name}`)
      const progress = { ...s.progress, srs: srsUpdate(s.progress.srs, `live:${id}`, true) }
      saveProgress(progress)
      logEvent({ ...eventBase(get), type: 'good_move', scenarioId: `live:${id}`, correct: true, life: state.life })
      set({ rr: state, progress })
      playChime()
      pushToast({ tone: 'good', title: rule.praise ?? 'Well done', body: `Streak ${state.streak}`, sign: rule.sign, money: earned })
      if (state.difficulty === 'learner') speak(rule.praise ?? 'Well done.', { interrupt: false })
    },

    hint: (text, sign) => {
      if (!get().rr || get().overlay) return
      pushToast({ tone: 'hint', title: 'Mama Sarah', body: text, sign })
      speak(text)
    },

    onDelivery: (count) => {
      const s = get()
      if (!s.rr || count <= s.lastDeliveryCount) return
      set({ lastDeliveryCount: count })
      const fare = useGameStore.getState().lastFareUgx
      const rr = addFare(s.rr, fare)
      // The fare is already in the wallet (ride store); only the ledger changes here.
      const deliveries = s.deliveriesThisShift + 1
      set({ rr: { ...rr, cash: Math.floor(useGameStore.getState().money) }, deliveriesThisShift: deliveries })
      if (deliveries >= DELIVERIES_PER_SHIFT) {
        if (get().overlay) set({ shiftEndPending: true })
        else openShiftEnd()
      }
    },

    continueOverlay: () => {
      const s = get()
      const ov = s.overlay
      if (!ov || !s.rr) {
        set({ overlay: null })
        setFreeze(false)
        return
      }
      if (ov.type === 'result' && ov.pendingJail > 0) {
        const { state, log } = serveJail(withWallet(s.rr), ov.pendingJail)
        syncWallet(state.cash, 'Neighbour fed the children')
        set({ rr: state, overlay: { type: 'jail', days: ov.pendingJail, log } })
        return
      }
      if (ov.type === 'gameover') return
      if (ov.type === 'shift') {
        useGameStore.getState().setWeather(ov.nextWeather)
        if (ov.nextWeather === 'dusk' && s.rr.difficulty === 'learner') {
          setTimeout(() => get().hint(LIVE_RULES.lights.hint!, LIVE_RULES.lights.sign), 600)
        }
      }
      if (finishOrGameOver()) return
      set({ overlay: null })
      if (get().shiftEndPending) {
        openShiftEnd()
        return
      }
      setFreeze(false)
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    recordQuiz: (score, total) => {
      const progress = {
        ...get().progress,
        quizScores: [...get().progress.quizScores, { at: Date.now(), score, total }].slice(-20),
      }
      saveProgress(progress)
      logEvent({ ...eventBase(get), type: 'quiz', detail: `${score}/${total}` })
      set({ progress })
    },

    setCertificateName: (name) => {
      const progress = { ...get().progress, certificateName: name.trim() || null }
      saveProgress(progress)
      set({ progress })
    },
  }
})

/** True when the player has earned the Road Ready certificate. */
export function hasCertificateRequirements(p: Progress): boolean {
  const bestQuiz = Math.max(0, ...p.quizScores.map((q) => q.score / q.total))
  return p.cleanShifts >= 1 && bestQuiz >= 0.8
}

export const CARD_INTERVAL = CARD_INTERVAL_S
