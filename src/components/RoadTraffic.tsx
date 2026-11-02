import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  type RapierRigidBody,
  RigidBody,
  useRapier,
} from '@react-three/rapier'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  CITY_START,
  CITY_TOTAL,
  NUM_BLOCKS,
  ewHalf,
  ewKind,
  laneCentres,
  nsHalf,
  nsKind,
  roadStripCenterX,
  roadStripCenterZ,
} from '@game/cityGrid'
import { segmentRandom } from '@game/roadDecorPlacements'
import { TrafficInstances } from './TrafficInstances'
import { vehicleCollider, vehicleNose, type VehicleKind } from './realism/vehicleSpecs'
import {
  axisOf,
  ROUNDABOUT,
  distToStopLine,
  junctionAt,
  mustYield,
  signalAspect,
} from '../roadRules/world/junctions'
import { bikeTelemetry, trafficTelemetry, worldClock } from '../roadRules/world/telemetry'

const X0 = CITY_START
const Z0 = CITY_START
const X1 = CITY_START + CITY_TOTAL
const Z1 = CITY_START + CITY_TOTAL
const EDGE = 3.5
/** Extra meters past city edge so respawns are off-screen / in fog before they drive in. */
const SPAWN_BEYOND = 64
/**
 * Uganda keep-left routing: vehicles use the lanes on the left of their heading. Lane centres come from the
 * road type (one lane each way on streets / murram, two on main roads, beside the median on dual
 * carriageways). Vertical roads offset on X, horizontal roads offset on Z.
 */
function laneOffsetForHeading(mode: 'v' | 'h', heading: Heading, laneSlot: number, strip: number): number {
  const [inner, outer] = laneCentres(mode === 'v' ? nsKind(strip) : ewKind(strip))
  const mag = laneSlot % 2 === 0 ? inner : outer
  // Left of travel: heading N (+Z) → +X, S → −X, E (+X) → −Z, W → +Z.
  if (mode === 'v') {
    return heading === 'N' ? mag : -mag
  }
  return heading === 'E' ? -mag : mag
}
/** Two logical slots per strip (inner vs outer track on same carriageway). */
const LANES_PER_STRIP = 3

function flatOccV(vi: number, laneSlot: number): number {
  return vi * LANES_PER_STRIP + laneSlot
}
function flatOccH(hj: number, laneSlot: number): number {
  return hj * LANES_PER_STRIP + laneSlot
}
function firstFreeV(occV: boolean[], vi: number): number | null {
  const b = flatOccV(vi, 0)
  for (let l = 0; l < LANES_PER_STRIP; l++) {
    if (!occV[b + l]) return l
  }
  return null
}
function firstFreeH(occH: boolean[], hj: number): number | null {
  const b = flatOccH(hj, 0)
  for (let l = 0; l < LANES_PER_STRIP; l++) {
    if (!occH[b + l]) return l
  }
  return null
}

type Heading = 'N' | 'S' | 'E' | 'W'

type Agent = {
  kind: VehicleKind
  speed: number
  mode: 'v' | 'h'
  vi: number
  hj: number
  laneV: number
  laneH: number
  /** 0 = inner track, 1 = outer track (same direction side of road). */
  laneSlot: number
  heading: Heading
  x: number
  z: number
  /** Occupancy slot: flat index into occV / occH (strip × lane). */
  slot: { t: 'v' | 'h'; idx: number }
  /** Current speed (m/s) and unit direction of travel (follows the curve through turns and roundabouts). */
  cur: number
  dx: number
  dz: number
  /** Braking allowed this frame (m/s²): comfortable normally, hard in an emergency. */
  brake: number
  /** Sideways offset from the lane (m along the cross axis): easing round something in the way. */
  dodge: number
  dodgeTarget: number
  /** Seconds until this vehicle may change lane again. */
  laneCd: number
  /** Something slower is close ahead, and `passAway` says which way to ease round it (cross-axis sign, 0 = none). */
  blocked: boolean
  passAway: number
  /** Seconds at a standstill behind another vehicle; a last resort against gridlock. */
  stuck: number
  /** Turning through a junction on a curve instead of snapping onto the new lane. */
  arc?: { x0: number; z0: number; x1: number; z1: number; x2: number; z2: number; t: number; len: number }
  /**
   * Going round a roundabout: clockwise arc from above (angle increasing) from the entry to the exit point, radius
   * easing from the entry distance to the ring and back out.
   */
  round?: { cx: number; cz: number; th: number; th0: number; th1: number; r0: number; r1: number; ex: number; ez: number }
}

/** Clockwise travel around a roundabout, seen from above. Returns true while still on the arc. */
function advanceRound(a: Agent, d: number, speedNow: number): boolean {
  const r = a.round!
  const span = r.th1 - r.th0
  const t0 = (r.th - r.th0) / span
  const rad = t0 < 0.25 ? THREE.MathUtils.lerp(r.r0, ROUNDABOUT.ring, t0 / 0.25) : t0 > 0.75 ? THREE.MathUtils.lerp(ROUNDABOUT.ring, r.r1, (t0 - 0.75) / 0.25) : ROUNDABOUT.ring
  r.th += (Math.max(1.5, speedNow) * d) / rad
  if (r.th >= r.th1) {
    a.x = r.ex
    a.z = r.ez
    a.round = undefined
    return false
  }
  a.x = r.cx + Math.cos(r.th) * rad
  a.z = r.cz + Math.sin(r.th) * rad
  return true
}

