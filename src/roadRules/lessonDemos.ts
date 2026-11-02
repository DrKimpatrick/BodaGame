/**
 * Demonstrations: Mama Sarah rides each skill herself, on the real road, before the learner tries it. A demo is a
 * path to follow plus a list of phases, each with a caption and a way of using the pedals. Pure data and maths: the
 * frame loop runs them (`DemoPilot`), and tests ride them on the bike's real handling.
 */
import { ewHalf, nsHalf, roadStripCenterX, roadStripCenterZ } from '../game/cityGrid.ts'
import { headingForStop, laneCoord, roundaboutArc, type RouteStop } from '../game/roadRoute.ts'
import { axisOf, headingVec, JUNCTIONS, ROUNDABOUT, secondsUntilGreen, signalAspect, stopLineEdge, ZEBRAS, type Heading, type Junction } from './world/junctions.ts'

export type DemoId = 'keepleft' | 'gas' | 'coast' | 'brake' | 'stayleft' | 'turn' | 'junctions' | 'roundabout' | 'passenger'

export type DemoState = {
  /** Metres along the path. */
  along: number
  speed: number
  kmh: number
  /** Seconds in this phase. */
  t: number
  /** World clock, for signals. */
  worldT: number
}

/** Accelerator fully open, no pedals, brake held, or hold this speed (m/s). */
export type DemoDrive = 'gas' | 'coast' | 'brake' | number

export type DemoPhase = {
  caption: string
  drive: DemoDrive | ((s: DemoState) => DemoDrive)
  until: (s: DemoState) => boolean
}

export type Demo = {
  id: DemoId
  /** Bike yaw: forward is (−sin yaw, −cos yaw). */
  start: { x: number; z: number; yaw: number }
  path: [number, number][]
  phases: DemoPhase[]
}

const YAW: Record<Heading, number> = { S: 0, N: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }

const stopped = (s: DemoState) => s.speed < 0.1
const STOP_PHASE: DemoPhase = { caption: 'And she brings the bike to a smooth stop.', drive: 'brake', until: stopped }

/** Entebbe Rd between strips 9 and 8, heading south: a straight block with no crossing or hump (a test holds this to it). */
export function straightRun(): { x: number; z0: number; z1: number } {
  return { x: laneCoord(6, 0, 'S'), z0: roadStripCenterZ(9) - 9, z1: roadStripCenterZ(8) + 9 }
}

function straightDemo(id: DemoId, phases: DemoPhase[]): Demo {
  const { x, z0, z1 } = straightRun()
  return { id, start: { x, z: z0, yaw: YAW.S }, path: [[x, z0], [x, z1 - 40]], phases }
}

function hasZebra(axis: 'ns' | 'ew', strip: number, a: number, b: number) {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return ZEBRAS.some((z) => z.axis === axis && z.strip === strip && z.along > lo - 6 && z.along < hi + 6)
}

/** A point `d` metres from the junction, back along the approach, in the left lane. */
function onApproach(jn: Junction, h: Heading, d: number): [number, number] {
  const v = headingVec(h)
  return axisOf(h) === 'ns' ? [laneCoord(jn.i, jn.j, h), jn.z - v.z * d] : [jn.x - v.x * d, laneCoord(jn.i, jn.j, h)]
}

