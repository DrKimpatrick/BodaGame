/**
 * How every junction in the city is controlled, signal timing, stop lines and roadside sign placement.
 * Pure data + math (no React), shared by the 3D scene, the traffic AI and the live rule monitor.
 *
 * Axes: "ns" traffic moves along Z (N = +Z), "ew" traffic moves along X (E = +X). Uganda keeps left, so a
 * vehicle heading N uses the +X half of the road, S uses −X, E uses −Z, W uses +Z.
 */
import { ewHalf, NUM_BLOCKS, nsHalf, roadStripCenterX, roadStripCenterZ } from '../../game/cityGrid.ts'
import {
  segmentRandom,
  ZEBRA_HORIZONTAL_SITES,
  ZEBRA_VERTICAL_SITES,
} from '../../game/roadDecorPlacements.ts'
import { roundaboutAt } from '../../game/kampalaMap.ts'

export type Heading = 'N' | 'S' | 'E' | 'W'
export type Axis = 'ns' | 'ew'
export type Control = 'signal' | 'stop' | 'giveway' | 'roundabout' | 'none'
export type Aspect = 'green' | 'amber' | 'red'

export type Junction = {
  i: number
  j: number
  x: number
  z: number
  control: Control
  /** Axis that must stop / give way (stop and giveway junctions). */
  minor: Axis
  /** Signal cycle offset in seconds. */
  offset: number
  /** Roundabout name (Kampala junctions such as the Clock Tower). */
  name?: string
}

/** Roundabout geometry (m): central island, the ring traffic follows, and the paved disc. */
export const ROUNDABOUT = { island: 5.2, ring: 9, disc: 13, entry: 10.5 } as const

/** Stop line distance before the junction box edge. */
export const STOP_LINE_GAP = 0.55

/** The compass heading closest to a bike yaw (forward is (−sin yaw, −cos yaw)). */
export function nearestHeading(yaw: number): Heading {
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  if (Math.abs(fz) >= Math.abs(fx)) return fz > 0 ? 'N' : 'S'
  return fx > 0 ? 'E' : 'W'
}

export function axisOf(h: Heading): Axis {
  return h === 'N' || h === 'S' ? 'ns' : 'ew'
}

/* ---------- Signal timing ---------- */

const GREEN_S = 11
const AMBER_S = 3
const ALL_RED_S = 1.5
const HALF_CYCLE = GREEN_S + AMBER_S + ALL_RED_S
export const SIGNAL_CYCLE_S = HALF_CYCLE * 2

/** Aspect shown to traffic on `axis` at junction `jn` at world time `t` (seconds). */
export function signalAspect(jn: Junction, axis: Axis, t: number): Aspect {
  let u = (t + jn.offset) % SIGNAL_CYCLE_S
  if (u < 0) u += SIGNAL_CYCLE_S
  const inFirstHalf = u < HALF_CYCLE
  const mine = (axis === 'ns') === inFirstHalf
  if (!mine) return 'red'
  const v = inFirstHalf ? u : u - HALF_CYCLE
  if (v < GREEN_S) return 'green'
  if (v < GREEN_S + AMBER_S) return 'amber'
  return 'red'
}

/** Seconds until `axis` next turns green (0 if green now). Used for instructor hints. */
export function secondsUntilGreen(jn: Junction, axis: Axis, t: number): number {
  for (let dt = 0; dt < SIGNAL_CYCLE_S; dt += 0.25) {
    if (signalAspect(jn, axis, t + dt) === 'green') return dt
  }
  return 0
}

/* ---------- Junction map ---------- */

function buildJunctions(): Junction[] {
  const out: Junction[] = []
  for (let i = 1; i < NUM_BLOCKS; i++) {
    for (let j = 1; j < NUM_BLOCKS; j++) {
      const r = segmentRandom(i, j, 4242)
      // Centre junction is the spawn point: leave it open so nobody starts mid-violation.
      const centre = i === NUM_BLOCKS / 2 && j === NUM_BLOCKS / 2
      const rb = roundaboutAt(i, j)
      const control: Control = rb
        ? 'roundabout'
        : centre
          ? 'none'
          : r < 0.42
            ? 'signal'
            : r < 0.74
              ? 'stop'
              : 'giveway'
      out.push({
        name: rb?.name,
        i,
        j,
        x: roadStripCenterX(i),
        z: roadStripCenterZ(j),
        control,
        minor: segmentRandom(i, j, 4243) < 0.5 ? 'ns' : 'ew',
        offset: segmentRandom(i, j, 4244) * SIGNAL_CYCLE_S,
      })
    }
  }
  return out
}

export const JUNCTIONS: readonly Junction[] = buildJunctions()

const byIndex = new Map<number, Junction>()
for (const jn of JUNCTIONS) byIndex.set(jn.i * 100 + jn.j, jn)

export function junctionAt(i: number, j: number): Junction | undefined {
  return byIndex.get(i * 100 + j)
}

/** Does traffic on `axis` have to stop / give way here (ignoring signals)? */
export function mustYield(jn: Junction, axis: Axis): boolean {
  if (jn.control === 'roundabout') return true // everyone gives way to traffic already on the roundabout
  return (jn.control === 'stop' || jn.control === 'giveway') && jn.minor === axis
}

/* ---------- Approach geometry ---------- */