/** Begin going round: choose the exit (same rules as a junction), then plan the arc to it. */
function startRound(a: Agent, i: number, j: number, occV: boolean[], occH: boolean[], rng: () => number) {
  const cx = roadStripCenterX(i)
  const cz = roadStripCenterZ(j)
  const entryX = a.x
  const entryZ = a.z
  pickNextAtIntersection(a, i, j, occV, occH, rng)
  const edge = ROUNDABOUT.disc + 0.4
  let ex: number
  let ez: number
  switch (a.heading) {
    case 'N':
      ex = cx + a.laneV
      ez = cz + edge
      break
    case 'S':
      ex = cx + a.laneV
      ez = cz - edge
      break
    case 'E':
      ex = cx + edge
      ez = cz + a.laneH
      break
    case 'W':
      ex = cx - edge
      ez = cz + a.laneH
      break
  }
  const th0 = Math.atan2(entryZ - cz, entryX - cx)
  let th1 = Math.atan2(ez - cz, ex - cx)
  while (th1 <= th0 + 0.3) th1 += Math.PI * 2
  a.x = entryX
  a.z = entryZ
  a.round = {
    cx,
    cz,
    th: th0,
    th0,
    th1,
    r0: Math.hypot(entryX - cx, entryZ - cz),
    r1: Math.hypot(ex - cx, ez - cz),
    ex,
    ez,
  }
}

/** Yaw of the clockwise tangent at the agent's arc angle. */
function roundYaw(a: Agent): number {
  const th = a.round!.th
  return Math.atan2(-Math.sin(th), Math.cos(th))
}

function pickKind(salt: number): VehicleKind {
  const r = segmentRandom(salt, salt >> 3, 701)
  if (r < 0.06) return 'bus'
  if (r < 0.11) return 'trailer'
  if (r < 0.18) return 'pickup'
  if (r < 0.26) return 'taxi'
  if (r < 0.32) return 'matatu'
  if (r < 0.4) return 'van'
  if (r < 0.5) return 'suv'
  if (r < 0.6) return 'sedan'
  if (r < 0.72) return 'bicycle'
  if (r < 0.84) return 'motorbike'
  if (r < 0.92) return 'taxi'
  return 'sedan'
}

/** Cruising speed (m/s): all traffic keeps to the city's 50 km/h (13.9 m/s); nothing crawls enough to clog a road. */
function pickSpeed(kind: VehicleKind, salt: number): number {
  const r = segmentRandom(salt, salt >> 5, 702)
  switch (kind) {
    case 'bus':
      return 7 + r * 2.5
    case 'trailer':
      return 6.5 + r * 2.5
    case 'bicycle':
      return 3.5 + r * 2.5
    case 'motorbike':
      return 9.5 + r * 4
    case 'van':
    case 'matatu':
      return 8 + r * 3.5
    default:
      return 9.5 + r * 4
  }
}

function headingToYaw(h: Heading): number {
  switch (h) {
    case 'N':
      return 0
    case 'S':
      return Math.PI
    // +Z rotated by θ about Y points along (sin θ, cos θ).
    case 'E':
      return Math.PI / 2
    case 'W':
      return -Math.PI / 2
    default:
      return 0
  }
}

/** Approach into intersection: where we came from (opposite of motion). */
function approachFrom(heading: Heading): 'fromS' | 'fromN' | 'fromW' | 'fromE' {
  switch (heading) {
    case 'N':
      return 'fromS'
    case 'S':
      return 'fromN'
    case 'E':
      return 'fromW'
    case 'W':
      return 'fromE'
  }
}

