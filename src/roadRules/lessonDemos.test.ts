/** Rides every demonstration on the bike's real handling. Run: npm run test:rules */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BRAKE_DECEL, BRAKE_RESPONSE, coastLoss, drive, MAX_FORWARD, STEER_IN, STEER_OUT, THROTTLE_RESPONSE, turnRate } from '../game/bikeHandling.ts'
import { nsHalf, roadStripCenterX, roadStripCenterZ, ewHalf, NUM_BLOCKS } from '../game/cityGrid.ts'
import { nearestHeading, leftVec, ZEBRAS } from './world/junctions.ts'
import { buildDemo, followPath, pedals, straightRun, type DemoId, type DemoState } from './lessonDemos.ts'

const stop = { x: roadStripCenterX(6) + nsHalf(6) + 1.3, z: roadStripCenterZ(8) + 20, roadAxis: 'vertical' as const, sideSign: 1 as const }

/** Same model as the bike. Returns what happened, so each test can check what matters to it. */
function ride(id: DemoId, t = 0) {
  const demo = buildDemo(id, { t, stop })
  assert.ok(demo, `no demo for ${id}`)
  let { x, z, yaw } = demo.start
  let speed = 0
  let throttle = 0
  let brakeAmount = 0
  let steer = 0
  let seg = 0
  let phase = 0
  let phaseT = 0
  let worldT = t
  const dt = 1 / 60
  let time = 0
  const track: { x: number; z: number; yaw: number; speed: number; caption: string }[] = []
  let maxOff = 0
  while (phase < demo.phases.length && time < 70) {
    const f = followPath(demo.path, x, z, yaw, speed, seg)
    seg = f.seg
    const state: DemoState = { along: f.along, speed, kmh: speed * 3.6, t: phaseT, worldT }
    const p = demo.phases[phase]!
    if (p.until(state)) {
      phase++
      phaseT = 0
      continue
    }
    const way = typeof p.drive === 'function' ? p.drive(state) : p.drive
    const cmd = pedals(way, speed)
    throttle += ((cmd.gas ? 1 : 0) - throttle) * (1 - Math.exp(-THROTTLE_RESPONSE * dt))
    brakeAmount += ((cmd.brake ? 1 : 0) - brakeAmount) * (1 - Math.exp(-BRAKE_RESPONSE * dt))
    steer += (f.steer - steer) * (1 - Math.exp(-(f.steer === 0 ? STEER_OUT : STEER_IN) * dt))
    yaw += steer * turnRate(speed) * dt
    if (brakeAmount > 0.02 && speed > 0.04) speed = Math.max(0, speed - BRAKE_DECEL * brakeAmount * dt)
    else if (cmd.brake) speed = 0
    else if (throttle > 0.02) speed += drive(speed) * throttle * dt
    else if (speed > 0.04) speed = Math.max(0, speed - coastLoss(speed) * dt)
    speed = Math.min(speed, MAX_FORWARD)
    x += -Math.sin(yaw) * speed * dt
    z += -Math.cos(yaw) * speed * dt
    time += dt
    phaseT += dt
    worldT += dt
    track.push({ x, z, yaw, speed, caption: p.caption })
    // Distance from the path, to the nearest point on any segment.
    let best = Infinity
    for (let k = 0; k + 1 < demo.path.length; k++) {
      const [ax, az] = demo.path[k]!
      const [bx, bz] = demo.path[k + 1]!
      const dx = bx - ax
      const dz = bz - az
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
      best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u))
    }
    maxOff = Math.max(maxOff, best)
  }
  return { finished: phase >= demo.phases.length, time, track, maxOff, final: { x, z, speed } }
}

test('the straight demos and the place riders start have no crossing or hump', () => {
  const { z0, z1 } = straightRun()
  const zebras = ZEBRAS.filter((zb) => zb.axis === 'ns' && zb.strip === 6).map((zb) => zb.along)
  for (const zb of zebras) assert.ok(zb > z0 + 6 || zb < z1 - 6, `a crossing at ${zb} is on the demo road`)
  // Same block as the spawn in useGameStore (which imports browser-only code, so its value is restated here).
  const spawnZ = 150
  assert.ok(spawnZ <= z0 + 4 && spawnZ > z1, 'riders should start on this clear block')
  assert.ok(ride('coast').track.at(-1)!.z > z1 - 6, 'the coasting demo should finish on the block')
})

