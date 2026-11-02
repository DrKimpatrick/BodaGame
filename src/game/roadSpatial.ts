import {
  CITY_START,
  CITY_TOTAL,
  ewHalf,
  ewKind,
  NUM_BLOCKS,
  nsHalf,
  nsKind,
  ROAD_WIDTH,
  roadStripCenterX,
  roadStripCenterZ,
  type RoadKind,
} from './cityGrid.ts'

/** Trees only spawn if distance to any road slab ≥ this (world units). */
export const GREEN_ZONE_DISTANCE = 5

/** Murram / grass strip width outside white shoulder line. */
export const SIDEWALK_WIDTH = 2.2

const XMIN = CITY_START
const XMAX = CITY_START + CITY_TOTAL
const ZMIN = CITY_START
const ZMAX = CITY_START + CITY_TOTAL
/** Include strip edges (float error) so the lane test doesn’t flicker false. */
const LANE_EDGE_EPS = 0.1

function distPointToRect(
  x: number,
  z: number,
  xmin: number,
  xmax: number,
  zmin: number,
  zmax: number,
): number {
  const px = Math.max(xmin, Math.min(x, xmax))
  const pz = Math.max(zmin, Math.min(z, zmax))
  return Math.hypot(x - px, z - pz)
}

/** Shortest distance from (x,z) to the union of all road rectangles (XZ). */
export function minDistToRoadNetwork(x: number, z: number): number {
  let d = Infinity
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const cx = roadStripCenterX(k)
    const h = nsHalf(k)
    d = Math.min(d, distPointToRect(x, z, cx - h, cx + h, ZMIN, ZMAX))
  }
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const cz = roadStripCenterZ(k)
    const h = ewHalf(k)
    d = Math.min(d, distPointToRect(x, z, XMIN, XMAX, cz - h, cz + h))
  }
  return d
}

/** Road type under (x, z), or null when not on a road (junction boxes take the wider road's type). */
export function roadKindAt(x: number, z: number): RoadKind | null {
  let best: RoadKind | null = null
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    if (Math.abs(x - roadStripCenterX(k)) <= nsHalf(k) + LANE_EDGE_EPS && z >= ZMIN && z <= ZMAX) {
      const kind = nsKind(k)
      if (!best || ROAD_WIDTH[kind] > ROAD_WIDTH[best]) best = kind
    }
    if (Math.abs(z - roadStripCenterZ(k)) <= ewHalf(k) + LANE_EDGE_EPS && x >= XMIN && x <= XMAX) {
      const kind = ewKind(k)
      if (!best || ROAD_WIDTH[kind] > ROAD_WIDTH[best]) best = kind
    }
  }
  return best
}

/** True if the point lies on any road surface (driving lane). */
export function isOnRoad(x: number, z: number): boolean {
  return roadKindAt(x, z) != null
}

/**
 * Where the bike is allowed to move: tarmac lane plus murram shoulder.
 * Uses the rigid-body center only — wider than `isOnRoad` so you don’t get
 * stuck after a slight offset, turn, or scrape.
 */
export function isDrivableSurface(x: number, z: number): boolean {
  if (isOnRoad(x, z)) return true
  return minDistToRoadNetwork(x, z) <= SIDEWALK_WIDTH + 0.65
}

/** Far from any road — HUD warning only. */
export function isDeepOffRoad(x: number, z: number): boolean {
  return minDistToRoadNetwork(x, z) > SIDEWALK_WIDTH + 1.1
}

/** Safe for trees: not on road and ≥ GREEN_ZONE_DISTANCE from road edge. */
export function isGreenZone(x: number, z: number): boolean {
  return minDistToRoadNetwork(x, z) >= GREEN_ZONE_DISTANCE
}

/** Buildings: keep footprint centroid clear of tarmac. */
export function isValidBuildingPlot(x: number, z: number, minDist = 2): boolean {
  if (isOnRoad(x, z)) return false
  return minDistToRoadNetwork(x, z) >= minDist
}