function pickNextAtIntersection(
  a: Agent,
  viNode: number,
  jNode: number,
  occV: boolean[],
  occH: boolean[],
  rng: () => number,
): void {
  const from = approachFrom(a.heading)
  const cx = roadStripCenterX(viNode)
  const cz = roadStripCenterZ(jNode)

  type Opt = { w: number; go: () => void }
  const opts: Opt[] = []

  const releaseOld = () => {
    if (a.slot.t === 'v') occV[a.slot.idx] = false
    else occH[a.slot.idx] = false
  }
  const claimV = (viStrip: number, laneSlot: number, heading: Heading) => {
    releaseOld()
    const idx = flatOccV(viStrip, laneSlot)
    occV[idx] = true
    a.slot = { t: 'v', idx }
    a.mode = 'v'
    a.vi = viStrip
    a.laneSlot = laneSlot
    a.laneV = laneOffsetForHeading('v', heading, laneSlot, viStrip)
  }
  const claimH = (hjStrip: number, laneSlot: number, heading: Heading) => {
    releaseOld()
    const idx = flatOccH(hjStrip, laneSlot)
    occH[idx] = true
    a.slot = { t: 'h', idx }
    a.mode = 'h'
    a.hj = hjStrip
    a.laneSlot = laneSlot
    a.laneH = laneOffsetForHeading('h', heading, laneSlot, hjStrip)
  }

  if (a.mode === 'v') {
    const vi = viNode
    const j = jNode
    if (from === 'fromS') {
      if (j < NUM_BLOCKS)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'N'
            a.laneV = laneOffsetForHeading('v', 'N', a.laneSlot, a.vi)
            a.x = cx + a.laneV
            a.z = cz
          },
        })
      if (vi > 0) {
        const lH = firstFreeH(occH, j)
        if (lH !== null)
          opts.push({
            w: 0.32,
            go: () => {
              a.heading = 'W'
              claimH(j, lH, a.heading)
              a.x = cx
              a.z = cz + a.laneH
            },
          })
      }
      if (vi < NUM_BLOCKS) {
        const lH = firstFreeH(occH, j)
        if (lH !== null)
          opts.push({
            w: 0.32,
            go: () => {
              a.heading = 'E'
              claimH(j, lH, a.heading)
              a.x = cx
              a.z = cz + a.laneH
            },
          })
      }
    } else {
      if (j > 0)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'S'
            a.laneV = laneOffsetForHeading('v', 'S', a.laneSlot, a.vi)
            a.x = cx + a.laneV
            a.z = cz
          },
        })
      if (vi < NUM_BLOCKS) {
        const lH = firstFreeH(occH, j)
        if (lH !== null)
          opts.push({
            w: 0.32,
            go: () => {
              a.heading = 'E'
              claimH(j, lH, a.heading)
              a.x = cx
              a.z = cz + a.laneH
            },
          })
      }
      if (vi > 0) {
        const lH = firstFreeH(occH, j)
        if (lH !== null)
          opts.push({
            w: 0.32,
            go: () => {
              a.heading = 'W'
              claimH(j, lH, a.heading)
              a.x = cx
              a.z = cz + a.laneH
            },
          })
      }
    }
  } else {
    const hj = jNode
    const vi = viNode
    const cz0 = roadStripCenterZ(hj)
    if (from === 'fromW') {
      if (vi < NUM_BLOCKS)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'E'
            a.laneH = laneOffsetForHeading('h', 'E', a.laneSlot, a.hj)
            a.x = cx
            a.z = cz0 + a.laneH
          },
        })
      if (hj < NUM_BLOCKS) {
        const lV = firstFreeV(occV, vi)
        if (lV !== null)
          opts.push({
            w: 0.32,
            go: () => {
              a.heading = 'N'
              claimV(vi, lV, a.heading)
              a.x = roadStripCenterX(vi) + a.laneV
              a.z = cz0
            },
          })
      }
      if (hj > 0) {
        const lV = firstFreeV(occV, vi)
        if (lV !== null)
          opts.push({
            w: 0.32,
            go: () => {
              a.heading = 'S'
              claimV(vi, lV, a.heading)
              a.x = roadStripCenterX(vi) + a.laneV
              a.z = cz0
            },
          })
      }
    } else {
      if (vi > 0)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'W'
            a.laneH = laneOffsetForHeading('h', 'W', a.laneSlot, a.hj)
            a.x = cx
            a.z = cz0 + a.laneH
          },
        })
      if (hj < NUM_BLOCKS) {
        const lV = firstFreeV(occV, vi)
        if (lV !== null)
          opts.push({
            w: 0.32,
            go: () => {
              a.heading = 'N'
              claimV(vi, lV, a.heading)
              a.x = roadStripCenterX(vi) + a.laneV
              a.z = cz0
            },
          })
      }
      if (hj > 0) {
        const lV = firstFreeV(occV, vi)
        if (lV !== null)
          opts.push({
            w: 0.32,
            go: () => {
              a.heading = 'S'
              claimV(vi, lV, a.heading)
              a.x = roadStripCenterX(vi) + a.laneV
              a.z = cz0
            },
          })
      }
    }
  }

  if (opts.length === 0) {
    const cxu = roadStripCenterX(viNode)
    const czu = roadStripCenterZ(jNode)
    const ls = a.slot.idx % LANES_PER_STRIP
    a.laneSlot = ls
    if (a.mode === 'v') {
      a.heading = a.heading === 'N' ? 'S' : 'N'
      a.laneV = laneOffsetForHeading('v', a.heading, ls, a.vi)
      a.x = cxu + a.laneV
      a.z = czu
    } else {
      const czh = roadStripCenterZ(jNode)
      a.heading = a.heading === 'E' ? 'W' : 'E'
      a.laneH = laneOffsetForHeading('h', a.heading, ls, a.hj)
      a.x = cxu
      a.z = czh + a.laneH
    }
    return
  }
  let tw = 0
  for (const o of opts) tw += o.w
  let r = rng() * tw
  for (const o of opts) {
    r -= o.w
    if (r <= 0) {
      o.go()
      return
    }
  }
  opts[opts.length - 1].go()
}

const LANE_SPAWN_STAGGER = 14

function newAgentState(heading: Heading) {
  const dx = heading === 'E' ? 1 : heading === 'W' ? -1 : 0
  const dz = heading === 'N' ? 1 : heading === 'S' ? -1 : 0
  return { cur: 0, dx, dz, brake: COMFORT_BRAKE, dodge: 0, dodgeTarget: 0, laneCd: 0, blocked: false, passAway: 0, stuck: 0 }
}

function spawnVertical(vi: number, laneSlot: number, salt: number, keepKind?: VehicleKind): Agent {
  const north = segmentRandom(vi, salt, 801) < 0.5
  const heading: Heading = north ? 'N' : 'S'
  const loff = laneOffsetForHeading('v', heading, laneSlot, vi)
  const cx = roadStripCenterX(vi)
  const k = keepKind ?? pickKind(vi * 97 + salt + laneSlot * 13)
  const zOff = laneSlot * LANE_SPAWN_STAGGER
  return {
    kind: k,
    speed: pickSpeed(k, vi + salt + laneSlot),
    mode: 'v',
    vi,
    hj: 0,
    laneSlot,
    laneV: loff,
    laneH: 0,
    heading,
    x: cx + loff,
    z: north
      ? Z0 - SPAWN_BEYOND + EDGE + zOff
      : Z1 + SPAWN_BEYOND - EDGE - zOff,
    slot: { t: 'v', idx: flatOccV(vi, laneSlot) },
    ...newAgentState(heading),
  }
}

function spawnHorizontal(hj: number, laneSlot: number, salt: number, keepKind?: VehicleKind): Agent {
  const east = segmentRandom(hj, salt, 811) < 0.5
  const heading: Heading = east ? 'E' : 'W'
  const loff = laneOffsetForHeading('h', heading, laneSlot, hj)
  const cz = roadStripCenterZ(hj)
  const k = keepKind ?? pickKind(hj * 89 + salt + laneSlot * 11)
  const xOff = laneSlot * LANE_SPAWN_STAGGER
  return {
    kind: k,
    speed: pickSpeed(k, hj + salt + laneSlot),
    mode: 'h',
    vi: 0,
    hj,
    laneSlot,
    laneV: 0,
    laneH: loff,
    heading,
    x: east
      ? X0 - SPAWN_BEYOND + EDGE + xOff
      : X1 + SPAWN_BEYOND - EDGE - xOff,
    z: cz + loff,
    slot: { t: 'h', idx: flatOccH(hj, laneSlot) },
    ...newAgentState(heading),
  }
}

