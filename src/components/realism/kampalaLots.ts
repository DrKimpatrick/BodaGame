import { ewHalf, NUM_BLOCKS, nsHalf, roadStripCenterX, roadStripCenterZ } from '../../game/cityGrid'
import { forcedShopEdges } from '../../game/kampalaMap'
import { segmentRandom } from '../../game/roadDecorPlacements'
import { SHOP_SIGN_COUNT } from './textures'

/** Layout of street-facing shop rows (pure data; rendered by `KampalaBuildings`). */

export const FLOOR_H = 3.1

/** Building faces sit this far behind the road edge (pavement, open drain, verandah). */
const SETBACK = 3.4
/** Keep junction corners clear for signals, signs and sight lines. */
const CORNER_CLEAR = 3.6

export type ShopLot = {
  key: string
  /** Centre of the footprint. */
  x: number
  z: number
  w: number
  d: number
  /** Yaw so that local +Z faces the street. */
  yaw: number
  floors: 1 | 2 | 3
  roof: 'parapet' | 'mabaati'
  wall: string
  sign: number
  tank: boolean
  /** `colonial`: Kampala Road's 1920s–50s two-storey arcade buildings (Patel Press, Amber House era). */
  style: 'shop' | 'colonial'
  /** Year on the parapet plaque (colonial style). */
  year?: number
}

/** Kampala Road (the E–W strip through the centre): its frontage is a continuous colonial-era row. */
const KAMPALA_ROAD_STRIP = 6
const COLONIAL_WALLS = ['#efe3c8', '#e8d3a5', '#f3eee2', '#e2c79a', '#d9c4a3']

const WALLS = ['#efe6d2', '#e9c46a', '#d8a47f', '#9fd3c7', '#a8c5e6', '#f2b5c4', '#f4f1de', '#e07a5f', '#c9ada7', '#b7e4c7']

/** Shop rows along the four street edges of block (i, j). */
export function shopRowsForBlock(i: number, j: number): ShopLot[] {
  const out: ShopLot[] = []
  const x0 = roadStripCenterX(i) + nsHalf(i)
  const x1 = roadStripCenterX(i + 1) - nsHalf(i + 1)
  const z0 = roadStripCenterZ(j) + ewHalf(j)
  const z1 = roadStripCenterZ(j + 1) - ewHalf(j + 1)
  // Edge: start/end along it, the street-side line, and the yaw facing the street.
  const edges = [
    { id: 's', a0: x0, a1: x1, line: z0 + SETBACK, alongX: true, inward: 1, yaw: Math.PI },
    { id: 'n', a0: x0, a1: x1, line: z1 - SETBACK, alongX: true, inward: -1, yaw: 0 },
    { id: 'w', a0: z0, a1: z1, line: x0 + SETBACK, alongX: false, inward: 1, yaw: -Math.PI / 2 },
    { id: 'e', a0: z0, a1: z1, line: x1 - SETBACK, alongX: false, inward: -1, yaw: Math.PI / 2 },
  ]
  // One facing pair per block (N+S or E+W) so rows never collide at the corners. Blocks on Kampala Road
  // always face it.
  const onKampalaRoad = j === KAMPALA_ROAD_STRIP - 1 || j === KAMPALA_ROAD_STRIP
  const pair: readonly string[] = forcedShopEdges(i, j) ?? (onKampalaRoad || segmentRandom(i, j, 7100) < 0.5 ? ['s', 'n'] : ['w', 'e'])
  for (const e of edges) {
    if (!pair.includes(e.id)) continue
    const colonial = (e.id === 'n' && j === KAMPALA_ROAD_STRIP - 1) || (e.id === 's' && j === KAMPALA_ROAD_STRIP)
    const salt = e.id.charCodeAt(0)
    if (!colonial && segmentRandom(i, j, 7000 + salt) < 0.15) continue // some edges stay open (yards, trees)
    let a = e.a0 + CORNER_CLEAR
    let k = 0
    while (a < e.a1 - CORNER_CLEAR - 4) {
      const r = (s: number) => segmentRandom(i * 31 + k, j * 17 + salt, s)
      const w = Math.min(e.a1 - CORNER_CLEAR - a, colonial ? 7 + r(1) * 4 : 4.8 + r(1) * 3.8)
      if (w < 4) break
      const d = colonial ? 9 : 5.5 + r(2) * 2.5
      const mid = a + w / 2
      const depthCentre = e.line + (e.inward * d) / 2
      out.push({
        key: `shop-${i}-${j}-${e.id}-${k}`,
        x: e.alongX ? mid : depthCentre,
        z: e.alongX ? depthCentre : mid,
        w,
        d,
        yaw: e.yaw,
        floors: colonial ? 2 : r(3) < 0.45 ? 1 : r(3) < 0.85 ? 2 : 3,
        roof: colonial ? 'parapet' : r(4) < 0.55 ? 'mabaati' : 'parapet',
        wall: colonial ? COLONIAL_WALLS[Math.floor(r(5) * COLONIAL_WALLS.length)]! : WALLS[Math.floor(r(5) * WALLS.length)]!,
        sign: Math.floor(r(6) * SHOP_SIGN_COUNT * 7),
        tank: !colonial && r(7) < 0.4,
        style: colonial ? 'colonial' : 'shop',
        year: colonial ? 1919 + Math.floor(r(9) * 38) : undefined,
      })
      // Colonial frontage is continuous (shared party walls); other shops have gaps and alleys.
      a += w + (colonial ? 0.02 : 0.25 + r(8) * 1.2)
      k++
    }
  }
  return out
}

/** All shop footprints as axis-aligned boxes (for keeping trees out of them). */
export function lotBounds(l: ShopLot) {
  const alongX = Math.abs(Math.sin(l.yaw)) < 0.5
  const hx = (alongX ? l.w : l.d) / 2
  const hz = (alongX ? l.d : l.w) / 2
  return { minX: l.x - hx, maxX: l.x + hx, minZ: l.z - hz, maxZ: l.z + hz }
}

/** Every block's shop rows (deterministic). Blocks in `skip` are left alone. */
export function allShopLots(skip: (i: number, j: number) => boolean): ShopLot[] {
  const out: ShopLot[] = []
  for (let i = 0; i < NUM_BLOCKS; i++) {
    for (let j = 0; j < NUM_BLOCKS; j++) {
      if (skip(i, j)) continue
      out.push(...shopRowsForBlock(i, j))
    }
  }
  return out
}
