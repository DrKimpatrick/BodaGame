/** Saved-ride checks. Run: npm run test:rules */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newGame } from './engine.ts'
import { parseRide, timeAgo, type SavedRide } from './saveFormat.ts'

const stop = { x: 10, z: 20, roadAxis: 'vertical' as const, sideSign: 1 as const, name: 'Kisenyi' }
const good: SavedRide = {
  v: 1,
  savedAt: 1000,
  mode: 'shift',
  rr: newGame('shift', 20000),
  usedThisShift: ['helmet'],
  encountersThisShift: 1,
  deliveriesThisShift: 2,
  money: 26500,
  fuel: 62.5,
  condition: 88,
  weather: 'rain',
  headlight: true,
  rideJob: { phase: 'carrying', pickup: stop, dropoff: { ...stop, x: 40 }, payoutUgx: 6000 },
  rideJobSerial: 4,
  rideCompletedDeliveries: 2,
  bike: { x: 12.5, z: -40, yaw: 1.2 },
}

test('a ride comes back exactly as it was saved', () => {
  assert.deepEqual(parseRide(JSON.stringify(good)), good)
})

test('a free ride needs no road-rules state', () => {
  const r = parseRide(JSON.stringify({ ...good, mode: 'free', rr: null }))
  assert.ok(r)
  assert.equal(r.rr, null)
})

test('anything that is not a usable save is refused rather than crashing', () => {
  for (const bad of [null, '', 'not json', '[]', '42', 'null', '{}', JSON.stringify({ ...good, v: 2 }), JSON.stringify({ ...good, mode: 'race' }), JSON.stringify({ ...good, money: 'lots' }), JSON.stringify({ ...good, bike: null }), JSON.stringify({ ...good, bike: { x: 1, z: 2 } }), JSON.stringify({ ...good, rr: null }), JSON.stringify({ ...good, rr: { difficulty: 'shift' } })]) {
    assert.equal(parseRide(bad), null, String(bad))
  }
})

test('numbers out of range are brought back into range', () => {
  const r = parseRide(JSON.stringify({ ...good, fuel: 500, condition: -3, money: -1, bike: { x: 99999, z: -99999, yaw: 0 } }))
  assert.ok(r)
  assert.equal(r.fuel, 100)
  assert.equal(r.condition, 0)
  assert.equal(r.money, 0)
  assert.ok(Math.abs(r.bike.x) < 400 && Math.abs(r.bike.z) < 400, 'the bike stays inside the city')
})

test('a broken passenger job loses the job, not the whole ride', () => {
  const r = parseRide(JSON.stringify({ ...good, rideJob: { phase: 'carrying', pickup: { x: 1 }, dropoff: stop, payoutUgx: 10 } }))
  assert.ok(r)
  assert.equal(r.rideJob, null)
  assert.equal(r.money, good.money)
})

test('an unknown weather falls back to clear', () => {
  assert.equal(parseRide(JSON.stringify({ ...good, weather: 'snow' }))?.weather, 'clear')
})

test('time since the last ride reads naturally', () => {
  const MIN = 60000
  assert.equal(timeAgo(0, 30000), 'just now')
  assert.equal(timeAgo(0, 5 * MIN), '5 minutes ago')
  assert.equal(timeAgo(0, 60 * MIN), 'an hour ago')
  assert.equal(timeAgo(0, 5 * 60 * MIN), '5 hours ago')
  assert.equal(timeAgo(0, 25 * 60 * MIN), 'yesterday')
  assert.equal(timeAgo(0, 72 * 60 * MIN), '3 days ago')
  assert.equal(timeAgo(1000, 0), 'just now')
})
