/**
 * 12×12 blocks, roads between (13 strips each way), ~645 m across. Origin = central intersection.
 * Roads are 9 m: two lanes each way (keep left), long 44 m runs between junctions.
 */
export const NUM_BLOCKS = 12
export const ROAD_W = 9
/** Building plot / straight road run between intersections (segment length = BLOCK + ROAD_W). */
export const BLOCK = 44
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

/* ---------- Road types (Kampala mix) ---------- */

/**
 * `dual`: dual carriageway, two lanes each way with a kerbed median (Kampala Rd, Jinja Rd).
 * `main`: two lanes each way, double centre line (Entebbe Rd, Bombo Rd, Queensway…).
 * `street`: one lane each way, faded dashed centre line, more potholes.
 * `murram`: red unpaved road on the outskirts: no markings, rough and potholed.
 * Strip centres keep the uniform pitch (ROAD_W + BLOCK); only the paved width varies.
 */
export type RoadKind = 'dual' | 'main' | 'street' | 'murram'

/** Wider than survey scale on purpose: from a chase camera real-width lanes read as cramped. Lanes are 3.5–4.5 m. */
export const ROAD_WIDTH: Record<RoadKind, number> = { dual: 18, main: 14, street: 9, murram: 8 }
export const MEDIAN_W = 2

/** Roads along Z, by strip index along X (west → east): matches STREETS_NS in kampalaMap.ts. */
export const ROAD_KIND_NS: readonly RoadKind[] = [
  'murram', 'street', 'street', 'street', 'main', 'street', 'main', 'street', 'street', 'dual', 'main', 'street', 'murram',
]
/** Roads along X, by strip index along Z (south → north): matches STREETS_EW in kampalaMap.ts. */
export const ROAD_KIND_EW: readonly RoadKind[] = [
  'murram', 'street', 'main', 'street', 'street', 'street', 'dual', 'street', 'street', 'main', 'street', 'main', 'murram',
]

export function nsKind(i: number): RoadKind {
  return ROAD_KIND_NS[Math.max(0, Math.min(NUM_BLOCKS, i))]!
}
export function ewKind(j: number): RoadKind {
  return ROAD_KIND_EW[Math.max(0, Math.min(NUM_BLOCKS, j))]!
}
/** Half width of the road along Z at strip i (its extent in X). */
export function nsHalf(i: number): number {
  return ROAD_WIDTH[nsKind(i)] / 2
}
/** Half width of the road along X at strip j (its extent in Z). */
export function ewHalf(j: number): number {
  return ROAD_WIDTH[ewKind(j)] / 2
}
export function lanesEachWay(kind: RoadKind): 1 | 2 {
  return kind === 'dual' || kind === 'main' ? 2 : 1
}

/**
 * Lateral offsets (from the road centre, towards the traveller's left) of the lane centres on one side:
 * [inner, outer]. One-lane roads return the same centre twice.
 */
export function laneCentres(kind: RoadKind): [number, number] {
  const half = ROAD_WIDTH[kind] / 2
  const inner = kind === 'dual' ? MEDIAN_W / 2 : 0
  const usable = half - inner
  if (lanesEachWay(kind) === 1) return [inner + usable * 0.5, inner + usable * 0.5]
  return [inner + usable * 0.27, inner + usable * 0.73]
}
