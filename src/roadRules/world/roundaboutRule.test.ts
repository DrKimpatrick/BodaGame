/** Roundabout direction rule tests. Run: npm run test:rules */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stepWrongWay } from './roundaboutRule.ts'

/** Ride round a circle of radius r at `kmh`, sampling at 60 fps for `seconds`, clockwise or not. */
function ride(clockwise: boolean, seconds: number, kmh = 20, r = 7.6) {
  const dt = 1 / 60
  const omega = (kmh / 3.6) / r
  let th = Math.PI / 2
  let timer = 0
  let broken = 0
  for (let t = 0; t < seconds; t += dt) {
    const next = th + (clockwise ? 1 : -1) * omega * dt
    const res = stepWrongWay({ timer, prevTh: th, th: next, r, island: 4.4, kmh, dt })
    timer = res.timer
    if (res.broken) broken++
    th = next
  }
  return broken
}

test('going round clockwise (keep left) is fine', () => {
  assert.equal(ride(true, 10), 0)
})

test('going round anticlockwise is caught after about a second', () => {
  assert.equal(ride(false, 0.8), 0)
  assert.ok(ride(false, 1.3) >= 1)
})

test('crawling or hugging the island does not count', () => {
  assert.equal(ride(false, 5, 5), 0)
  assert.equal(ride(false, 5, 20, 4.6), 0)
})

test('the angle wraps across ±π without false alarms', () => {
  const res = stepWrongWay({ timer: 0, prevTh: -Math.PI + 0.01, th: Math.PI - 0.01, r: 7, island: 4.4, kmh: 20, dt: 1 / 60 })
  assert.equal(res.broken, false)
  assert.ok(res.timer > 0) // −0.02 rad: a tiny anticlockwise step, correctly measured across the wrap
})