/** Unit travel vector for a heading. */
export function headingVec(h: Heading): { x: number; z: number } {
  switch (h) {
    case 'N':
      return { x: 0, z: 1 }
    case 'S':
      return { x: 0, z: -1 }
    case 'E':
      return { x: 1, z: 0 }
    case 'W':
      return { x: -1, z: 0 }
  }
}

/** Unit vector pointing to the traveller's left (keep-left side of the road). */
export function leftVec(h: Heading): { x: number; z: number } {
  switch (h) {
    case 'N':
      return { x: 1, z: 0 }
    case 'S':
      return { x: -1, z: 0 }
    case 'E':
      return { x: 0, z: -1 }
    case 'W':
      return { x: 0, z: 1 }
  }
}

/** Yaw (about +Y) that turns an object's local +Z to face traffic arriving with heading `h`. */
export function faceOncomingYaw(h: Heading): number {
  switch (h) {
    case 'N':
      return Math.PI
    case 'S':
      return 0
    case 'E':
      return -Math.PI / 2
    case 'W':
      return Math.PI / 2
  }
}

/**
 * Signed distance along `h` from point (x,z) to the stop line of junction `jn` (positive = line still
 * ahead). The stop line sits STOP_LINE_GAP before the junction box.
 */
/** Half width of the road a traveller with heading `h` is on, at junction `jn`. */
export function approachHalf(jn: Junction, h: Heading): number {
  return h === 'N' || h === 'S' ? nsHalf(jn.i) : ewHalf(jn.j)
}

/** Half width of the road being crossed (how deep the junction box is along `h`). */
export function crossHalf(jn: Junction, h: Heading): number {
  return h === 'N' || h === 'S' ? ewHalf(jn.j) : nsHalf(jn.i)
}

/**
 * Distance from the junction centre to its stop / give-way line along heading `h` (just before the crossing
 * road; roundabouts: the edge of the circle).
 */
export function stopLineEdge(jn: Junction, h: Heading): number {
  return jn.control === 'roundabout' ? ROUNDABOUT.disc + 0.25 : crossHalf(jn, h) + STOP_LINE_GAP
}

export function distToStopLine(jn: Junction, h: Heading, x: number, z: number): number {
  const edge = stopLineEdge(jn, h)
  switch (h) {
    case 'N':
      return jn.z - edge - z
    case 'S':
      return z - (jn.z + edge)
    case 'E':
      return jn.x - edge - x
    case 'W':
      return x - (jn.x + edge)
  }
}

export const HEADINGS: readonly Heading[] = ['N', 'S', 'E', 'W']

/** Every approach that has a stop line (signal approaches, and the minor arms of stop/giveway). */
export type Approach = { jn: Junction; h: Heading }

export const CONTROLLED_APPROACHES: readonly Approach[] = JUNCTIONS.flatMap((jn) =>
  HEADINGS.filter((h) => jn.control === 'signal' || mustYield(jn, axisOf(h))).map((h) => ({ jn, h })),
)

/* ---------- Zones ---------- */

export type Segment = { axis: Axis; strip: number; block: number }

/** School zones: road segments (between two junctions) with a 30 km/h limit. */
export const SCHOOL_SEGMENTS: readonly Segment[] = (() => {
  const out: Segment[] = []
  for (let strip = 1; strip < NUM_BLOCKS; strip++) {
    for (let block = 0; block < NUM_BLOCKS; block++) {
      if (segmentRandom(strip, block, 5151) < 0.045) out.push({ axis: 'ns', strip, block })
      if (segmentRandom(strip, block, 5252) < 0.045) out.push({ axis: 'ew', strip, block })
    }
  }
  return out
})()

const schoolKey = (s: Segment) => `${s.axis}:${s.strip}:${s.block}`
const schoolSet = new Set(SCHOOL_SEGMENTS.map(schoolKey))

export function isSchoolSegment(axis: Axis, strip: number, block: number): boolean {
  return schoolSet.has(`${axis}:${strip}:${block}`)
}

/** Zebra crossings as (axis of the road, strip, along-coordinate of the crossing). */
export type Zebra = { key: string; axis: Axis; strip: number; along: number; x: number; z: number }

export const ZEBRAS: readonly Zebra[] = [
  ...ZEBRA_VERTICAL_SITES.map((s) => ({ key: s.key, axis: 'ns' as const, strip: s.vi, along: s.z, x: s.cx, z: s.z })),
  ...ZEBRA_HORIZONTAL_SITES.map((s) => ({ key: s.key, axis: 'ew' as const, strip: s.hj, along: s.x, x: s.x, z: s.cz })),
]

/** Which road strip (if any) the point is on for travel along `axis`, using the strip's full width. */
export function stripFor(axis: Axis, x: number, z: number): number | null {
  const c = axis === 'ns' ? x : z
  const start = roadStripCenterX(0)
  const pitch = roadStripCenterX(1) - start
  const k = Math.round((c - start) / pitch)
  if (k < 0 || k > NUM_BLOCKS) return null
  const centre = start + k * pitch
  const half = axis === 'ns' ? nsHalf(k) : ewHalf(k)
  return Math.abs(c - centre) <= half + 0.05 ? k : null
}

/** Block index between junction k and k+1 along the strip for coordinate `along`. */
export function blockAlong(along: number): number {
  const start = roadStripCenterZ(0)
  const pitch = roadStripCenterZ(1) - start
  return Math.floor((along - start) / pitch)
}
