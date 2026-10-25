/**
 * Rules engine tests (section 7 of the handoff). Run: npm run test:rules
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BILL, JAIL_MEAL, START_CARE, realisticFare } from './constants.ts'
import {
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
  validateScenario,
  type RRState,
  type Scenario,
} from './engine.ts'
import { LIVE_RULES } from './liveRules.ts'
import { SCENARIOS } from './scenarios.ts'

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const okIndex = (s: Scenario) => s.options.findIndex((o) => o.ok)
const badIndex = (s: Scenario) => s.options.findIndex((o) => !o.ok)

test('every scenario keeps the invariants', () => {
  const errs = SCENARIOS.flatMap(validateScenario)
  assert.deepEqual(errs, [])
  assert.ok(SCENARIOS.length >= 24)
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length, 'ids are unique')
})

test('right move pays the reward, +6 life, streak bonus from 3', () => {
  const s0 = { ...newGame('shift'), life: 50 }
  const sc = SCENARIOS[0]!
  let st: RRState = s0
  const earned: number[] = []
  for (let i = 0; i < 4; i++) {
    const r = resolveChoice(st, sc, okIndex(sc))
    earned.push(r.outcome.earned)
    st = r.state
  }
  assert.deepEqual(earned, [sc.reward, sc.reward, sc.reward * 1.5, sc.reward * 1.5])
  assert.equal(st.life, 74)
  assert.equal(st.streak, 4)
})

test('wrong move: fine capped at cash, life loss, jail days, streak reset, missed list', () => {
  const sc = SCENARIOS.find((s) => s.id === 'beer')!
  const s0 = { ...newGame('shift'), cash: 10_000, streak: 5 }
  const r = resolveChoice(s0, sc, 1)
  const opt = sc.options[1]!
  assert.equal(opt.ok, false)
  assert.equal(r.outcome.fined, 10_000)
  assert.equal(r.state.cash, 0)
  assert.equal(r.state.life, 100 - opt.life)
  assert.equal(r.outcome.jailDays, opt.jail)
  assert.equal(r.state.streak, 0)
  assert.deepEqual(r.state.missed, ['beer'])
})

test('timeout counts as the first wrong option and is flagged', () => {
  const sc = SCENARIOS[0]!
  const r = resolveChoice(newGame('shift'), sc, null)
  const first = sc.options[badIndex(sc)]!
  assert.equal(r.outcome.timedOut, true)
  assert.equal(r.outcome.fined, first.fine)
  assert.equal(r.state.stats.timeouts, 1)
})

test('learner mode explains mistakes without costing anything', () => {
  const s0 = newGame('learner')
  const r = resolveViolation(s0, LIVE_RULES.red)
  assert.equal(r.state.cash, s0.cash)
  assert.equal(r.state.life, s0.life)
  assert.equal(r.outcome.jailDays, 0)
  assert.deepEqual(r.state.missed, ['live:red'])
})

test('live violation in a shift costs fine, life and jail', () => {
  const r = resolveViolation(newGame('shift', 100_000), LIVE_RULES.red)
  assert.equal(r.outcome.fined, LIVE_RULES.red.fine)
  assert.equal(r.state.life, 100 - LIVE_RULES.red.life)
  assert.equal(r.outcome.jailDays, LIVE_RULES.red.jail)
})

test('good move pays a small bonus and builds the streak', () => {
  const r = resolveGoodMove(newGame('shift'))
  assert.ok(r.earned > 0)
  assert.equal(r.state.streak, 1)
})

test('jail with savings: neighbour paid, care -3 per day', () => {
  const s0 = { ...newGame('shift'), cash: JAIL_MEAL * 2 }
  const r = serveJail(s0, 2)
  assert.equal(r.state.cash, 0)
  assert.deepEqual(r.state.kids.map((k) => k.care), [START_CARE - 6, START_CARE - 6])
  assert.ok(r.log.every((d) => d.neighbourPaid))
})

test('jail without savings: care -7 per day', () => {
  const s0 = { ...newGame('shift'), cash: 0 }
  const r = serveJail(s0, 3)
  assert.deepEqual(r.state.kids.map((k) => k.care), [START_CARE - 21, START_CARE - 21])
})

test('end of shift with full, partial and zero bill payment', () => {
  const full = endShift({ ...newGame('shift'), cash: BILL + 5_000 })
  assert.equal(full.summary.billPaid, BILL)
  assert.equal(full.state.cash, 5_000)
  assert.equal(full.state.kids[0]!.care, START_CARE + 8)

  const half = endShift({ ...newGame('shift'), cash: BILL / 2 })
  assert.equal(half.summary.billPaid, BILL / 2)
  assert.equal(half.state.kids[0]!.care, START_CARE + Math.round(-15 + 23 * 0.5))

  const zero = endShift({ ...newGame('shift'), cash: 0 })
  assert.equal(zero.summary.billPaid, 0)
  assert.equal(zero.state.kids[0]!.care, START_CARE - 15)
  assert.equal(zero.state.shift, 2)
})

test('child lost by jail, then by unpaid bills, then game over', () => {
  let s: RRState = { ...newGame('shift'), cash: 0 }
  s = { ...s, kids: [{ ...s.kids[0]!, care: 5 }, { ...s.kids[1]!, care: 30 }] }
  s = serveJail(s, 1).state
  assert.equal(s.kids[0]!.present, false)
  assert.equal(s.kids[0]!.lostCause, 'jail')
  assert.equal(checkGameOver(s), null)
  s = { ...s, kids: [s.kids[0]!, { ...s.kids[1]!, care: 10 }] }
  s = endShift(s).state
  assert.equal(s.kids[1]!.lostCause, 'bills')
  assert.deepEqual(checkGameOver(s), { reason: 'children', kidsPresent: 0 })
})

test('rider death with 0, 1 and 2 children present', () => {
  for (const present of [0, 1, 2]) {
    const g = newGame('shift')
    const kids = g.kids.map((k, i) => ({ ...k, present: i < present }))
    const over = checkGameOver({ ...g, kids, life: 0 })
    assert.deepEqual(over, { reason: 'rider', kidsPresent: present })
  }
})

function simulate(pRight: number, seed: number, timeoutOnly = false): { shifts: number; over: boolean } {
  const rng = seeded(seed)
  let s = newGame('shift')
  for (let shift = 0; shift < 40; shift++) {
    for (let e = 0; e < 8; e++) {
      const sc = SCENARIOS[Math.floor(rng() * SCENARIOS.length)]!
      const idx = timeoutOnly ? null : rng() < pRight ? okIndex(sc) : badIndex(sc)
      const r = resolveChoice(s, sc, idx)
      s = r.state
      if (r.outcome.jailDays > 0) s = serveJail(s, r.outcome.jailDays).state
      if (checkGameOver(s)) return { shifts: shift + 1, over: true }
    }
    s = endShift(s).state
    if (checkGameOver(s)) return { shifts: shift + 1, over: true }
  }
  return { shifts: 40, over: false }
}

test('simulated playthroughs never crash or stall', () => {
  assert.equal(simulate(1, 1).over, false, 'a perfect player survives')
  const allWrong = simulate(0, 2)
  assert.ok(allWrong.over && allWrong.shifts <= 2, 'breaking every rule ends it fast')
  assert.ok(simulate(0, 3, true).over, 'always timing out ends the game')
  const mid = [4, 5, 6, 7, 8].map((seed) => simulate(0.75, seed))
  assert.ok(mid.some((m) => m.over), '75% right is still risky over time')
})

test('spaced repetition favours missed scenarios', () => {
  const pool = SCENARIOS.slice(0, 4)
  let boxes = {}
  boxes = srsUpdate(boxes, pool[0]!.id, false)
  for (const s of pool.slice(1)) boxes = srsUpdate(srsUpdate(srsUpdate(boxes, s.id, true), s.id, true), s.id, true)
  const rng = seeded(9)
  const triggers = ['road', 'pickup', 'anytime'] as const
  let hits = 0
  for (let i = 0; i < 400; i++) {
    if (pickScenario(pool, boxes, new Set(), [...triggers], rng)?.id === pool[0]!.id) hits++
  }
  assert.ok(hits > 250, `missed card picked ${hits}/400`)
  assert.equal(pickScenario(pool, boxes, new Set(pool.map((p) => p.id)), [...triggers], rng), null)
})

test('shuffled order is a permutation', () => {
  const o = shuffledOrder(5, seeded(3))
  assert.deepEqual([...o].sort(), [0, 1, 2, 3, 4])
})

test('fares are realistic Kampala amounts', () => {
  for (const m of [0, 150, 400, 2000]) {
    const f = realisticFare(m, 0.5)
    assert.ok(f >= 2_000 && f <= 10_000 && f % 500 === 0, `fare ${f}`)
  }
})
