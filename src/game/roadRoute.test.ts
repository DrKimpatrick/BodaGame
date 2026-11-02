/** Keep-left and navigation tests. Run: npm run test:rules */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { laneCentres, NUM_BLOCKS, ROAD_KIND_NS, roadStripCenterX, roadStripCenterZ, nsHalf, ewHalf, ROAD_KIND_EW } from './cityGrid.ts'
import { computeRoute, headingForStop, headingFromYaw, leftOf, leftOfCentre, routeInstruction, type Heading, type RouteStop } from './roadRoute.ts'
import { leftVec } from '../roadRules/world/junctions.ts'

const YAW: Record<Heading, number> = { S: 0, N: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }

/** Up × forward, written out, so the test does not simply repeat the code it checks. */
function physicalLeft(fx: number, fz: number) {
  return { x: fz, z: 0 - fx }
}

test('left means the rider’s physical left, on every heading', () => {
  const forward: Record<Heading, [number, number]> = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }
  for (const h of ['N', 'S', 'E', 'W'] as Heading[]) {
    const [fx, fz] = forward[h]
    assert.deepEqual(leftOf(h), physicalLeft(fx, fz))
    // The rules engine must agree with the navigation about which side is left.
    assert.deepEqual(leftVec(h), physicalLeft(fx, fz))
    assert.equal(headingFromYaw(YAW[h]), h)
  }
})

test('every road type has its lanes on the left of the centre', () => {
  for (const kind of [...ROAD_KIND_NS, ...ROAD_KIND_EW]) {
    const [inner, outer] = laneCentres(kind)
    assert.ok(inner > 0 && outer >= inner, kind)
  }
})

test('riding in the lane counts as left of centre; the other side does not', () => {
  const x = roadStripCenterX(6)
  assert.ok(leftOfCentre(x - 5, 100, 'S') > 0)
  assert.ok(leftOfCentre(x + 5, 100, 'S') < 0)
  assert.ok(leftOfCentre(x + 5, 100, 'N') > 0)
  const z = roadStripCenterZ(2)
  assert.ok(leftOfCentre(50, z - 5, 'E') > 0)
  assert.ok(leftOfCentre(50, z + 5, 'W') > 0)
})

const stops: RouteStop[] = []
for (const vi of [1, 4, 6, 9]) {
  for (const side of [1, -1] as const) {
    stops.push({ x: roadStripCenterX(vi) + side * (nsHalf(vi) + 1.3), z: roadStripCenterZ(3) + 20, roadAxis: 'vertical', sideSign: side })
  }
}
for (const hj of [2, 6, 9]) {
  for (const side of [1, -1] as const) {
    stops.push({ x: roadStripCenterX(5) + 20, z: roadStripCenterZ(hj) + side * (ewHalf(hj) + 1.3), roadAxis: 'horizontal', sideSign: side })
  }
}

test('every stop is reached with it on the rider’s left', () => {
  for (const s of stops) {
    const h = headingForStop(s)
    const f = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }[h] as [number, number]
    const l = physicalLeft(f[0], f[1])
    const c = s.roadAxis === 'vertical' ? roadStripCenterX(Math.round((s.x - roadStripCenterX(0)) / 53)) : roadStripCenterZ(Math.round((s.z - roadStripCenterZ(0)) / 53))
    const side = s.roadAxis === 'vertical' ? (s.x - c) * l.x : (s.z - c) * l.z
    assert.ok(side > 0, JSON.stringify(s))
  }
})

/** The road strip a point sits on, if any, and which way along it the route is travelling. */
function legOnLeft(ax: number, az: number, bx: number, bz: number): boolean | null {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 6) return null
  // Only clearly straight legs along one axis.
  const ns = Math.abs(dz) > Math.abs(dx) * 8
  const ew = Math.abs(dx) > Math.abs(dz) * 8
  if (!ns && !ew) return null
  const mx = (ax + bx) / 2
  const mz = (az + bz) / 2
  if (ns) {
    const i = Math.round((mx - roadStripCenterX(0)) / 53)
    const h: Heading = dz > 0 ? 'N' : 'S'
    return (mx - roadStripCenterX(i)) * leftOf(h).x > 0
  }
  const j = Math.round((mz - roadStripCenterZ(0)) / 53)
  const h: Heading = dx > 0 ? 'E' : 'W'
  return (mz - roadStripCenterZ(j)) * leftOf(h).z > 0
}

test('routes stay in the left lane the whole way', () => {
  const starts: [number, number, Heading][] = [
    [-5.1, 13, 'S'],
    [roadStripCenterX(4) + 5, roadStripCenterZ(8) + 20, 'N'],
    [roadStripCenterX(8) - 2, roadStripCenterZ(5) + 20, 'S'],
    [roadStripCenterX(3) + 20, roadStripCenterZ(6) - 6, 'E'],
    [roadStripCenterX(10) + 20, roadStripCenterZ(9) + 5, 'W'],
  ]
  for (const [x, z, h] of starts) {
    for (const s of stops) {
      const r = computeRoute(x, z, YAW[h], s)
      assert.ok(r.points.length >= 3)
      // Skip the first leg (the rider may not be in lane yet) and the last (pulling in to the kerb).
      for (let k = 2; k < r.points.length - 2; k++) {
        const on = legOnLeft(r.points[k - 1]![0], r.points[k - 1]![1], r.points[k]![0], r.points[k]![1])
        if (on !== null) assert.ok(on, `leg ${k} of a route from ${x},${z} is on the right`)
      }
    }
  }
})

test('routes follow roads and do not cut across city blocks', () => {
  const onRoad = (x: number, z: number) => {
    for (let k = 0; k <= NUM_BLOCKS; k++) {
      if (Math.abs(x - roadStripCenterX(k)) <= nsHalf(k) + 4) return true
      if (Math.abs(z - roadStripCenterZ(k)) <= ewHalf(k) + 4) return true
    }
    return false
  }
  for (const s of stops) {
    const r = computeRoute(-5.1, 13, YAW.S, s)
    for (let k = 1; k < r.points.length; k++) {
      const [ax, az] = r.points[k - 1]!
      const [bx, bz] = r.points[k]!
      for (let t = 0; t <= 1; t += 0.1) assert.ok(onRoad(ax + (bx - ax) * t, az + (bz - az) * t), 'route left the road')
    }
  }
})

test('the banner says what to do, in plain words', () => {
  assert.equal(routeInstruction({ action: 'left', distance: 62, road: 'Kampala Rd' }, 'X'), 'In 60 m, turn left onto Kampala Rd')
  assert.equal(routeInstruction({ action: 'arrive', distance: 20, road: '' }, 'Kisenyi'), 'In 20 m, stop at Kisenyi, on your left')
  assert.match(routeInstruction({ action: 'roundabout', distance: 40, road: 'Queensway' }, 'X'), /keeping left/)
})
