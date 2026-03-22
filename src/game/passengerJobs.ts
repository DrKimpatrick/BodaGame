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
  const shoulder =
    ROAD_W / 2 + SIDEWALK_WIDTH * 0.52 + 0.14
  const side = segmentRandom(seed, salt, 12) < 0.5 ? 1 : -1
  const x = cx + side * shoulder
  return { x, z, name: stopName(seed, salt + 20) }
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
  return { x, z, name: stopName(seed, salt + 21) }
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

const MIN_LEG_M = 38
const PAYOUT_BASE = 4_500
const PAYOUT_PER_100M = 1_800

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
    PAYOUT_BASE + (m / 100) * PAYOUT_PER_100M + segmentRandom(serial, 0, 905) * 2_200,
  )

  return {
    phase: 'pickup',
    pickup,
    dropoff,
    payoutUgx: Math.max(6_000, payoutUgx),
  }
}

export const CITY_XZ_BOUNDS = {
  min: CITY_START,
  max: CITY_START + CITY_TOTAL,
  span: CITY_TOTAL,
} as const

/** L-shaped route on XZ plane: (bx,bz) → (tx,bz) → (tx,tz). */
export function manhattanRoutePoints(
  bx: number,
  bz: number,
  tx: number,
  tz: number,
  y: number,
): [number, number, number][] {
  return [
    [bx, y, bz],
    [tx, y, bz],
    [tx, y, tz],
  ]
}