function velocityWithSpeed(a: Agent, speedNow: number): { vx: number; vz: number } {
  switch (a.heading) {
    case 'N':
      return { vx: 0, vz: speedNow }
    case 'S':
      return { vx: 0, vz: -speedNow }
    case 'E':
      return { vx: speedNow, vz: 0 }
    case 'W':
      return { vx: -speedNow, vz: 0 }
  }
}

/** Distance before and after the junction box at which a turn starts and ends. */
const TURN_MARGIN = 1.5
const TURN_SPEED = 7.5

/**
 * The vehicle reached the edge of the junction box: choose where to go, and if that is a turn, plan a curve from
 * here, through the point where the old and new lanes meet, to the new lane on the far side of the box.
 */
function enterJunction(a: Agent, i: number, j: number, occV: boolean[], occH: boolean[], rng: () => number) {
  const x0 = a.x
  const z0 = a.z
  const h0 = a.heading
  pickNextAtIntersection(a, i, j, occV, occH, rng)
  a.x = x0
  a.z = z0
  if (a.heading === h0) return
  const cx = roadStripCenterX(i)
  const cz = roadStripCenterZ(j)
  let x2: number
  let z2: number
  switch (a.heading) {
    case 'N':
      x2 = cx + a.laneV
      z2 = cz + ewHalf(j) + TURN_MARGIN
      break
    case 'S':
      x2 = cx + a.laneV
      z2 = cz - ewHalf(j) - TURN_MARGIN
      break
    case 'E':
      x2 = cx + nsHalf(i) + TURN_MARGIN
      z2 = cz + a.laneH
      break
    case 'W':
      x2 = cx - nsHalf(i) - TURN_MARGIN
      z2 = cz + a.laneH
      break
  }
  const fromNs = h0 === 'N' || h0 === 'S'
  const toNs = a.heading === 'N' || a.heading === 'S'
  // Perpendicular turns aim for where the lanes cross; a U-turn at the map edge swings round the junction centre.
  const x1 = fromNs === toNs ? cx : fromNs ? x0 : x2
  const z1 = fromNs === toNs ? cz : fromNs ? z2 : z0
  a.dodge = 0
  a.dodgeTarget = 0
  a.arc = { x0, z0, x1, z1, x2, z2, t: 0, len: Math.max(1, (Math.hypot(x1 - x0, z1 - z0) + Math.hypot(x2 - x1, z2 - z1)) * 0.9) }
}

function advanceArc(a: Agent, d: number, speedNow: number) {
  const r = a.arc!
  r.t += (speedNow * d) / r.len
  if (r.t >= 1) {
    a.x = r.x2
    a.z = r.z2
    a.arc = undefined
    return
  }
  const u = 1 - r.t
  a.x = u * u * r.x0 + 2 * u * r.t * r.x1 + r.t * r.t * r.x2
  a.z = u * u * r.z0 + 2 * u * r.t * r.z1 + r.t * r.t * r.z2
  const tx = u * (r.x1 - r.x0) + r.t * (r.x2 - r.x1)
  const tz = u * (r.z1 - r.z0) + r.t * (r.z2 - r.z1)
  const l = Math.hypot(tx, tz)
  if (l > 1e-4) {
    a.dx = tx / l
    a.dz = tz / l
  }
}

function integrateAgent(
  a: Agent,
  dt: number,
  occV: boolean[],
  occH: boolean[],
  rng: () => number,
  speedNow: number,
): boolean {
  const d = Math.min(dt, 0.055)
  if (a.round) {
    advanceRound(a, d, speedNow)
    if (a.round) {
      const th = a.round.th
      a.dx = -Math.sin(th)
      a.dz = Math.cos(th)
    }
    return true
  }
  if (a.arc) {
    advanceArc(a, d, speedNow)
    return true
  }
  // Reached a roundabout's give-way line: go round instead of straight through the island.
  const kNext = nextJunctionIndex(a)
  if (kNext >= 0) {
    const jnR = a.mode === 'v' ? junctionAt(a.vi, kNext) : junctionAt(kNext, a.hj)
    if (jnR?.control === 'roundabout' && distToStopLine(jnR, a.heading, a.x, a.z) <= 0) {
      startRound(a, jnR.i, jnR.j, occV, occH, rng)
      return true
    }
  }
  const { vx, vz } = velocityWithSpeed(a, speedNow)
  a.dx = a.heading === 'E' ? 1 : a.heading === 'W' ? -1 : 0
  a.dz = a.heading === 'N' ? 1 : a.heading === 'S' ? -1 : 0
  const px = a.x
  const pz = a.z
  a.x += vx * d
  a.z += vz * d
  a.dodge += (a.dodgeTarget - a.dodge) * Math.min(1, d * 2.2)

  if (a.mode === 'v') {
    const vi = a.vi
    const tx = roadStripCenterX(vi) + a.laneV + a.dodge
    a.x += (tx - a.x) * Math.min(1, d * 2.35)

    if (vz > 0) {
      for (let j = 0; j <= NUM_BLOCKS; j++) {
        const edge = roadStripCenterZ(j) - ewHalf(j) - TURN_MARGIN
        if (pz < edge && a.z >= edge) {
          enterJunction(a, vi, j, occV, occH, rng)
          break
        }
      }
    } else if (vz < 0) {
      for (let j = NUM_BLOCKS; j >= 0; j--) {
        const edge = roadStripCenterZ(j) + ewHalf(j) + TURN_MARGIN
        if (pz > edge && a.z <= edge) {
          enterJunction(a, vi, j, occV, occH, rng)
          break
        }
      }
    }
  } else {
    const hj = a.hj
    const tz = roadStripCenterZ(hj) + a.laneH + a.dodge
    a.z += (tz - a.z) * Math.min(1, d * 2.35)

    if (vx > 0) {
      for (let i = 0; i <= NUM_BLOCKS; i++) {
        const edge = roadStripCenterX(i) - nsHalf(i) - TURN_MARGIN
        if (px < edge && a.x >= edge) {
          enterJunction(a, i, hj, occV, occH, rng)
          break
        }
      }
    } else if (vx < 0) {
      for (let i = NUM_BLOCKS; i >= 0; i--) {
        const edge = roadStripCenterX(i) + nsHalf(i) + TURN_MARGIN
        if (px > edge && a.x <= edge) {
          enterJunction(a, i, hj, occV, occH, rng)
          break
        }
      }
    }
  }

  const margin = EDGE - 0.8
  if (a.mode === 'v') {
    if (a.heading === 'N' && a.z > Z1 - margin) {
      if (a.slot.t === 'v') occV[a.slot.idx] = false
      else occH[a.slot.idx] = false
      return false
    }
    if (a.heading === 'S' && a.z < Z0 + margin) {
      if (a.slot.t === 'v') occV[a.slot.idx] = false
      else occH[a.slot.idx] = false
      return false
    }
  } else {
    if (a.heading === 'E' && a.x > X1 - margin) {
      if (a.slot.t === 'v') occV[a.slot.idx] = false
      else occH[a.slot.idx] = false
      return false
    }
    if (a.heading === 'W' && a.x < X0 + margin) {
      if (a.slot.t === 'v') occV[a.slot.idx] = false
      else occH[a.slot.idx] = false
      return false
    }
  }

  return true
}

