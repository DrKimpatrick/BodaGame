/** 10×10 blocks, roads between (11 strips each way). Origin = central intersection. */
export const NUM_BLOCKS = 10
export const ROAD_W = 4
/** Building plot / straight road run between intersections (segment length = BLOCK + ROAD_W). */
export const BLOCK = 24
export const CITY_TOTAL = NUM_BLOCKS * BLOCK + (NUM_BLOCKS + 1) * ROAD_W
export const CITY_START = -CITY_TOTAL / 2

export function roadStripCenterX(k: number) {
  return CITY_START + k * (ROAD_W + BLOCK) + ROAD_W / 2
}

export function roadStripCenterZ(k: number) {
  return CITY_START + k * (ROAD_W + BLOCK) + ROAD_W / 2
}

export function blockCenter(i: number, j: number): [number, number] {
  const cx =
    CITY_START + ROAD_W + i * (ROAD_W + BLOCK) + BLOCK / 2
  const cz =
    CITY_START + ROAD_W + j * (ROAD_W + BLOCK) + BLOCK / 2
  return [cx, cz]
}
