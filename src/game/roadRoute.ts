/**
 * Road-following navigation for the rider. Uganda keeps left, so the route stays in the left lane, reaches every
 * stop with the stop on the rider's left, and goes clockwise round roundabouts. Pure and testable.
 *
 * Directions are physical. Looking along +Z, your left is +X (up × forward), so "left" here is what the rider sees.
 */
import { ewHalf, ewKind, laneCentres, NUM_BLOCKS, nsHalf, nsKind, roadStripCenterX, roadStripCenterZ } from './cityGrid.ts'
import { roundaboutAt, STREETS_EW, STREETS_NS } from './kampalaMap.ts'

export type Heading = 'N' | 'S' | 'E' | 'W'
export type RouteAction = 'left' | 'right' | 'roundabout' | 'arrive' | 'turnaround'
export type RouteStep = { action: RouteAction; distance: number; road: string }
export type Route = { points: [number, number][]; length: number; next: RouteStep }
export type RouteStop = { x: number; z: number; roadAxis: 'vertical' | 'horizontal'; sideSign: 1 | -1 }

const HEADINGS: Heading[] = ['N', 'E', 'S', 'W']
const DIR: Record<Heading, { x: number; z: number }> = {
  N: { x: 0, z: 1 },
  E: { x: 1, z: 0 },
  S: { x: 0, z: -1 },
  W: { x: -1, z: 0 },
}
const OPPOSITE: Record<Heading, Heading> = { N: 'S', S: 'N', E: 'W', W: 'E' }
/** A rider's left (up × forward). */
const LEFT_OF: Record<Heading, Heading> = { N: 'E', E: 'S', S: 'W', W: 'N' }

export function leftOf(h: Heading): { x: number; z: number } {
  return DIR[LEFT_OF[h]]
}

const isNs = (h: Heading) => h === 'N' || h === 'S'
const stripPitch = roadStripCenterX(1) - roadStripCenterX(0)
/** Roundabout circulating radius and paved edge. Kept here so this file has no rules dependency. */
const RING_R = 9
const DISC_R = 13
/** Extra distance a U-turn is treated as costing, so going forward is preferred when it's close. */
const TURNAROUND_COST = 500

/** The compass heading closest to a bike yaw (forward is (−sin yaw, −cos yaw)). */
export function headingFromYaw(yaw: number): Heading {
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  if (Math.abs(fz) >= Math.abs(fx)) return fz > 0 ? 'N' : 'S'
  return fx > 0 ? 'E' : 'W'
}

/** Sideways position in the rider's own road: positive is on the left of the centre line (where she belongs). */
export function leftOfCentre(x: number, z: number, h: Heading): number {
  if (isNs(h)) {
    const i = nearestStrip(x, roadStripCenterX)
    return (x - roadStripCenterX(i)) * leftOf(h).x
  }
  const j = nearestStrip(z, roadStripCenterZ)
  return (z - roadStripCenterZ(j)) * leftOf(h).z
}

function nearestStrip(v: number, center: (k: number) => number): number {
  const k = Math.round((v - center(0)) / stripPitch)
  return Math.max(0, Math.min(NUM_BLOCKS, k))
}

/** Sideways offset (from the road centre, towards the rider's left) of the lane she should ride in. */
function kerbLane(ns: boolean, strip: number): number {
  return laneCentres(ns ? nsKind(strip) : ewKind(strip))[1]
}

/** Which heading reaches this stop with it on the rider's left. */
export function headingForStop(stop: RouteStop): Heading {
  if (stop.roadAxis === 'vertical') return stop.sideSign > 0 ? 'N' : 'S'
  return stop.sideSign > 0 ? 'W' : 'E'
}

const nodeId = (i: number, j: number) => i * (NUM_BLOCKS + 1) + j
const stateId = (node: number, h: Heading) => node * 4 + HEADINGS.indexOf(h)

function step(i: number, j: number, h: Heading): [number, number] | null {
  const ni = i + DIR[h].x
  const nj = j + DIR[h].z
  if (ni < 0 || nj < 0 || ni > NUM_BLOCKS || nj > NUM_BLOCKS) return null
  return [ni, nj]
}

/** Coordinate of the rider's lane on the strip she rides along, heading `h`. */
function laneCoord(i: number, j: number, h: Heading): number {
  if (isNs(h)) return roadStripCenterX(i) + leftOf(h).x * kerbLane(true, i)
  return roadStripCenterZ(j) + leftOf(h).z * kerbLane(false, j)
}

function roadName(i: number, j: number, h: Heading): string {
  return isNs(h) ? (STREETS_NS[i] ?? '') : (STREETS_EW[j] ?? '')
}

type Search = { path: { i: number; j: number; h: Heading }[]; turnaround: boolean; startHeading: Heading }