const Y_UP = new THREE.Vector3(0, 1, 0)
const tmpAgentQuat = new THREE.Quaternion()
const tmpNext = { x: 0, y: 0.09, z: 0 }

/** Moves the collider. Kinematic "next" moves give contacts a real velocity; `teleport` is for respawns only. */
function applyAgentToRigidBody(a: Agent, rb: RapierRigidBody, world: { getRigidBody(handle: number): unknown }, yawRad: number, teleport: boolean) {
  if (world.getRigidBody(rb.handle) == null) return
  tmpNext.x = a.x
  tmpNext.z = a.z
  const q = tmpAgentQuat.setFromAxisAngle(Y_UP, yawRad)
  if (teleport) {
    rb.setTranslation(tmpNext, true)
    rb.setRotation(q, true)
  } else {
    rb.setNextKinematicTranslation(tmpNext)
    rb.setNextKinematicRotation(q)
  }
}

/** Comfortable braking (m/s²) the speed profile is planned with; the smoother allows a bit more. */
const PLAN_DECEL = 3.0
/** Everyday braking limit, and the hardest a driver will stand on the brakes for someone in the right. */
const COMFORT_BRAKE = 4.8
const EMERGENCY_BRAKE = 13
/** Gap from the rider's bike to the nose of a car waiting behind her: far enough to stay behind the chase camera. */
const BIKE_GAP = 6.5
/** Gap to a rider crossing in front. */
const CROSSING_GAP = 2.5
const BIKE_HALF_W = 0.32

function halfWidth(kind: VehicleKind): number {
  return vehicleCollider(kind).args[0]
}

function isTwoWheeler(kind: VehicleKind): boolean {
  return kind === 'motorbike' || kind === 'bicycle'
}

/** Speed that still allows a stop `gap` metres behind something moving at `v`. */
function followProfile(gap: number, v: number): number {
  return gap <= 0.2 ? Math.min(v, 0.5 + Math.max(0, gap)) : Math.sqrt(v * v + 2 * PLAN_DECEL * gap)
}

function stopProfile(d: number): number {
  return d <= 0.2 ? 0 : Math.sqrt(2 * PLAN_DECEL * d)
}

/** Index of the next junction strip ahead along the agent's heading, or -1. */
function nextJunctionIndex(a: Agent): number {
  switch (a.heading) {
    case 'N':
      for (let k = 0; k <= NUM_BLOCKS; k++) if (roadStripCenterZ(k) > a.z + 0.05) return k
      return -1
    case 'S':
      for (let k = NUM_BLOCKS; k >= 0; k--) if (roadStripCenterZ(k) < a.z - 0.05) return k
      return -1
    case 'E':
      for (let k = 0; k <= NUM_BLOCKS; k++) if (roadStripCenterX(k) > a.x + 0.05) return k
      return -1
    case 'W':
      for (let k = NUM_BLOCKS; k >= 0; k--) if (roadStripCenterX(k) < a.x - 0.05) return k
      return -1
  }
}

/**
 * Is the rider in the wrong here, so that this driver can't be expected to save her? Riding at them against the
 * flow, or crossing their path against the lights or a STOP / give-way line. In those cases the driver only reacts
 * with ordinary braking, so she can really be knocked; otherwise they brake as hard as it takes.
 */
function riderAtFault(a: Agent, vAlong: number, vLat: number, jn: ReturnType<typeof junctionAt> | null, t: number): boolean {
  if (vAlong < -1.5) return true
  if (!jn || Math.abs(vLat) < 2 || Math.abs(vLat) < Math.abs(vAlong)) return false
  const myAxis = axisOf(a.heading)
  const herAxis = myAxis === 'ns' ? 'ew' : 'ns'
  if (jn.control === 'signal') return signalAspect(jn, herAxis, t) === 'red'
  if (jn.control === 'stop' || jn.control === 'giveway') return mustYield(jn, herAxis) && !mustYield(jn, myAxis)
  return false
}