const onSomeRoad = (x: number, z: number) => {
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    if (Math.abs(x - roadStripCenterX(k)) <= nsHalf(k) + 0.5) return true
    if (Math.abs(z - roadStripCenterZ(k)) <= ewHalf(k) + 0.5) return true
  }
  return false
}

const ALL: DemoId[] = ['keepleft', 'gas', 'coast', 'brake', 'stayleft', 'turn', 'roundabout', 'passenger']

for (const id of ALL) {
  test(`${id}: she can ride it, finishes in good time and stays on the line`, () => {
    const r = ride(id)
    assert.ok(r.finished, `${id} did not finish in ${r.time.toFixed(0)} s`)
    assert.ok(r.time < 40, `${id} took ${r.time.toFixed(0)} s, too long to hold attention`)
    assert.ok(r.maxOff < 2.2, `${id} wandered ${r.maxOff.toFixed(1)} m off the line`)
  })
}

test('the red-light demo ends with a stop at the line, then moving on green', () => {
  for (const t of [0, 7, 13, 21, 40]) {
    const r = ride('junctions', t)
    assert.ok(r.finished, `not finished from t=${t}`)
    const waiting = r.track.filter((s) => s.caption.startsWith('She stops behind'))
    assert.ok(waiting.length > 60, 'she should wait at the light for a while')
    assert.ok(waiting.at(-1)!.speed < 0.2, 'she should be stopped while waiting')
  }
})

for (const id of ['keepleft', 'gas', 'coast', 'brake', 'stayleft', 'turn', 'junctions', 'passenger'] as DemoId[]) {
  test(`${id}: she keeps left the whole way`, () => {
    const r = ride(id, 7)
    // Only where she is clearly travelling straight along one road, not mid-turn.
    for (const s of r.track) {
      if (s.speed < 1) continue
      const h = nearestHeading(s.yaw)
      if (Math.max(Math.abs(Math.sin(s.yaw)), Math.abs(Math.cos(s.yaw))) < 0.97) continue
      const ns = h === 'N' || h === 'S'
      const v = ns ? s.x : s.z
      const c = ns ? roadStripCenterX(Math.round((v + 318) / 53)) : roadStripCenterZ(Math.round((v + 318) / 53))
      const side = (v - c) * (ns ? leftVec(h).x : leftVec(h).z)
      if (Math.abs(v - c) > 12) continue // crossing a junction, not on this road
      assert.ok(side > -0.3, `${id}: on the wrong side at ${s.x.toFixed(1)},${s.z.toFixed(1)}: "${s.caption}"`)
    }
  })
}

test('the roundabout goes clockwise and never touches the island', () => {
  const r = ride('roundabout')
  const cx = roadStripCenterX(6)
  const cz = roadStripCenterZ(2)
  let last: number | null = null
  let turned = 0
  for (const s of r.track) {
    const d = Math.hypot(s.x - cx, s.z - cz)
    assert.ok(d > 5.2, 'she hit the island')
    if (d > 12) continue
    const th = Math.atan2(s.z - cz, s.x - cx)
    if (last !== null) turned += Math.atan2(Math.sin(th - last), Math.cos(th - last))
    last = th
  }
  assert.ok(turned > 1, `she should go round clockwise (angle increases), turned ${turned.toFixed(2)}`)
})

test('she stays on roads in every demo', () => {
  for (const id of ALL) {
    for (const s of ride(id).track) assert.ok(onSomeRoad(s.x, s.z) || id === 'passenger', `${id} left the road at ${s.x.toFixed(1)},${s.z.toFixed(1)}`)
  }
})

test('she never rides over 30 km/h in the corner', () => {
  const r = ride('turn')
  for (const s of r.track.filter((p) => p.caption.startsWith('2.'))) assert.ok(s.speed * 3.6 < 30, `${(s.speed * 3.6).toFixed(0)} km/h`)
})
