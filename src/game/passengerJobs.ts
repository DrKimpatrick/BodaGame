import {
  CITY_START,
  CITY_TOTAL,
  NUM_BLOCKS,
  ewHalf,
  nsHalf,
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
  const shoulder = nsHalf(vi) + SIDEWALK_WIDTH * 0.52 + 0.14
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
  const shoulder = ewHalf(hj) + SIDEWALK_WIDTH * 0.52 + 0.14
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

const MIN_LEG_M = 90
/** Keep trips to a few minutes' ride across the bigger city. */
const MAX_LEG_M = 420
/** Furthest a new passenger waits from the rider (m, along the streets). */
const MAX_PICKUP_M = 170
/** Fares scaled so a typical job comfortably covers fuel burn + wear (repairs are cheaper per pt). */
const PAYOUT_BASE = 28_000
const PAYOUT_PER_100M = 11_000

/**
 * Deterministic job from serial. Pickup / drop are on murram shoulders beside carriageways, not in lanes.
 */
export function generateRideJob(serial: number, from?: { x: number; z: number }): RideJob {
  let pickup: RideStop
  let dropoff: RideStop
  let tries = 0
  // Passengers flag the rider down nearby: keep the ride to the pickup short when we know where she is.
  const farFromRider = (p: RideStop) => from != null && Math.abs(p.x - from.x) + Math.abs(p.z - from.z) > MAX_PICKUP_M
  do {
    pickup = randomRoadsideStop(serial, tries, 901)
    dropoff = randomRoadsideStop(serial, tries, 920)
    tries++
  } while (
    (manhattanStripMeters(pickup, dropoff) < MIN_LEG_M ||
      manhattanStripMeters(pickup, dropoff) > MAX_LEG_M ||
      (tries < 140 && farFromRider(pickup))) &&
    tries < 160
  )

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