/** Reads the road ahead and returns the speed to aim for; also sets `a.brake`, `a.blocked` and `a.passAway`. */
function controlledTargetSpeed(
  a: Agent,
  index: number,
  currentSpeed: number,
  hold: { key: number; until: number },
  t: number,
  dt: number,
  others: readonly (Agent | null)[],
): number {
  let target = a.speed
  a.brake = COMFORT_BRAKE
  a.blocked = false
  a.passAway = 0
  const w = halfWidth(a.kind)
  const nose = vehicleNose(a.kind)
  const ns = a.heading === 'N' || a.heading === 'S'
  let vehicleBlock = false

  // Other vehicles: match the speed of what is ahead; yield to anything crossing just in front.
  if (a.stuck < 22) {
    const look = Math.max(18, currentSpeed * 2.4)
    for (let n = 0; n < others.length; n++) {
      const o = others[n]
      if (!o || o === a) continue
      const rx = o.x - a.x
      const rz = o.z - a.z
      if (Math.abs(rx) > look + 6 || Math.abs(rz) > look + 6) continue
      const ahead = rx * a.dx + rz * a.dz
      if (ahead <= 0 || ahead > look) continue
      const lateral = Math.abs(rx * a.dz - rz * a.dx)
      const clear = w + halfWidth(o.kind) + 0.3
      if (lateral > clear) continue
      const along = o.dx * a.dx + o.dz * a.dz
      const gap = ahead - nose - vehicleNose(o.kind) - 1.5
      if (along > 0.5) {
        target = Math.min(target, followProfile(gap, o.cur))
        if (gap < 12 && o.cur < a.speed * 0.7) {
          a.blocked = true
          vehicleBlock = true
        }
      } else if (ahead < nose + 7) {
        // Crossing or turning across us. If we are also in its path, the lower-numbered vehicle goes first so
        // two drivers can't wait for each other for ever.
        const backRx = -rx
        const backRz = -rz
        const itSeesUs = backRx * o.dx + backRz * o.dz > 0 && Math.abs(backRx * o.dz - backRz * o.dx) < clear
        if (itSeesUs && index < n) continue
        target = Math.min(target, stopProfile(gap))
        vehicleBlock = true
      }
    }
  }
  // After this long at a standstill behind other traffic (longer than any red light) a vehicle stops waiting for them.
  a.stuck = vehicleBlock && currentSpeed < 0.2 ? a.stuck + dt : Math.max(0, a.stuck - dt * 2)
  if (a.stuck >= 26) a.stuck = 0

  const k = nextJunctionIndex(a)
  const jn = k >= 0 && !a.arc && !a.round ? (a.mode === 'v' ? junctionAt(a.vi, k) : junctionAt(k, a.hj)) : null
  if (a.arc) target = Math.min(target, TURN_SPEED)
  if (jn) {
    const axis = axisOf(a.heading)
    const d = distToStopLine(jn, a.heading, a.x, a.z) - nose
    const key = jn.i * 100 + jn.j
    // Everyone eases off approaching a junction, so turning in doesn't need a sudden stab of the brakes.
    if (d > -0.4 && d < 22) target = Math.min(target, Math.max(TURN_SPEED, TURN_SPEED + (d / 22) * 7))
    if (jn.control !== 'none' && d > -0.4 && d < 40) {
      if (jn.control === 'signal') {
        const aspect = signalAspect(jn, axis, t)
        const canStop = d > (currentSpeed * currentSpeed) / (2 * 4.2)
        if (aspect === 'red' || (aspect === 'amber' && canStop)) {
          target = Math.min(target, stopProfile(d))
        }
      } else if (jn.control === 'roundabout') {
        // Give way to anything already going round near our entry.
        const ex = a.x + a.dx * Math.max(0, d)
        const ez = a.z + a.dz * Math.max(0, d)
        let busy = false
        for (const o of others) {
          if (o && o !== a && o.round && o.round.cx === jn.x && o.round.cz === jn.z && Math.hypot(o.x - ex, o.z - ez) < 8.5) {
            busy = true
            break
          }
        }
        target = Math.min(target, busy ? stopProfile(d) : Math.max(2.4, stopProfile(d)))
      } else if (mustYield(jn, axis)) {
        if (jn.control === 'stop') {
          if (hold.key !== key) {
            target = Math.min(target, stopProfile(d))
            if (d < 0.5 && currentSpeed < 0.3) {
              if (hold.until === 0) hold.until = t + 1.1
              else if (t >= hold.until) {
                hold.key = key
                hold.until = 0
              }
            }
          }
        } else {
          target = Math.min(target, Math.max(2.6, stopProfile(d)))
        }
      }
    }
  }

  // The rider: drivers watch where she is and where she is about to be, not only their own lane.
  const b = bikeTelemetry
  const rx = b.x - a.x
  const rz = b.z - a.z
  if (Math.abs(rx) < 60 && Math.abs(rz) < 60) {
    const bvx = -Math.sin(b.yaw) * b.speed
    const bvz = -Math.cos(b.yaw) * b.speed
    const ahead = rx * a.dx + rz * a.dz
    const lat = rx * a.dz - rz * a.dx
    const vAlong = bvx * a.dx + bvz * a.dz
    const vLat = bvx * a.dz - bvz * a.dx
    const touching = w + BIKE_HALF_W + 0.15
    if (ahead > -0.5 && ahead < nose + 1.3 && Math.abs(lat) < touching) {
      // Contact, or about to be: stop dead. A vehicle never drives through or over her, whoever is to blame.
      a.brake = 1000
      return 0
    }
    const horizon = Math.max(20, (currentSpeed * currentSpeed) / 6 + 12)
    if (ahead > 0 && ahead < horizon) {
      const fault = riderAtFault(a, vAlong, vLat, jn, t)
      const corridor = w + BIKE_HALF_W + 0.7
      const closing = Math.max(0.5, currentSpeed - vAlong)
      const tReach = Math.min(2, (ahead - nose) / closing)
      // Someone riding in the wrong isn't anticipated; someone in the right is.
      const latSoon = fault ? lat : lat + vLat * Math.max(0, tReach)
      const crossesPath = lat * latSoon < 0
      if (Math.abs(lat) < corridor || Math.abs(latSoon) < corridor || crossesPath) {
        const crossing = Math.abs(vLat) >= 2 && Math.abs(vLat) > Math.abs(vAlong)
        const gap = ahead - nose - (crossing || fault ? CROSSING_GAP : BIKE_GAP)
        const herSpeed = Math.max(0, vAlong)
        target = Math.min(target, followProfile(gap, herSpeed))
        const need = Math.max(0, currentSpeed * currentSpeed - herSpeed * herSpeed) / (2 * Math.max(gap, 0.5))
        a.brake = fault ? COMFORT_BRAKE : THREE.MathUtils.clamp(need * 1.2, COMFORT_BRAKE, EMERGENCY_BRAKE)
        // Slow or stopped ahead: look for a way round on the side away from her.
        if (!crossing && !fault && herSpeed < a.speed * 0.6 && ahead - nose < 14) {
          a.blocked = true
          const crossAxis = ns ? rx : rz
          a.passAway = crossAxis > 0.05 ? -1 : crossAxis < -0.05 ? 1 : 0
        }
      }
    }
  }
  return target
}

