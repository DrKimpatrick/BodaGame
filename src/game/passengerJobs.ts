import {
  CITY_START,
  CITY_TOTAL,
  NUM_BLOCKS,
  ROAD_W,
  roadStripCenterX,
  roadStripCenterZ,
} from './cityGrid'
import { segmentRandom } from './roadDecorPlacements'
import { SIDEWALK_WIDTH } from './roadSpatial'

export type RideJobPhase = 'pickup' | 'carrying'

export type RideStop = {
  x: number
  z: number
  /** Which road orientation this stop sits beside; used for bay rendering/orientation. */
  roadAxis: 'vertical' | 'horizontal'
  /** +1 / -1 side from strip center along the cross-axis. */
  sideSign: 1 | -1
  /** Short label for HUD / billboard */
  name: string
}

export type RideJob = {
  phase: RideJobPhase
  pickup: RideStop
  dropoff: RideStop
  payoutUgx: number
}

/** Which axis the on-ground job route fixes first (L-shape elbow). */
export type RideManhattanOrder = 'xFirst' | 'zFirst'

/** Treat one axis as “done” so the path collapses to a straight segment. */
export const RIDE_ROUTE_AXIS_EPS = 0.38

const ORDER_SWITCH_MARGIN = 0.14

/** Unit XZ directions along the first leg for each ordering (null = that leg has zero length). */
export function manhattanFirstLegDirs(
  bx: number,
  bz: number,
  tx: number,
  tz: number,
): { xFirst: { x: number; z: number } | null; zFirst: { x: number; z: number } | null } {
  const dx = tx - bx
  const dz = tz - bz
  const ax = Math.abs(dx)
  const az = Math.abs(dz)
  let xFirst: { x: number; z: number } | null = null
  let zFirst: { x: number; z: number } | null = null
  if (ax >= RIDE_ROUTE_AXIS_EPS) {
    xFirst = { x: dx / ax, z: 0 }
  }
  if (az >= RIDE_ROUTE_AXIS_EPS) {
    zFirst = { x: 0, z: dz / az }
  }
  return { xFirst, zFirst }
}

/**
 * Pick L-shape leg order from bike **facing** (unit XZ). Sticky with margin so the route
 * does not flicker when you are diagonal; switches when the other leg clearly matches better (“re-route”).
 */
export function stickyPickManhattanOrder(
  bx: number,
  bz: number,
  tx: number,
  tz: number,
  headingX: number,
  headingZ: number,
  current: RideManhattanOrder,
): RideManhattanOrder {
  const { xFirst, zFirst } = manhattanFirstLegDirs(bx, bz, tx, tz)
  if (!xFirst && !zFirst) return current
  if (!xFirst) return 'zFirst'
  if (!zFirst) return 'xFirst'

  const dotX = xFirst.x * headingX + xFirst.z * headingZ
  const dotZ = zFirst.x * headingX + zFirst.z * headingZ

  if (current === 'xFirst') {
    if (dotZ > dotX + ORDER_SWITCH_MARGIN) return 'zFirst'
    return 'xFirst'
  }
  if (dotX > dotZ + ORDER_SWITCH_MARGIN) return 'xFirst'
  return 'zFirst'
}

/** Corner UV point for minimap / path (matches {@link manhattanRoutePoints}). */
export function manhattanElbow(
  bx: number,
  bz: number,
  tx: number,
  tz: number,
  order: RideManhattanOrder,
): { x: number; z: number } {
  const dx = tx - bx
  const dz = tz - bz
  const ax = Math.abs(dx)
  const az = Math.abs(dz)
  if (ax < RIDE_ROUTE_AXIS_EPS && az < RIDE_ROUTE_AXIS_EPS) return { x: tx, z: tz }
  if (ax < RIDE_ROUTE_AXIS_EPS) return { x: tx, z: tz }
  if (az < RIDE_ROUTE_AXIS_EPS) return { x: tx, z: tz }
  if (order === 'xFirst') return { x: tx, z: bz }
  return { x: bx, z: tz }
}

const STOP_NAMES = [
  'Junction A',
  'Junction B',
  'City corner',
  'Strip stop',
  'Main crossing',
  'Kampala point',
  'Stage stop',
  'Boda rank',
  'Taxi park edge',
  'Market side',
  'Hospital road',
  'School gate',
  'Church corner',
  'Station approach',
  'Mall side',
] as const

function stopName(seed: number, salt: number): string {
  const i = Math.floor(segmentRandom(seed, salt, 884) * STOP_NAMES.length)
  return STOP_NAMES[Math.min(i, STOP_NAMES.length - 1)]!
}

/** Beside N–S carriageway (murram shoulder), not in the lane. */
function stopOnRoadsideVertical(
  vi: number,
  j: number,
  seed: number,
  salt: number,
): RideStop {
  const cx = roadStripCenterX(vi)
  const z0 = roadStripCenterZ(j)
  const z1 = roadStripCenterZ(j + 1)
  const mid = (z0 + z1) / 2
  const halfRun = Math.abs(z1 - z0) / 2
  const zJitter = (segmentRandom(seed, salt, 11) - 0.5) * Math.min(halfRun * 0.55, 10)
  const z = mid + zJitter
  const shoulder =
    ROAD_W / 2 + SIDEWALK_WIDTH * 0.52 + 0.14
  const side = segmentRandom(seed, salt, 12) < 0.5 ? 1 : -1
  const x = cx + side * shoulder
  return {
    x,
    z,
    roadAxis: 'vertical',
    sideSign: side as 1 | -1,
    name: stopName(seed, salt + 20),
  }
}