/** Shortest legal path from the bike to the node the stop must be approached from. No U-turns at junctions. */
function search(bx: number, bz: number, h: Heading, endI: number, endJ: number, endH: Heading): Search | null {
  const ns = isNs(h)
  const strip = ns ? nearestStrip(bx, roadStripCenterX) : nearestStrip(bz, roadStripCenterZ)
  const pos = ns ? bz : bx
  const center = ns ? roadStripCenterZ : roadStripCenterX
  const forward = h === 'N' || h === 'E' ? 1 : -1
  const base = Math.floor((pos - center(0)) / stripPitch)
  const ahead = Math.max(0, Math.min(NUM_BLOCKS, forward > 0 ? base + 1 : base))
  const behind = Math.max(0, Math.min(NUM_BLOCKS, forward > 0 ? base : base + 1))
  const toNode = (k: number): [number, number] => (ns ? [strip, k] : [k, strip])

  const n = (NUM_BLOCKS + 1) * (NUM_BLOCKS + 1) * 4
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const done = new Uint8Array(n)
  const frontier: number[] = []
  const seed = (i: number, j: number, arrive: Heading, cost: number) => {
    const s = stateId(nodeId(i, j), arrive)
    dist[s] = cost
    frontier.push(s)
  }
  const [ai, aj] = toNode(ahead)
  seed(ai, aj, h, Math.abs(center(ahead) - pos))
  const [bi, bj] = toNode(behind)
  seed(bi, bj, OPPOSITE[h], Math.abs(center(behind) - pos) + TURNAROUND_COST)

  const goal = OPPOSITE[endH]
  let best = -1
  while (frontier.length > 0) {
    let m = 0
    for (let k = 1; k < frontier.length; k++) if (dist[frontier[k]!]! < dist[frontier[m]!]!) m = k
    const s = frontier[m]!
    frontier[m] = frontier[frontier.length - 1]!
    frontier.pop()
    if (done[s]) continue
    done[s] = 1
    const node = Math.floor(s / 4)
    const arrive = HEADINGS[s % 4]!
    const i = Math.floor(node / (NUM_BLOCKS + 1))
    const j = node % (NUM_BLOCKS + 1)
    if (i === endI && j === endJ && arrive !== goal) {
      best = s
      break
    }
    for (const out of HEADINGS) {
      if (out === OPPOSITE[arrive]) continue
      const nx = step(i, j, out)
      if (!nx) continue
      const t = stateId(nodeId(nx[0], nx[1]), out)
      const d = dist[s]! + stripPitch
      if (d < dist[t]!) {
        dist[t] = d
        prev[t] = s
        frontier.push(t)
      }
    }
  }
  if (best < 0) return null
  const path: Search['path'] = []
  for (let s = best; s >= 0; s = prev[s]!) {
    const node = Math.floor(s / 4)
    path.unshift({ i: Math.floor(node / (NUM_BLOCKS + 1)), j: node % (NUM_BLOCKS + 1), h: HEADINGS[s % 4]! })
  }
  return { path, turnaround: path[0]!.h !== h, startHeading: path[0]!.h }
}

/** Clockwise (from above) arc round a roundabout, from the road coming in to the road going out. */
function roundaboutArc(cx: number, cz: number, inX: number, inZ: number, outX: number, outZ: number, pts: [number, number][]) {
  const th0 = Math.atan2(inZ - cz, inX - cx)
  let th1 = Math.atan2(outZ - cz, outX - cx)
  while (th1 <= th0 + 0.2) th1 += Math.PI * 2
  const steps = Math.max(4, Math.ceil((th1 - th0) / 0.35))
  for (let k = 1; k < steps; k++) {
    const th = th0 + ((th1 - th0) * k) / steps
    pts.push([cx + Math.cos(th) * RING_R, cz + Math.sin(th) * RING_R])
  }
}