/** Easing round whatever is in the way: a lane change on two-lane roads; two-wheelers squeeze past within the lane. */
function planPass(a: Agent, others: readonly (Agent | null)[], dt: number) {
  a.laneCd = Math.max(0, a.laneCd - dt)
  if (a.arc || a.round) return
  const ns = a.mode === 'v'
  const kind = ns ? nsKind(a.vi) : ewKind(a.hj)
  const half = ns ? nsHalf(a.vi) : ewHalf(a.hj)
  const laneOff = ns ? a.laneV : a.laneH
  if (!a.blocked) {
    if (a.laneCd <= 0) a.dodgeTarget = 0
    return
  }
  const clearOf = (targetCross: number) => {
    for (const o of others) {
      if (!o || o === a) continue
      const along = Math.abs(ns ? o.z - a.z : o.x - a.x)
      const cross = Math.abs((ns ? o.x - roadStripCenterX(a.vi) : o.z - roadStripCenterZ(a.hj)) - targetCross)
      if (along < 11 && cross < 1.6) return false
    }
    const riderAlong = Math.abs(ns ? bikeTelemetry.z - a.z : bikeTelemetry.x - a.x)
    const riderCross = Math.abs((ns ? bikeTelemetry.x - roadStripCenterX(a.vi) : bikeTelemetry.z - roadStripCenterZ(a.hj)) - targetCross)
    return !(riderAlong < 9 && riderCross < 1.8)
  }
  if (isTwoWheeler(a.kind)) {
    if (a.laneCd > 0) return
    const away = a.passAway || Math.sign(laneOff) || 1
    for (const side of [away, -away]) {
      const target = laneOff + side * 1.7
      if (Math.abs(target) < half - 0.5 && Math.sign(target) === Math.sign(laneOff) && clearOf(target)) {
        a.dodgeTarget = side * 1.7
        a.laneCd = 3
        return
      }
    }
    return
  }
  if (a.laneCd > 0) return
  if (kind === 'dual' || kind === 'main') {
    const other = a.laneSlot % 2 === 0 ? a.laneSlot + 1 : a.laneSlot - 1
    const next = laneOffsetForHeading(ns ? 'v' : 'h', a.heading, other, ns ? a.vi : a.hj)
    if (clearOf(next)) {
      a.laneSlot = other
      if (ns) a.laneV = next
      else a.laneH = next
      a.laneCd = 5
    }
  } else if (a.passAway !== 0) {
    // One lane each way: ease past a stopped rider within the road, if nothing is coming the other way.
    const target = laneOff + a.passAway * 1.5
    const coming = others.some((o) => {
      if (!o || o === a || o.mode !== a.mode || o.heading === a.heading) return false
      if ((ns ? o.vi : o.hj) !== (ns ? a.vi : a.hj)) return false
      return Math.abs(ns ? o.z - a.z : o.x - a.x) < 28
    })
    if (Math.abs(target) + halfWidth(a.kind) < half - 0.1 && !coming) {
      a.dodgeTarget = a.passAway * 1.5
      a.laneCd = 3
    }
  }
}

const NUM_STRIPS = NUM_BLOCKS + 1
const NUM_V_SLOTS = NUM_STRIPS * LANES_PER_STRIP

/**
 * Two vehicles per N–S strip and two per E–W strip, on the same carriageway side but **inner vs
 * outer** lateral offsets so they do not share one line. They drive to the map edge (no mid-road
 * looping) and pick random turns when a free slot
 * exists on the target road. Spawns sit beyond the city so traffic enters from outside the fog band;
 * stable RigidBody keys avoid remount-at-origin pops. Yaw and speed are smoothed toward targets.
 * Kinematic rigid bodies with cuboid colliders — boda can collide (speed bump + stun).
 */
