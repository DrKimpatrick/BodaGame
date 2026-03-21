import {
  CITY_START,
  CITY_TOTAL,
  NUM_BLOCKS,
  ROAD_W,
  roadStripCenterX,
  roadStripCenterZ,
} from './cityGrid'

/** Trees only spawn if distance to any road slab ≥ this (world units). */
export const GREEN_ZONE_DISTANCE = 5

/** Murram / grass strip width outside white shoulder line. */
export const SIDEWALK_WIDTH = 1.25

const XMIN = CITY_START
const XMAX = CITY_START + CITY_TOTAL
const ZMIN = CITY_START
const ZMAX = CITY_START + CITY_TOTAL
const HALF_W = ROAD_W / 2

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
    d = Math.min(
      d,
      distPointToRect(x, z, cx - HALF_W, cx + HALF_W, ZMIN, ZMAX),
    )
  }
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const cz = roadStripCenterZ(k)
    d = Math.min(
      d,
      distPointToRect(x, z, XMIN, XMAX, cz - HALF_W, cz + HALF_W),
    )
  }
  return d
}

/** True if the point lies on any road surface (driving lane). */
export function isOnRoad(x: number, z: number): boolean {
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const cx = roadStripCenterX(k)
    if (Math.abs(x - cx) < HALF_W && z >= ZMIN && z <= ZMAX) {
      return true
    }
  }
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const cz = roadStripCenterZ(k)
    if (Math.abs(z - cz) < HALF_W && x >= XMIN && x <= XMAX) {
      return true
    }
  }
  return false
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