/** A smooth left turn at a junction where the road she's on has priority, so there's nothing to stop for. */
function buildTurn(): Demo | null {
  const LEFT: Record<Heading, Heading> = { N: 'E', E: 'S', S: 'W', W: 'N' }
  for (const jn of JUNCTIONS) {
    if ((jn.control !== 'stop' && jn.control !== 'giveway') || jn.i < 2 || jn.j < 2 || jn.i > 10 || jn.j > 10) continue
    const h: Heading = jn.minor === 'ew' ? 'S' : 'W'
    const out = LEFT[h]
    const inAxis = axisOf(h)
    const outAxis = axisOf(out)
    const inStrip = inAxis === 'ns' ? jn.i : jn.j
    const outStrip = outAxis === 'ns' ? jn.i : jn.j
    const inCentre = inAxis === 'ns' ? jn.z : jn.x
    const outCentre = outAxis === 'ns' ? jn.z : jn.x
    const inSign = inAxis === 'ns' ? headingVec(h).z : headingVec(h).x
    const outSign = outAxis === 'ns' ? headingVec(out).z : headingVec(out).x
    if (hasZebra(inAxis, inStrip, inCentre - inSign * 46, inCentre) || hasZebra(outAxis, outStrip, outCentre, outCentre + outSign * 32)) continue

    const start = onApproach(jn, h, 46)
    const inLane = laneCoord(jn.i, jn.j, h)
    const outLane = laneCoord(jn.i, jn.j, out)
    const corner: [number, number] = inAxis === 'ns' ? [inLane, outLane] : [outLane, inLane]
    const cross = inAxis === 'ns' ? ewHalf(jn.j) : nsHalf(jn.i)
    const outHalf = outAxis === 'ns' ? ewHalf(jn.j) : nsHalf(jn.i)
    const v = headingVec(h)
    const w = headingVec(out)
    // A rounded corner: sampled along a curve from the junction's near edge to its far side.
    const p0: [number, number] = [corner[0] - v.x * (cross * 0.9), corner[1] - v.z * (cross * 0.9)]
    const p2: [number, number] = [corner[0] + w.x * (outHalf * 0.9), corner[1] + w.z * (outHalf * 0.9)]
    const curve: [number, number][] = []
    for (let k = 0; k <= 6; k++) {
      const t = k / 6
      const u = 1 - t
      curve.push([u * u * p0[0] + 2 * u * t * corner[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * corner[1] + t * t * p2[1]])
    }
    const end: [number, number] = [corner[0] + w.x * 30, corner[1] + w.z * 30]
    const toCurve = Math.hypot(p0[0] - start[0], p0[1] - start[1])
    let curveLen = 0
    for (let k = 1; k < curve.length; k++) curveLen += Math.hypot(curve[k]![0] - curve[k - 1]![0], curve[k]![1] - curve[k - 1]![1])
    return {
      id: 'turn',
      start: { x: start[0], z: start[1], yaw: YAW[h] },
      path: [start, ...curve, end],
      phases: [
        { caption: 'She rides up to the corner on the left of the road.', drive: 8, until: (s) => s.along > toCurve - 22 },
        { caption: '1. Corner ahead: she lets go of the accelerator…', drive: 'coast', until: (s) => s.t > 0.7 },
        { caption: '…and brakes, still going straight, down to about 20 km/h.', drive: 5.5, until: (s) => s.along > toCurve - 1 },
        { caption: '2. Slow enough. Now she steers in, smoothly and steadily.', drive: 5.5, until: (s) => s.along > toCurve + curveLen * 0.65 },
        { caption: '3. She finishes on the left of the new road, with the middle line on her right.', drive: 6, until: (s) => s.along > toCurve + curveLen + 4 },
        { caption: '4. Straight again, so she accelerates gently.', drive: 8, until: (s) => s.along > toCurve + curveLen + 18 },
        STOP_PHASE,
      ],
    }
  }
  return null
}

/** Stopping at a real red light, then going on green. Picks a light that will turn green soon after she arrives. */
function buildSignal(t: number): Demo | null {
  let best: { jn: Junction; h: Heading; wait: number } | null = null
  for (const jn of JUNCTIONS) {
    if (jn.control !== 'signal' || jn.i < 2 || jn.j < 2 || jn.i > 10 || jn.j > 10) continue
    for (const h of ['N', 'S', 'E', 'W'] as Heading[]) {
      const axis = axisOf(h)
      const strip = axis === 'ns' ? jn.i : jn.j
      const c = axis === 'ns' ? jn.z : jn.x
      const sign = axis === 'ns' ? headingVec(h).z : headingVec(h).x
      if (hasZebra(axis, strip, c - sign * 44, c + sign * 30)) continue
      // About five seconds to ride up. Red on arrival, and green a few seconds after she has stopped.
      if (signalAspect(jn, axis, t + 5) !== 'red') continue
      const wait = secondsUntilGreen(jn, axis, t)
      if (wait < 8) continue
      if (!best || wait < best.wait) best = { jn, h, wait }
    }
  }
  if (!best) return null
  const { jn, h } = best
  const axis = axisOf(h)
  const edge = stopLineEdge(jn, h)
  const runUp = 36
  const start = onApproach(jn, h, edge + runUp)
  const v = headingVec(h)
  const end: [number, number] = [start[0] + v.x * (runUp + edge * 2 + 24), start[1] + v.z * (runUp + edge * 2 + 24)]
  /** Distance left to the white line, keeping her front wheel behind it. */
  const toLine = (s: DemoState) => runUp - 1.4 - s.along
  return {
    id: 'junctions',
    start: { x: start[0], z: start[1], yaw: YAW[h] },
    path: [start, end],
    phases: [
      { caption: 'She keeps left and looks ahead. The light is red.', drive: 7, until: (s) => toLine(s) < 19 },
      {
        caption: 'Red means stop. She lets go early and brakes gently, in a straight line.',
        drive: (s) => Math.sqrt(Math.max(0, 2 * 1.6 * toLine(s))),
        until: (s) => toLine(s) < 0.4 || stopped(s),
      },
      { caption: 'She stops behind the white line and waits, however empty the road looks.', drive: 'brake', until: (s) => signalAspect(jn, axis, s.worldT) === 'green' },
      { caption: 'Green, and the way is clear: now she goes.', drive: 7, until: (s) => s.along > runUp + edge + 6 },
      STOP_PHASE,
    ],
  }
}

/** Round the Clock Tower: in from the north, turning left to join, clockwise, and out to the east. */
function buildRoundabout(): Demo {
  const i = 6
  const j = 2
  const cx = roadStripCenterX(i)
  const cz = roadStripCenterZ(j)
  const inX = laneCoord(i, j, 'S')
  const outZ = laneCoord(i, j, 'E')
  const entry: [number, number] = [inX, cz + ROUNDABOUT.disc]
  const exit: [number, number] = [cx + ROUNDABOUT.disc, outZ]
  const start: [number, number] = [inX, cz + ROUNDABOUT.disc + 26]
  const arc: [number, number][] = []
  roundaboutArc(cx, cz, entry[0], entry[1], exit[0], exit[1], arc)
  const end: [number, number] = [cx + ROUNDABOUT.disc + 22, outZ]
  const path: [number, number][] = [start, entry, ...arc, exit, end]
  let total = 0
  let toExit = 0
  for (let k = 1; k < path.length; k++) {
    total += Math.hypot(path[k]![0] - path[k - 1]![0], path[k]![1] - path[k - 1]![1])
    if (path[k] === exit) toExit = total
  }
  return {
    id: 'roundabout',
    start: { x: start[0], z: start[1], yaw: YAW.S },
    path,
    phases: [
      { caption: 'Roundabout ahead. She slows down early and keeps left.', drive: 6.5, until: (s) => s.along > 10 },
      { caption: 'She looks to her right and gives way to anything already going round.', drive: 3.5, until: (s) => s.along > 25 },
      { caption: 'The way is clear, so she turns left to join.', drive: 4.5, until: (s) => s.along > 34 },
      { caption: 'She goes round clockwise, with the island on her right.', drive: 5, until: (s) => s.along > toExit - 6 },
      { caption: 'At her road she leaves by turning left, and stays on the left.', drive: 5.5, until: (s) => s.along > toExit + 10 },
      STOP_PHASE,
    ],
  }
}

/** Up to the kerb on the left and a clean stop beside the passenger. */
function buildPassenger(stop: RouteStop): Demo {
  const h = headingForStop(stop)
  const ns = stop.roadAxis === 'vertical'
  const lane = ns ? laneCoord(Math.round((stop.x - roadStripCenterX(0)) / 53), 0, h) : laneCoord(0, Math.round((stop.z - roadStripCenterZ(0)) / 53), h)
  const v = headingVec(h)
  const along = ns ? stop.z : stop.x
  const point = (d: number): [number, number] => (ns ? [lane, along - v.z * d] : [along - v.x * d, lane])
  const start = point(30)
  // Pull in to the road's edge beside the passenger, staying on the tarmac.
  const toKerb = 0.7
  const kerb: [number, number] = ns ? [stop.x - stop.sideSign * 1.3, stop.z + v.z * toKerb] : [stop.x + v.x * toKerb, stop.z - stop.sideSign * 1.3]
  const run = Math.hypot(kerb[0] - start[0], kerb[1] - start[1])
  return {
    id: 'passenger',
    start: { x: start[0], z: start[1], yaw: YAW[h] },
    path: [start, point(10), kerb],
    phases: [
      { caption: 'She follows the line. The passenger is waiting on the left.', drive: 6.5, until: (s) => s.along > 8 },
      { caption: 'She slows down in good time and checks it is safe to pull in.', drive: 3.5, until: (s) => s.along > run - 8 },
      { caption: 'She eases over to the left kerb, right beside them…', drive: (s) => Math.max(0.8, Math.sqrt(Math.max(0, 2 * 1.4 * (run - s.along)))), until: (s) => s.along > run - 0.8 },
      { caption: '…and stops. The passenger climbs on. Simple as that.', drive: 'brake', until: (s) => stopped(s) && s.t > 1.8 },
    ],
  }
}

export function buildDemo(id: DemoId, ctx: { t: number; stop: RouteStop | null }): Demo | null {
  switch (id) {
    case 'gas':
      return straightDemo(id, [
        { caption: 'She presses the accelerator and holds it. Watch the speed climb on the dial.', drive: 'gas', until: (s) => s.kmh >= 20 },
        { caption: '20 km/h. To hold this speed she eases off a little.', drive: 5.6, until: (s) => s.t > 1.6 },
        STOP_PHASE,
      ])
    case 'coast':
      return straightDemo(id, [
        { caption: 'First she gets up to 20 km/h.', drive: 'gas', until: (s) => s.kmh >= 20 },
        { caption: 'Now she lets go completely. No jolt: the bike rolls on and slowly loses speed.', drive: 'coast', until: (s) => s.kmh <= 10 },
        STOP_PHASE,
      ])
    case 'brake':
      return straightDemo(id, [
        { caption: 'She gets up to speed, going straight.', drive: 'gas', until: (s) => s.kmh >= 26 },
        { caption: 'She lets go of the accelerator, then presses the brake and holds it.', drive: 'brake', until: stopped },
        { caption: 'She keeps holding it: the bike stays still and never rolls back.', drive: 'brake', until: (s) => s.t > 1.5 },
      ])
    case 'keepleft':
      return straightDemo(id, [
        { caption: 'See where she rides: on the left side of the road.', drive: 6.5, until: (s) => s.t > 2.2 },
        { caption: 'The middle line stays on her right. Traffic coming towards her passes on that side.', drive: 6.5, until: (s) => s.along > 23 },
        STOP_PHASE,
      ])
    case 'stayleft': {
      // A gentle move across her own side of the road and back: small presses, small changes.
      const { x, z0 } = straightRun()
      const inner = laneCoord(6, 0, 'S') + 2.2
      const demo = straightDemo(id, [
        { caption: 'She steers with small, gentle presses. A small press makes a small change.', drive: 5.5, until: (s) => s.along > 11 },
        { caption: 'She moves over a little, and stays on her own side of the middle line.', drive: 5.5, until: (s) => s.along > 19 },
        { caption: 'Then back to the left. No swerving, and nobody is surprised.', drive: 5.5, until: (s) => s.along > 28 },
        STOP_PHASE,
      ])
      demo.path = [[x, z0], [x, z0 - 6], [inner, z0 - 16], [inner, z0 - 20], [x, z0 - 30], [x, z0 - 48]]
      return demo
    }
    case 'turn':
      return buildTurn()
    case 'junctions':
      return buildSignal(ctx.t)
    case 'roundabout':
      return buildRoundabout()
    case 'passenger':
      return ctx.stop ? buildPassenger(ctx.stop) : null
  }
}

export type PilotCommand = { gas: boolean; brake: boolean; left: boolean; right: boolean }

/** How far ahead on the path she aims (m). */
const lookAhead = (speed: number) => Math.max(3.5, speed * 0.75)

/**
 * Finds where the bike is along the path and which way to steer: aims at a point a little ahead, and presses left or
 * right only when off by more than a small margin. `seg` is the segment she was last on; returns the updated values.
 */
export function followPath(path: readonly (readonly [number, number])[], x: number, z: number, yaw: number, speed: number, seg: number): { seg: number; along: number; steer: -1 | 0 | 1; done: boolean } {
  let s = Math.min(seg, path.length - 2)
  // Move on once she has passed the end of this segment.
  for (;;) {
    const [ax, az] = path[s]!
    const [bx, bz] = path[s + 1]!
    const dx = bx - ax
    const dz = bz - az
    const t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)
    if (t >= 1 && s < path.length - 2) s++
    else break
  }
  let along = 0
  for (let k = 0; k < s; k++) along += Math.hypot(path[k + 1]![0] - path[k]![0], path[k + 1]![1] - path[k]![1])
  const [ax, az] = path[s]!
  const [bx, bz] = path[s + 1]!
  const len = Math.hypot(bx - ax, bz - az) || 1
  const onSeg = Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / len)
  along += onSeg
  // The aim point: walk along the path from where she is.
  let remaining = lookAhead(speed) + onSeg
  let k = s
  let tx = bx
  let tz = bz
  for (; k < path.length - 1; k++) {
    const [px, pz] = path[k]!
    const [qx, qz] = path[k + 1]!
    const l = Math.hypot(qx - px, qz - pz) || 1
    if (remaining <= l) {
      tx = px + ((qx - px) * remaining) / l
      tz = pz + ((qz - pz) * remaining) / l
      break
    }
    remaining -= l
    tx = qx
    tz = qz
  }
  const wanted = Math.atan2(-(tx - x), -(tz - z))
  const err = Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw))
  const end = path[path.length - 1]!
  return { seg: s, along, steer: err > 0.035 ? 1 : err < -0.035 ? -1 : 0, done: Math.hypot(end[0] - x, end[1] - z) < 1 }
}

/** Pedals for this phase's way of riding. */
export function pedals(drive: DemoDrive, speed: number): Pick<PilotCommand, 'gas' | 'brake'> {
  if (drive === 'gas') return { gas: true, brake: false }
  if (drive === 'brake') return { gas: false, brake: true }
  if (drive === 'coast') return { gas: false, brake: false }
  // Holding a speed: ease on below it, ease off at it, and brake only when clearly too fast.
  return { gas: speed < drive - 0.15, brake: speed > drive + 0.5 }
}