export function RoadTraffic() {
  const { world } = useRapier()

  const initial = useMemo(() => {
    const ov = Array(NUM_V_SLOTS).fill(false) as boolean[]
    const oh = Array(NUM_V_SLOTS).fill(false) as boolean[]
    const agents: (Agent | null)[] = []
    for (let vi = 0; vi < NUM_STRIPS; vi++) {
      for (let lane = 0; lane < LANES_PER_STRIP; lane++) {
        const idx = flatOccV(vi, lane)
        ov[idx] = true
        agents.push(spawnVertical(vi, lane, vi * 17 + lane * 31))
      }
    }
    for (let hj = 0; hj < NUM_STRIPS; hj++) {
      for (let lane = 0; lane < LANES_PER_STRIP; lane++) {
        const idx = flatOccH(hj, lane)
        oh[idx] = true
        agents.push(spawnHorizontal(hj, lane, hj * 19 + lane * 29 + 3))
      }
    }
    return { ov, oh, agents }
  }, [])

  const occV = useRef(initial.ov)
  const occH = useRef(initial.oh)
  const agentsRef = useRef(initial.agents)
  /** Vehicle Rapier bodies (name kept `groupRefs` for older HMR chunks that still reference it). */
  const groupRefs = useRef<(RapierRigidBody | null)[]>([])
  const smoothYawRef = useRef<number[]>([])
  const smoothSpeedRef = useRef<number[]>([])
  /** Per-agent STOP-sign state (see `controlledTargetSpeed`). */
  const holdRef = useRef<{ key: number; until: number }[]>([])
  /** Each slot keeps its vehicle type for the whole session: respawning re-uses the same body and instance. */
  const kinds = useMemo(() => initial.agents.map((ag) => ag!.kind), [initial])

  const slotKeys = useMemo(() => {
    const k: string[] = []
    for (let vi = 0; vi < NUM_STRIPS; vi++) {
      for (let lane = 0; lane < LANES_PER_STRIP; lane++) k.push(`v-${vi}-L${lane}`)
    }
    for (let hj = 0; hj < NUM_STRIPS; hj++) {
      for (let lane = 0; lane < LANES_PER_STRIP; lane++) k.push(`h-${hj}-L${lane}`)
    }
    return k
  }, [])

  useFrame((_, dt) => {
    const rng = Math.random
    const agents = agentsRef.current
    const ov = occV.current
    const oh = occH.current
    const n = agents.length
    const yawBuf = smoothYawRef.current
    const spdBuf = smoothSpeedRef.current
    while (yawBuf.length < n) yawBuf.push(Number.NaN)
    while (spdBuf.length < n) spdBuf.push(Number.NaN)

    for (let i = 0; i < n; i++) {
      let a = agents[i]
      const rb = groupRefs.current[i]
      if (!rb || world.getRigidBody(rb.handle) == null) continue

      if (!a) {
        continue
      }

      const targetYaw = a.round ? roundYaw(a) : a.arc ? Math.atan2(a.dx, a.dz) : headingToYaw(a.heading)
      let sy = yawBuf[i]
      if (!Number.isFinite(sy)) sy = targetYaw
      const yawDiff = Math.atan2(
        Math.sin(targetYaw - sy),
        Math.cos(targetYaw - sy),
      )
      sy += yawDiff * (1 - Math.exp(-9 * dt))
      yawBuf[i] = sy

      let sp = spdBuf[i]
      if (!Number.isFinite(sp)) sp = a.speed
      let hold = holdRef.current[i]
      if (!hold) hold = holdRef.current[i] = { key: -1, until: 0 }
      const tgtSp = controlledTargetSpeed(a, i, sp, hold, worldClock.t, dt, agents)
      const maxStep = (tgtSp < sp ? a.brake : 3.2) * dt
      sp += Math.sign(tgtSp - sp) * Math.min(Math.abs(tgtSp - sp), maxStep)
      spdBuf[i] = sp
      a.cur = sp
      planPass(a, agents, dt)

      let teleport = false
      const alive = integrateAgent(a, dt, ov, oh, rng, sp)
      if (!alive) {
        const wasV = i < NUM_V_SLOTS
        const salt = Math.floor(performance.now() + i) % 997
        if (wasV) {
          const idx = i
          ov[idx] = false
          const vi = Math.floor(idx / LANES_PER_STRIP)
          const laneSlot = idx % LANES_PER_STRIP
          const na = spawnVertical(vi, laneSlot, salt, a.kind)
          ov[idx] = true
          agents[i] = na
        } else {
          const hi = i - NUM_V_SLOTS
          oh[hi] = false
          const hj = Math.floor(hi / LANES_PER_STRIP)
          const laneSlot = hi % LANES_PER_STRIP
          const na = spawnHorizontal(hj, laneSlot, salt, a.kind)
          oh[hi] = true
          agents[i] = na
        }
        a = agents[i]!
        holdRef.current[i] = { key: -1, until: 0 }
        yawBuf[i] = headingToYaw(a.heading)
        spdBuf[i] = a.speed
        a.cur = a.speed
        teleport = true
      }

      if (agents[i]) {
        const ag = agents[i]!
        applyAgentToRigidBody(ag, rb, world, yawBuf[i], teleport)
        if (i < trafficTelemetry.x.length) {
          trafficTelemetry.x[i] = ag.x
          trafficTelemetry.z[i] = ag.z
          trafficTelemetry.vx[i] = ag.dx * spdBuf[i]
          trafficTelemetry.vz[i] = ag.dz * spdBuf[i]
          trafficTelemetry.yaw[i] = yawBuf[i]
        }
      }
    }
    trafficTelemetry.count = Math.min(n, trafficTelemetry.x.length)
  })

  return (
    <group>
      <TrafficInstances kinds={kinds} />
      {slotKeys.map((key, i) => {
        // Kind and start position are fixed per slot, so these come from the initial plan, not the live agents.
        const ag = initial.agents[i]
        const col = ag ? vehicleCollider(ag.kind) : null
        return (
          <RigidBody
            key={key}
            ref={(el) => {
              groupRefs.current[i] = el
            }}
            position={ag ? [ag.x, 0.09, ag.z] : [0, -999, 0]}
            type="kinematicPosition"
            colliders={false}
            userData={{ kind: 'vehicle' }}
            friction={0.35}
            restitution={0.06}
            canSleep={false}
          >
            {ag && col ? (
              <CuboidCollider args={col.args} position={[col.pos[0], col.pos[1] - 0.09, col.pos[2]]} />
            ) : null}
          </RigidBody>
        )
      })}
    </group>
  )
}
