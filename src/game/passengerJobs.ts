import { CITY_START, CITY_TOTAL, NUM_BLOCKS, roadStripCenterX, roadStripCenterZ } from './cityGrid'
import { segmentRandom } from './roadDecorPlacements'

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

function intersectionFromIndices(vi: number, hj: number, seed: number, salt: number): RideStop {
  return {
    x: roadStripCenterX(vi),
    z: roadStripCenterZ(hj),
    name: stopName(seed, salt),
  }
}

/** Road-grid Manhattan distance (along strips). */
function manhattanStripMeters(a: RideStop, b: RideStop): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z)
}

const MIN_LEG_M = 38
const PAYOUT_BASE = 4_500
const PAYOUT_PER_100M = 1_800

/**
 * Deterministic job from serial (bump each new job). Pickup and drop are road intersections.
 */
export function generateRideJob(serial: number): RideJob {
  let pickup: RideStop
  let dropoff: RideStop
  let tries = 0
  do {
    const vi = Math.floor(segmentRandom(serial, tries, 901) * (NUM_BLOCKS + 1))
    const hj = Math.floor(segmentRandom(serial, tries, 902) * (NUM_BLOCKS + 1))
    const vi2 = Math.floor(segmentRandom(serial, tries, 903) * (NUM_BLOCKS + 1))
    const hj2 = Math.floor(segmentRandom(serial, tries, 904) * (NUM_BLOCKS + 1))
    pickup = intersectionFromIndices(vi, hj, serial, tries * 7 + 11)
    dropoff = intersectionFromIndices(vi2, hj2, serial, tries * 7 + 19)
    tries++
  } while (manhattanStripMeters(pickup, dropoff) < MIN_LEG_M && tries < 40)

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
