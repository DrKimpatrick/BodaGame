/**
 * Speed humps, potholes, and shared placement math for road visuals + bike feedback.
 */
import { NUM_BLOCKS, ROAD_W, roadStripCenterX, roadStripCenterZ } from './cityGrid'
import {
  segmentRandom,
  ZEBRA_HORIZONTAL_SITES,
  ZEBRA_VERTICAL_SITES,
} from './roadDecorPlacements'

export const ROAD_TOP_Y = 0.06
export const HUMP_HALF_H = 0.1
export const HUMP_ALONG = 1.28
/** Ellipsoid semi-axes in XZ (matches scaled unit sphere in RoadNetwork). */
export const HUMP_AX = ROAD_W * 0.4
export const HUMP_AZ = HUMP_ALONG

export type SpeedHumpVertical = { key: string; cx: number; z: number }
export type SpeedHumpHorizontal = { key: string; x: number; cz: number }

/** Hump centre offset along traffic (±Z or ±X) before the zebra deck. */
const ZEBRA_HUMP_LEAD = 2.42

/**
 * One transverse hump on each approach to every zebra (traffic ±Z / ±X).
 */
export function listSpeedHumpSites(): {
  vertical: SpeedHumpVertical[]
  horizontal: SpeedHumpHorizontal[]
} {
  const vertical: SpeedHumpVertical[] = []
  for (const z of ZEBRA_VERTICAL_SITES) {
    vertical.push({
      key: `hzv-${z.key}-s`,
      cx: z.cx,
      z: z.z - ZEBRA_HUMP_LEAD,
    })
    vertical.push({
      key: `hzv-${z.key}-n`,
      cx: z.cx,
      z: z.z + ZEBRA_HUMP_LEAD,
    })
  }
  const horizontal: SpeedHumpHorizontal[] = []
  for (const h of ZEBRA_HORIZONTAL_SITES) {
    horizontal.push({
      key: `hzh-${h.key}-w`,
      x: h.x - ZEBRA_HUMP_LEAD,
      cz: h.cz,
    })
    horizontal.push({
      key: `hzh-${h.key}-e`,
      x: h.x + ZEBRA_HUMP_LEAD,
      cz: h.cz,
    })
  }
  return { vertical, horizontal }
}

export type PotholeSite = {
  key: string
  x: number
  z: number
  r: number
  /** 0–1, deeper = stronger dip */
  depth: number
}

/** Potholes per road block along a strip (2–5). */
function potholeCount(a: number, b: number, salt: number): number {
  return 2 + Math.floor(segmentRandom(a, b, salt) * 3.001)
}

export function listPotholeSites(): PotholeSite[] {
  const out: PotholeSite[] = []
  for (let vi = 0; vi <= NUM_BLOCKS; vi++) {
    const cx = roadStripCenterX(vi)
    for (let j = 0; j < NUM_BLOCKS; j++) {
      const mid = (roadStripCenterZ(j) + roadStripCenterZ(j + 1)) / 2
      const n = potholeCount(vi, j, 947)
      for (let k = 0; k < n; k++) {
        const z = mid + (segmentRandom(vi, j, 948 + k * 17) - 0.5) * 21
        const x = cx + (segmentRandom(vi, j, 949 + k * 17) - 0.5) * ROAD_W * 0.78
        const r = 0.42 + segmentRandom(vi, j, 950 + k * 17) * 0.62
        const depth = 0.45 + segmentRandom(vi, j, 951 + k * 17) * 0.55
        out.push({ key: `ph-v-${vi}-${j}-${k}`, x, z, r, depth })
      }
    }
  }
  for (let hj = 0; hj <= NUM_BLOCKS; hj++) {
    const cz = roadStripCenterZ(hj)
    for (let i = 0; i < NUM_BLOCKS; i++) {
      const mid = (roadStripCenterX(i) + roadStripCenterX(i + 1)) / 2
      const n = potholeCount(i, hj, 952)
      for (let k = 0; k < n; k++) {
        const x = mid + (segmentRandom(i, hj, 953 + k * 17) - 0.5) * 21
        const z = cz + (segmentRandom(i, hj, 954 + k * 17) - 0.5) * ROAD_W * 0.78
        const r = 0.4 + segmentRandom(i, hj, 955 + k * 17) * 0.58
        const depth = 0.45 + segmentRandom(i, hj, 956 + k * 17) * 0.55
        out.push({ key: `ph-h-${i}-${hj}-${k}`, x, z, r, depth })
      }
    }
  }
  return out
}