/** Beside E–W carriageway (murram shoulder), not in the lane. */
function stopOnRoadsideHorizontal(
  hj: number,
  i: number,
  seed: number,
  salt: number,
): RideStop {
  const cz = roadStripCenterZ(hj)
  const x0 = roadStripCenterX(i)
  const x1 = roadStripCenterX(i + 1)
  const mid = (x0 + x1) / 2
  const halfRun = Math.abs(x1 - x0) / 2
  const xJitter = (segmentRandom(seed, salt, 13) - 0.5) * Math.min(halfRun * 0.55, 10)
  const x = mid + xJitter
  const shoulder =
    ROAD_W / 2 + SIDEWALK_WIDTH * 0.52 + 0.14
  const side = segmentRandom(seed, salt, 14) < 0.5 ? 1 : -1
  const z = cz + side * shoulder
  return {
    x,
    z,
    roadAxis: 'horizontal',
    sideSign: side as 1 | -1,
    name: stopName(seed, salt + 21),
  }
}

function randomRoadsideStop(serial: number, tries: number, saltBase: number): RideStop {
  const useVertical = segmentRandom(serial, tries, saltBase) < 0.5
  if (useVertical) {
    const vi = Math.floor(
      segmentRandom(serial, tries, saltBase + 1) * (NUM_BLOCKS + 1),
    )
    const j = Math.floor(segmentRandom(serial, tries, saltBase + 2) * NUM_BLOCKS)
    return stopOnRoadsideVertical(vi, j, serial, tries * 31 + saltBase)
  }
  const hj = Math.floor(
    segmentRandom(serial, tries, saltBase + 3) * (NUM_BLOCKS + 1),
  )
  const i = Math.floor(segmentRandom(serial, tries, saltBase + 4) * NUM_BLOCKS)
  return stopOnRoadsideHorizontal(hj, i, serial, tries * 31 + saltBase + 5)
}

/** Road-grid Manhattan distance (along strips). */
function manhattanStripMeters(a: RideStop, b: RideStop): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z)
}

/** Travel distance for on-grid L-routes: |Δx| + |Δz| (matches HUD / guide). */
export function manhattanTravelMeters(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  return Math.abs(bx - ax) + Math.abs(bz - az)
}

/** Typical pace for “Est. arrival” readout (m/s). */
export const RIDE_ETA_ASSUMED_MPS = 5.15

/**
 * Average speed you must beat over the leg (m/s) to earn a record bonus
 * (time limit = path / this value).
 */
export const RIDE_RECORD_PACE_MPS = 6.85

const RIDE_RECORD_MIN_MS = 8_200
const RIDE_RECORD_MAX_MS = 220_000

/** Max duration (ms) for the leg to still count as “record time”. */
export function rideRecordTimeLimitMs(pathMeters: number): number {
  if (pathMeters <= 0) return RIDE_RECORD_MIN_MS
  const raw = (pathMeters / RIDE_RECORD_PACE_MPS) * 1000
  return Math.min(RIDE_RECORD_MAX_MS, Math.max(RIDE_RECORD_MIN_MS, raw))
}

const MIN_LEG_M = 38
/** Fares scaled so a typical job comfortably covers fuel burn + wear (repairs are cheaper per pt). */
const PAYOUT_BASE = 28_000
const PAYOUT_PER_100M = 11_000

/**
 * Deterministic job from serial. Pickup / drop are on murram shoulders beside carriageways, not in lanes.
 */
export function generateRideJob(serial: number): RideJob {
  let pickup: RideStop
  let dropoff: RideStop
  let tries = 0
  do {
    pickup = randomRoadsideStop(serial, tries, 901)
    dropoff = randomRoadsideStop(serial, tries, 920)
    tries++
  } while (manhattanStripMeters(pickup, dropoff) < MIN_LEG_M && tries < 55)

  const m = manhattanStripMeters(pickup, dropoff)
  const payoutUgx = Math.floor(
    PAYOUT_BASE + (m / 100) * PAYOUT_PER_100M + segmentRandom(serial, 0, 905) * 9_000,
  )

  return {
    phase: 'pickup',
    pickup,
    dropoff,
    payoutUgx: Math.max(42_000, payoutUgx),
  }
}

export const CITY_XZ_BOUNDS = {
  min: CITY_START,
  max: CITY_START + CITY_TOTAL,
  span: CITY_TOTAL,
} as const

/**
 * L-shaped route on XZ from bike to target. Order picks which axis is cleared first
 * (see {@link stickyPickManhattanOrder}); collapses to a straight segment when one delta is tiny.
 */
export function manhattanRoutePoints(
  bx: number,
  bz: number,
  tx: number,
  tz: number,
  y: number,
  order: RideManhattanOrder,
): [number, number, number][] {
  const dx = tx - bx
  const dz = tz - bz
  const ax = Math.abs(dx)
  const az = Math.abs(dz)

  if (ax < RIDE_ROUTE_AXIS_EPS && az < RIDE_ROUTE_AXIS_EPS) {
    return [
      [bx, y, bz],
      [tx, y, tz],
    ]
  }
  if (ax < RIDE_ROUTE_AXIS_EPS) {
    return [
      [bx, y, bz],
      [tx, y, tz],
    ]
  }
  if (az < RIDE_ROUTE_AXIS_EPS) {
    return [
      [bx, y, bz],
      [tx, y, tz],
    ]
  }

  if (order === 'xFirst') {
    return [
      [bx, y, bz],
      [tx, y, bz],
      [tx, y, tz],
    ]
  }
  return [
    [bx, y, bz],
    [bx, y, tz],
    [tx, y, tz],
  ]
}