export function computeRoute(bx: number, bz: number, yaw: number, stop: RouteStop): Route {
  const h = headingFromYaw(yaw)
  const endH = headingForStop(stop)
  const stopNs = stop.roadAxis === 'vertical'
  const stopStrip = stopNs ? nearestStrip(stop.x, roadStripCenterX) : nearestStrip(stop.z, roadStripCenterZ)
  const along = stopNs ? stop.z : stop.x
  const center = stopNs ? roadStripCenterZ : roadStripCenterX
  // The stop's own block of road, and the junction it is entered from.
  const seg = Math.max(0, Math.min(NUM_BLOCKS - 1, Math.floor((along - center(0)) / stripPitch)))
  const endK = endH === 'N' || endH === 'E' ? seg : seg + 1
  const endI = stopNs ? stopStrip : endK
  const endJ = stopNs ? endK : stopStrip
  const laneAtStop = laneCoord(stopNs ? stopStrip : 0, stopNs ? 0 : stopStrip, endH)
  const stopLanePoint: [number, number] = stopNs ? [laneAtStop, stop.z] : [stop.x, laneAtStop]
  const finish = (pts: [number, number][], next: RouteStep): Route => {
    pts.push(stopLanePoint, [stop.x, stop.z])
    let length = 0
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1])
    return { points: pts, length, next }
  }

  const bikeNs = isNs(h)
  const onSameRoad = bikeNs === stopNs && Math.abs((bikeNs ? bx - roadStripCenterX(stopStrip) : bz - roadStripCenterZ(stopStrip))) < (bikeNs ? nsHalf(stopStrip) : ewHalf(stopStrip)) + 4
  const ahead = (along - (bikeNs ? bz : bx)) * (h === 'N' || h === 'E' ? 1 : -1)
  // Same block of road, already heading the right way, with the stop ahead: ride straight to it.
  const sameBlock = Math.floor(((bikeNs ? bz : bx) - center(0)) / stripPitch) === seg
  if (onSameRoad && h === endH && ahead > 0 && sameBlock) {
    return finish([[bx, bz]], { action: 'arrive', distance: ahead, road: roadName(stopNs ? stopStrip : 0, stopNs ? 0 : stopStrip, endH) })
  }

  const found = search(bx, bz, h, endI, endJ, endH)
  if (!found) return finish([[bx, bz]], { action: 'arrive', distance: Math.hypot(stop.x - bx, stop.z - bz), road: '' })
  const { path } = found
  const pts: [number, number][] = [[bx, bz]]
  let next: RouteStep | null = found.turnaround ? { action: 'turnaround', distance: 0, road: roadName(path[0]!.i, path[0]!.j, path[0]!.h) } : null
  let travelled = 0
  let cursor: [number, number] = [bx, bz]
  const leg = (x: number, z: number) => {
    travelled += Math.hypot(x - cursor[0], z - cursor[1])
    cursor = [x, z]
    pts.push([x, z])
  }
  const startLane = laneCoord(path[0]!.i, path[0]!.j, path[0]!.h)
  // Ease over to the left lane a few metres ahead, instead of drawing the line sideways across the road.
  const startDir = DIR[path[0]!.h]
  const merge = isNs(path[0]!.h)
    ? ([startLane, bz + startDir.z * Math.min(8, Math.abs(roadStripCenterZ(path[0]!.j) - bz) * 0.5)] as const)
    : ([bx + startDir.x * Math.min(8, Math.abs(roadStripCenterX(path[0]!.i) - bx) * 0.5), startLane] as const)
  leg(merge[0], merge[1])

  for (let k = 0; k < path.length; k++) {
    const { i, j, h: inH } = path[k]!
    const outH = k + 1 < path.length ? path[k + 1]!.h : endH
    const cx = roadStripCenterX(i)
    const cz = roadStripCenterZ(j)
    const inLane = laneCoord(i, j, inH)
    const outLane = laneCoord(i, j, outH)
    if (roundaboutAt(i, j)) {
      const inPt: [number, number] = isNs(inH) ? [inLane, cz - DIR[inH].z * DISC_R] : [cx - DIR[inH].x * DISC_R, inLane]
      const outPt: [number, number] = isNs(outH) ? [outLane, cz + DIR[outH].z * DISC_R] : [cx + DIR[outH].x * DISC_R, outLane]
      leg(inPt[0], inPt[1])
      if (!next) next = { action: 'roundabout', distance: travelled, road: roadName(i, j, outH) }
      const arc: [number, number][] = []
      roundaboutArc(cx, cz, inPt[0], inPt[1], outPt[0], outPt[1], arc)
      for (const p of arc) leg(p[0], p[1])
      leg(outPt[0], outPt[1])
    } else if (outH === inH) {
      // Straight on: no corner to draw.
    } else {
      const corner: [number, number] = isNs(inH) ? [inLane, outLane] : [outLane, inLane]
      leg(corner[0], corner[1])
      if (!next) next = { action: LEFT_OF[inH] === outH ? 'left' : 'right', distance: travelled, road: roadName(i, j, outH) }
    }
  }
  const distanceToStop = travelled + Math.hypot(stopLanePoint[0] - cursor[0], stopLanePoint[1] - cursor[1])
  return finish(pts, next ?? { action: 'arrive', distance: distanceToStop, road: roadName(endI, endJ, endH) })
}

/** The sentence for the banner: says what to do next and where, always the same way round. */
export function routeInstruction(s: RouteStep, stopName: string): string {
  const m = Math.max(0, Math.round(s.distance / 5) * 5)
  const at = m > 0 ? `In ${m} m, ` : ''
  switch (s.action) {
    case 'left':
      return `${at}turn left${s.road ? ` onto ${s.road}` : ''}`
    case 'right':
      return `${at}turn right${s.road ? ` onto ${s.road}` : ''}`
    case 'roundabout':
      return `${at}go round the roundabout, keeping left, to ${s.road || 'your exit'}`
    case 'turnaround':
      return 'Turn around when it is safe'
    case 'arrive':
      return `${at}stop at ${stopName}, on your left`
  }
}