function ynOnVerticalHump(tx: number, tz: number, cx: number, z: number): number {
  const xn = (tx - cx) / HUMP_AX
  const zn = (tz - z) / HUMP_AZ
  const s = xn * xn + zn * zn
  if (s >= 1) return 0
  return Math.sqrt(1 - s)
}

function ynOnHorizontalHump(tx: number, tz: number, x: number, cz: number): number {
  const xn = (tx - x) / HUMP_ALONG
  const zn = (tz - cz) / HUMP_AX
  const s = xn * xn + zn * zn
  if (s >= 1) return 0
  return Math.sqrt(1 - s)
}

let cachedHumps: ReturnType<typeof listSpeedHumpSites> | null = null
let cachedPotholes: PotholeSite[] | null = null

function humps() {
  if (!cachedHumps) cachedHumps = listSpeedHumpSites()
  return cachedHumps
}

function potholes() {
  if (!cachedPotholes) cachedPotholes = listPotholeSites()
  return cachedPotholes
}

/**
 * Peak `cup * depth` among potholes under the bike (0 if not over any hole).
 * Used to detect “rolling into” a hole for a one-shot jolt + condition tick.
 */
export function getPotholeStrikeEnvelope(tx: number, tz: number): number {
  let m = 0
  for (const hole of potholes()) {
    const dx = tx - hole.x
    const dz = tz - hole.z
    const d = Math.hypot(dx, dz) / hole.r
    if (d >= 1) continue
    const cup = Math.sqrt(Math.max(0, 1 - d * d))
    m = Math.max(m, cup * hole.depth)
  }
  return m
}

const MAX_SPEED_REF = 14

/**
 * Arcade pitch / lift / roll for the bike mesh, plus a small speed trim over potholes.
 */
export function sampleRoadSurfaceBikeEffect(
  tx: number,
  tz: number,
  forwardX: number,
  forwardZ: number,
  speedAbs: number,
): { pitch: number; yOff: number; roll: number; speedMul: number } {
  const sp = Math.min(1, speedAbs / MAX_SPEED_REF)
  const { vertical, horizontal } = humps()

  const eps = 0.09
  let best: { yn: number; grad: number } | null = null

  for (const p of vertical) {
    const yn = ynOnVerticalHump(tx, tz, p.cx, p.z)
    if (yn <= 0) continue
    const ynF = ynOnVerticalHump(tx + forwardX * eps, tz + forwardZ * eps, p.cx, p.z)
    const g = (ynF - yn) / eps
    if (!best || yn > best.yn) best = { yn, grad: g }
  }
  for (const p of horizontal) {
    const yn = ynOnHorizontalHump(tx, tz, p.x, p.cz)
    if (yn <= 0) continue
    const ynF = ynOnHorizontalHump(tx + forwardX * eps, tz + forwardZ * eps, p.x, p.cz)
    const g = (ynF - yn) / eps
    if (!best || yn > best.yn) best = { yn, grad: g }
  }

  const maxYn = best?.yn ?? 0
  const gradAlong = best?.grad ?? 0

  const pitchHump =
    maxYn > 0
      ? maxYn * sp * (0.2 + Math.min(0.28, Math.abs(gradAlong) * 0.65))
      : 0
  const pitchSlope = maxYn > 0 ? -gradAlong * sp * 0.38 : 0
  const yOff = maxYn * sp * 0.1
  const roll =
    maxYn > 0 ? maxYn * sp * 0.045 * Math.sin(tx * 1.1 + tz * 0.9) : 0

  let potholePitch = 0
  let speedMul = 1
  for (const hole of potholes()) {
    const dx = tx - hole.x
    const dz = tz - hole.z
    const d = Math.hypot(dx, dz) / hole.r
    if (d >= 1) continue
    const cup = Math.sqrt(Math.max(0, 1 - d * d))
    potholePitch -= cup * hole.depth * sp * 0.11
    speedMul *= 1 - cup * hole.depth * 0.045
  }

  return {
    pitch: pitchHump + pitchSlope + potholePitch,
    yOff,
    roll,
    speedMul: Math.max(0.88, speedMul),
  }
}
