import { NUM_BLOCKS, ROAD_W, roadStripCenterX, roadStripCenterZ } from './cityGrid'
import { SIDEWALK_WIDTH } from './roadSpatial'

export function segmentRandom(a: number, b: number, salt: number) {
  const t = Math.sin(a * 12.9898 + b * 78.233 + salt * 43.758) * 43758.5453123
  return t - Math.floor(t)
}

export type ZebraVerticalSite = { key: string; cx: number; z: number; vi: number; j: number }
export type ZebraHorizontalSite = { key: string; x: number; cz: number; i: number; hj: number }

export function listZebraVerticalSites(): ZebraVerticalSite[] {
  const out: ZebraVerticalSite[] = []
  for (let vi = 0; vi <= NUM_BLOCKS; vi++) {
    const cx = roadStripCenterX(vi)
    for (let j = 0; j < NUM_BLOCKS; j++) {
      if (segmentRandom(vi, j, 505) > 0.28) continue
      const z = (roadStripCenterZ(j) + roadStripCenterZ(j + 1)) / 2
      out.push({ key: `zv-${vi}-${j}`, cx, z, vi, j })
    }
  }
  return out
}

export function listZebraHorizontalSites(): ZebraHorizontalSite[] {
  const out: ZebraHorizontalSite[] = []
  for (let hj = 0; hj <= NUM_BLOCKS; hj++) {
    const cz = roadStripCenterZ(hj)
    for (let i = 0; i < NUM_BLOCKS; i++) {
      if (segmentRandom(i, hj, 606) > 0.28) continue
      const x = (roadStripCenterX(i) + roadStripCenterX(i + 1)) / 2
      out.push({ key: `zh-${i}-${hj}`, x, cz, i, hj })
    }
  }
  return out
}

const SEG_MARGIN = 2.2

export type SidewalkAlongVertical = {
  key: string
  x: number
  zMin: number
  zMax: number
  vi: number
  j: number
}

/** Murram strip beside N–S carriageways (pedestrians walk ±Z). */
export function listSidewalkAlongVertical(): SidewalkAlongVertical[] {
  const out: SidewalkAlongVertical[] = []
  const hw = ROAD_W / 2
  const ox = SIDEWALK_WIDTH * 0.38
  for (let vi = 0; vi <= NUM_BLOCKS; vi++) {
    const cx = roadStripCenterX(vi)
    for (let j = 0; j < NUM_BLOCKS; j++) {
      /** ~85% of segments get a sidewalk strip (was ~13%). */
      if (segmentRandom(vi, j, 750) > 0.85) continue
      const z0 = roadStripCenterZ(j) + SEG_MARGIN
      const z1 = roadStripCenterZ(j + 1) - SEG_MARGIN
      if (z1 <= z0 + 2) continue
      const east = segmentRandom(vi, j, 751) < 0.5
      const x = east ? cx + hw + ox : cx - hw - ox
      out.push({ key: `swv-${vi}-${j}`, x, zMin: z0, zMax: z1, vi, j })
    }
  }
  return out
}

export type SidewalkAlongHorizontal = {
  key: string
  z: number
  xMin: number
  xMax: number
  i: number
  hj: number
}

/** Murram strip beside E–W carriageways (pedestrians walk ±X). */
export function listSidewalkAlongHorizontal(): SidewalkAlongHorizontal[] {
  const out: SidewalkAlongHorizontal[] = []
  const hw = ROAD_W / 2
  const oz = SIDEWALK_WIDTH * 0.38
  for (let hj = 0; hj <= NUM_BLOCKS; hj++) {
    const cz = roadStripCenterZ(hj)
    for (let i = 0; i < NUM_BLOCKS; i++) {
      if (segmentRandom(i, hj, 752) > 0.85) continue
      const x0 = roadStripCenterX(i) + SEG_MARGIN
      const x1 = roadStripCenterX(i + 1) - SEG_MARGIN
      if (x1 <= x0 + 2) continue
      const north = segmentRandom(i, hj, 753) < 0.5
      const z = north ? cz + hw + oz : cz - hw - oz
      out.push({ key: `swh-${i}-${hj}`, z, xMin: x0, xMax: x1, i, hj })
    }
  }
  return out
}

/** Stable lists (grid is fixed). */
export const ZEBRA_VERTICAL_SITES = listZebraVerticalSites()
export const ZEBRA_HORIZONTAL_SITES = listZebraHorizontalSites()
export const SIDEWALK_VERTICAL_SLOTS = listSidewalkAlongVertical()
export const SIDEWALK_HORIZONTAL_SLOTS = listSidewalkAlongHorizontal()
