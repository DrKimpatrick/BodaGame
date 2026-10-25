import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  type RapierRigidBody,
  RigidBody,
  useRapier,
} from '@react-three/rapier'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  CITY_START,
  CITY_TOTAL,
  NUM_BLOCKS,
  ewKind,
  laneCentres,
  nsKind,
  roadStripCenterX,
  roadStripCenterZ,
} from '@game/cityGrid'
import { segmentRandom } from '@game/roadDecorPlacements'
import { StaticBatch } from './StaticBatch'
import { VehicleModel } from './realism/Vehicles'
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
const IZ_EPS = 0.2
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
  /**
   * Going round a roundabout: clockwise arc (angle decreasing) from the entry to the exit point, radius
   * easing from the entry distance to the ring and back out.
   */
  round?: { cx: number; cz: number; th: number; th0: number; th1: number; r0: number; r1: number; ex: number; ez: number }
}

/** Clockwise travel around a roundabout. Returns true while still on the arc. */
function advanceRound(a: Agent, d: number, speedNow: number): boolean {
  const r = a.round!
  const span = r.th0 - r.th1
  const t0 = (r.th0 - r.th) / span
  const rad = t0 < 0.25 ? THREE.MathUtils.lerp(r.r0, ROUNDABOUT.ring, t0 / 0.25) : t0 > 0.75 ? THREE.MathUtils.lerp(ROUNDABOUT.ring, r.r1, (t0 - 0.75) / 0.25) : ROUNDABOUT.ring
  r.th -= (Math.max(1.5, speedNow) * d) / rad
  if (r.th <= r.th1) {
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
  while (th1 >= th0 - 0.3) th1 -= Math.PI * 2
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
  return Math.atan2(-Math.sin(th), -Math.cos(th))
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

function pickSpeed(kind: VehicleKind, salt: number): number {
  const r = segmentRandom(salt, salt >> 5, 702)
  switch (kind) {
    case 'bus':
      return 4.2 + r * 2.8
    case 'trailer':
      return 3.6 + r * 2.4
    case 'pickup':
      return 7.5 + r * 4.2
    case 'taxi':
      return 10.5 + r * 6
    case 'bicycle':
      return 3 + r * 3.2
    case 'motorbike':
      return 12 + r * 7
    case 'sedan':
      return 9.5 + r * 5.5
    case 'van':
      return 5.8 + r * 3.4
    case 'suv':
      return 8 + r * 4.5
    case 'matatu':
      return 5.5 + r * 3.2
    default:
      return 9 + r * 4
  }
}

function headingToYaw(h: Heading): number {
  switch (h) {
    case 'N':
      return 0
    case 'S':
      return Math.PI
    case 'E':
      return -Math.PI / 2
    case 'W':
      return Math.PI / 2
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

function spawnVertical(vi: number, laneSlot: number, salt: number): Agent {
  const north = segmentRandom(vi, salt, 801) < 0.5
  const heading: Heading = north ? 'N' : 'S'
  const loff = laneOffsetForHeading('v', heading, laneSlot, vi)
  const cx = roadStripCenterX(vi)
  const k = pickKind(vi * 97 + salt + laneSlot * 13)
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
  }
}

function spawnHorizontal(hj: number, laneSlot: number, salt: number): Agent {
  const east = segmentRandom(hj, salt, 811) < 0.5
  const heading: Heading = east ? 'E' : 'W'
  const loff = laneOffsetForHeading('h', heading, laneSlot, hj)
  const cz = roadStripCenterZ(hj)
  const k = pickKind(hj * 89 + salt + laneSlot * 11)
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
  const px = a.x
  const pz = a.z
  a.x += vx * d
  a.z += vz * d

  if (a.mode === 'v') {
    const vi = a.vi
    const tx = roadStripCenterX(vi) + a.laneV
    a.x += (tx - a.x) * Math.min(1, d * 2.35)

    if (vz > 0) {
      for (let j = 0; j <= NUM_BLOCKS; j++) {
        const iz = roadStripCenterZ(j)
        if (pz < iz - IZ_EPS && a.z >= iz - IZ_EPS) {
          a.z = iz
          pickNextAtIntersection(a, vi, j, occV, occH, rng)
          break
        }
      }
    } else if (vz < 0) {
      for (let j = NUM_BLOCKS; j >= 0; j--) {
        const iz = roadStripCenterZ(j)
        if (pz > iz + IZ_EPS && a.z <= iz + IZ_EPS) {
          a.z = iz
          pickNextAtIntersection(a, vi, j, occV, occH, rng)
          break
        }
      }
    }
  } else {
    const hj = a.hj
    const tz = roadStripCenterZ(hj) + a.laneH
    a.z += (tz - a.z) * Math.min(1, d * 2.35)

    if (vx > 0) {
      for (let i = 0; i <= NUM_BLOCKS; i++) {
        const ix = roadStripCenterX(i)
        if (px < ix - IZ_EPS && a.x >= ix - IZ_EPS) {
          a.x = ix
          pickNextAtIntersection(a, i, hj, occV, occH, rng)
          break
        }
      }
    } else if (vx < 0) {
      for (let i = NUM_BLOCKS; i >= 0; i--) {
        const ix = roadStripCenterX(i)
        if (px > ix + IZ_EPS && a.x <= ix + IZ_EPS) {
          a.x = ix
          pickNextAtIntersection(a, i, hj, occV, occH, rng)
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

function applyAgentToRigidBody(
  a: Agent,
  rb: RapierRigidBody,
  world: { getRigidBody(handle: number): unknown },
  yawRad: number,
) {
  if (world.getRigidBody(rb.handle) == null) return
  rb.setTranslation({ x: a.x, y: 0.09, z: a.z }, true)
  const q = tmpAgentQuat.setFromAxisAngle(Y_UP, yawRad)
  rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
}

const Y_UP = new THREE.Vector3(0, 1, 0)
const tmpAgentQuat = new THREE.Quaternion()

/** Comfortable braking (m/s²) the speed profile is planned with; the smoother allows a bit more. */
const PLAN_DECEL = 3.0
/** Gap kept behind the rider's bike. */
// Far enough that a car queuing behind the rider stays behind the chase camera (~5 m back).
const BIKE_GAP = 6.5

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
 * Target speed honouring signals, STOP / give-way lines and the rider's bike ahead.
 * `hold` keeps per-agent STOP state: [junction key already stopped at, release time].
 */
function controlledTargetSpeed(
  a: Agent,
  currentSpeed: number,
  hold: { key: number; until: number },
  t: number,
  others: readonly (Agent | null)[],
): number {
  let target = a.speed
  // Follow the vehicle ahead on the same road and heading instead of driving through it.
  for (const o of others) {
    if (!o || o === a || o.heading !== a.heading) continue
    let ahead: number
    let lateral: number
    if (a.heading === 'N' || a.heading === 'S') {
      ahead = (o.z - a.z) * (a.heading === 'N' ? 1 : -1)
      lateral = Math.abs(o.x - a.x)
    } else {
      ahead = (o.x - a.x) * (a.heading === 'E' ? 1 : -1)
      lateral = Math.abs(o.z - a.z)
    }
    if (ahead <= 0 || ahead > 18 || lateral > 1.2) continue
    const gap = ahead - vehicleNose(a.kind) - vehicleNose(o.kind) - 1.5
    target = Math.min(target, stopProfile(gap))
  }
  const k = nextJunctionIndex(a)
  if (k >= 0) {
    const jn = a.mode === 'v' ? junctionAt(a.vi, k) : junctionAt(k, a.hj)
    if (jn && jn.control !== 'none') {
      const axis = axisOf(a.heading)
      const d = distToStopLine(jn, a.heading, a.x, a.z) - vehicleNose(a.kind)
      const key = jn.i * 100 + jn.j
      if (d > -0.4 && d < 40) {
        if (jn.control === 'signal') {
          const aspect = signalAspect(jn, axis, t)
          const canStop = d > (currentSpeed * currentSpeed) / (2 * 4.2)
          if (aspect === 'red' || (aspect === 'amber' && canStop)) {
            target = Math.min(target, stopProfile(d))
          }
        } else if (jn.control === 'roundabout') {
          // Give way to anything already going round near our entry.
          const ex = a.x + (a.heading === 'E' ? 1 : a.heading === 'W' ? -1 : 0) * Math.max(0, d)
          const ez = a.z + (a.heading === 'N' ? 1 : a.heading === 'S' ? -1 : 0) * Math.max(0, d)
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
  }
  // Never drive into the rider: stop BIKE_GAP behind her if she is ahead in this lane.
  const bx = bikeTelemetry.x - a.x
  const bz = bikeTelemetry.z - a.z
  let ahead = -1
  let lateral = 99
  switch (a.heading) {
    case 'N':
      ahead = bz
      lateral = Math.abs(bx)
      break
    case 'S':
      ahead = -bz
      lateral = Math.abs(bx)
      break
    case 'E':
      ahead = bx
      lateral = Math.abs(bz)
      break
    case 'W':
      ahead = -bx
      lateral = Math.abs(bz)
      break
  }
  // Wide lateral window: the rider may sit anywhere in the lane, or be crossing in front at a junction.
  if (ahead > -0.5 && ahead < 16 && lateral < 1.7) {
    target = Math.min(target, stopProfile(ahead - BIKE_GAP))
  }
  return target
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
  const [, setRenderTick] = useState(0)

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

      const targetYaw = a.round ? roundYaw(a) : headingToYaw(a.heading)
      let sy = yawBuf[i]
      if (!Number.isFinite(sy)) sy = targetYaw
      const yawDiff = Math.atan2(
        Math.sin(targetYaw - sy),
        Math.cos(targetYaw - sy),
      )
      sy += yawDiff * (1 - Math.exp(-6.2 * dt))
      yawBuf[i] = sy

      let sp = spdBuf[i]
      if (!Number.isFinite(sp)) sp = a.speed
      let hold = holdRef.current[i]
      if (!hold) hold = holdRef.current[i] = { key: -1, until: 0 }
      const tgtSp = controlledTargetSpeed(a, sp, hold, worldClock.t, agents)
      const maxStep = (tgtSp < sp ? 4.8 : 3.6) * dt
      sp += Math.sign(tgtSp - sp) * Math.min(Math.abs(tgtSp - sp), maxStep)
      spdBuf[i] = sp

      const alive = integrateAgent(a, dt, ov, oh, rng, sp)
      if (!alive) {
        const wasV = i < NUM_V_SLOTS
        const salt = Math.floor(performance.now() + i) % 997
        if (wasV) {
          const idx = i
          ov[idx] = false
          const vi = Math.floor(idx / LANES_PER_STRIP)
          const laneSlot = idx % LANES_PER_STRIP
          const na = spawnVertical(vi, laneSlot, salt)
          ov[idx] = true
          agents[i] = na
        } else {
          const hi = i - NUM_V_SLOTS
          oh[hi] = false
          const hj = Math.floor(hi / LANES_PER_STRIP)
          const laneSlot = hi % LANES_PER_STRIP
          const na = spawnHorizontal(hj, laneSlot, salt)
          oh[hi] = true
          agents[i] = na
        }
        a = agents[i]!
        holdRef.current[i] = { key: -1, until: 0 }
        yawBuf[i] = headingToYaw(a.heading)
        spdBuf[i] = a.speed
        setRenderTick((t) => t + 1)
      }

      if (agents[i]) {
        const ag = agents[i]!
        applyAgentToRigidBody(ag, rb, world, yawBuf[i])
        if (i < trafficTelemetry.x.length) {
          const v = velocityWithSpeed(ag, spdBuf[i])
          trafficTelemetry.x[i] = ag.x
          trafficTelemetry.z[i] = ag.z
          trafficTelemetry.vx[i] = v.vx
          trafficTelemetry.vz[i] = v.vz
        }
      }
    }
    trafficTelemetry.count = Math.min(n, trafficTelemetry.x.length)
  })

  return (
    <group>
      {slotKeys.map((key, i) => {
        const ag = agentsRef.current[i]
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
            {ag ? (
              <StaticBatch key={ag.kind} chunked={false}>
                {/* Body origin sits 0.09 m up; models are built from the ground. */}
                <group position={[0, -0.09, 0]}>
                  <VehicleModel kind={ag.kind} seed={i} />
                </group>
              </StaticBatch>
            ) : null}
          </RigidBody>
        )
      })}
    </group>
  )
}
