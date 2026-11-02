import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { ReactElement } from 'react'
import { useMemo } from 'react'
import * as THREE from 'three'
import { asphaltTexture, murramTexture } from './realism/textures'
import {
  CITY_START,
  CITY_TOTAL,
  ewHalf,
  ewKind,
  MEDIAN_W,
  NUM_BLOCKS,
  nsHalf,
  nsKind,
  roadStripCenterX,
  roadStripCenterZ,
  type RoadKind,
} from '@game/cityGrid'
import { ROUNDABOUTS } from '@game/kampalaMap'
import { segmentRandom, ZEBRA_HORIZONTAL_SITES, ZEBRA_VERTICAL_SITES } from '@game/roadDecorPlacements'
import { HUMP_ALONG, HUMP_HALF_H, listPotholeSites, listSpeedHumpSites, ROAD_TOP_Y } from '@game/roadSurfaceFeatures'
import { SIDEWALK_WIDTH } from '@game/roadSpatial'
import { ROUNDABOUT } from '../roadRules/world/junctions'

/**
 * Kampala's road mix, drawn per road type:
 * - dual carriageway: two lanes each way, raised median with a black-and-white kerb and grass, edge lines;
 * - main road: two lanes each way, double solid centre line, dashed lane lines, edge lines;
 * - side street: one lane each way, faded dashed centre line, patched / dusty tarmac;
 * - murram: red unpaved road, no markings.
 * Main roads and dual carriageways have open concrete drains beyond the pavement, as on Kampala's streets.
 * Everything is static and merged by StaticBatch.
 */

const LINE_Y = ROAD_TOP_Y + 0.002
const DASH_LEN = 2.6
const DASH_GAP = 3.4
const DRAIN_W = 0.7
const MEDIAN_H = 0.22

/* ---------- Materials ---------- */

function createWornTarmacTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#2f3236'
  ctx.fillRect(0, 0, s, s)
  for (let i = 0; i < 12000; i++) {
    ctx.fillStyle = `rgba(160,160,160,${0.01 + Math.random() * 0.045})`
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1)
  }
  // Red murram dust and patch repairs, typical of Kampala side streets.
  for (let i = 0; i < 48; i++) {
    const red = 105 + Math.floor(Math.random() * 35)
    const green = 62 + Math.floor(Math.random() * 18)
    const blue = 30 + Math.floor(Math.random() * 14)
    ctx.fillStyle = `rgba(${red},${green},${blue},${0.2 + Math.random() * 0.26})`
    ctx.beginPath()
    ctx.ellipse(Math.random() * s, Math.random() * s, 7 + Math.random() * 20, 5 + Math.random() * 16, Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(20,20,22,${0.35 + Math.random() * 0.3})`
    ctx.fillRect(Math.random() * s, Math.random() * s, 18 + Math.random() * 40, 12 + Math.random() * 30)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 6)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const mats = (() => {
  const tarmacTex = asphaltTexture().clone()
  tarmacTex.repeat.set(2, 10)
  tarmacTex.needsUpdate = true
  const murramTex = murramTexture().clone()
  murramTex.repeat.set(2, 12)
  murramTex.needsUpdate = true
  const shoulderTex = murramTexture().clone()
  shoulderTex.repeat.set(1.2, 40)
  shoulderTex.needsUpdate = true
  const kerbCanvas = document.createElement('canvas')
  kerbCanvas.width = 64
  kerbCanvas.height = 8
  const g = kerbCanvas.getContext('2d')!
  g.fillStyle = '#f2f2ee'
  g.fillRect(0, 0, 32, 8)
  g.fillStyle = '#141414'
  g.fillRect(32, 0, 32, 8)
  const kerbTex = new THREE.CanvasTexture(kerbCanvas)
  kerbTex.colorSpace = THREE.SRGBColorSpace
  kerbTex.wrapS = kerbTex.wrapT = THREE.RepeatWrapping
  kerbTex.repeat.set(1, 12)
  return {
    tarmac: new THREE.MeshStandardMaterial({ map: tarmacTex, color: '#ffffff', roughness: 0.92 }),
    worn: new THREE.MeshStandardMaterial({ map: createWornTarmacTexture(), color: '#ffffff', roughness: 0.96 }),
    murram: new THREE.MeshStandardMaterial({ map: murramTex, color: '#d8c1ac', roughness: 1 }),
    shoulder: new THREE.MeshStandardMaterial({ map: shoulderTex, color: '#c9b6a6', roughness: 0.96 }),
    kerb: new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 }),
    medianGrass: new THREE.MeshStandardMaterial({ color: '#4f7d33', roughness: 0.95 }),
    drain: new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#a7a299', roughness: 0.9 }),
    line: new THREE.MeshBasicMaterial({ color: '#f0f0ea', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    lineFaded: new THREE.MeshBasicMaterial({
      color: '#a8a69e',
      toneMapped: false,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    zebra: new THREE.MeshBasicMaterial({ color: '#f2f2f0', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1 }),
    potholeDeep: new THREE.MeshStandardMaterial({ color: '#1b1814', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    potholeRim: new THREE.MeshStandardMaterial({ color: '#3b3732', roughness: 0.96, polygonOffset: true, polygonOffsetFactor: -0.8, polygonOffsetUnits: -1 }),
  }
})()

const surfaceFor = (kind: RoadKind, worn: boolean) => (kind === 'murram' ? mats.murram : worn ? mats.worn : mats.tarmac)

const roundaboutCentres = ROUNDABOUTS.map((r) => ({ x: roadStripCenterX(r.i), z: roadStripCenterZ(r.j) }))

/** Distance to keep a median clear of a roundabout's paved circle at a junction centre (x, z). */
function medianTrim(x: number, z: number): number {
  return roundaboutCentres.some((c) => Math.abs(c.x - x) < 0.1 && Math.abs(c.z - z) < 0.1) ? ROUNDABOUT.disc + 0.8 : 0
}

/* ---------- One road segment between two junctions ---------- */

type Seg = {
  key: string
  axis: 'ns' | 'ew'
  kind: RoadKind
  half: number
  /** Road centre (the coordinate across the road). */
  c: number
  /** Start / end along the road (junction box edges). */
  a0: number
  a1: number
  /** Junction centres at each end (for roundabout trimming). */
  j0: number
  j1: number
  worn: boolean
}

function buildSegments(): Seg[] {
  const out: Seg[] = []
  for (let i = 0; i <= NUM_BLOCKS; i++) {
    for (let j = 0; j < NUM_BLOCKS; j++) {
      out.push({
        key: `v-${i}-${j}`,
        axis: 'ns',
        kind: nsKind(i),
        half: nsHalf(i),
        c: roadStripCenterX(i),
        a0: roadStripCenterZ(j) + ewHalf(j),
        a1: roadStripCenterZ(j + 1) - ewHalf(j + 1),
        j0: roadStripCenterZ(j),
        j1: roadStripCenterZ(j + 1),
        worn: nsKind(i) === 'street' && segmentRandom(i, j, 17) < 0.55,
      })
    }
  }
  for (let j = 0; j <= NUM_BLOCKS; j++) {
    for (let i = 0; i < NUM_BLOCKS; i++) {
      out.push({
        key: `h-${j}-${i}`,
        axis: 'ew',
        kind: ewKind(j),
        half: ewHalf(j),
        c: roadStripCenterZ(j),
        a0: roadStripCenterX(i) + nsHalf(i),
        a1: roadStripCenterX(i + 1) - nsHalf(i + 1),
        j0: roadStripCenterX(i),
        j1: roadStripCenterX(i + 1),
        worn: ewKind(j) === 'street' && segmentRandom(j, i, 31) < 0.55,
      })
    }
  }
  return out
}

/** Place a flat or upright box/plane in segment space: `across` offset from the road centre, `along` position. */
function segPos(s: Seg, across: number, along: number, y: number): [number, number, number] {
  return s.axis === 'ns' ? [s.c + across, y, along] : [along, y, s.c + across]
}
/** Box size in world axes for (width across, height, length along). */
function segSize(s: Seg, across: number, h: number, along: number): [number, number, number] {
  return s.axis === 'ns' ? [across, h, along] : [along, h, across]
}

function Line({ s, across, a0, a1, faded, width = 0.12 }: { s: Seg; across: number; a0: number; a1: number; faded?: boolean; width?: number }) {
  const len = a1 - a0
  if (len <= 0.1) return null
  return (
    <mesh
      position={segPos(s, across, (a0 + a1) / 2, LINE_Y)}
      rotation={[-Math.PI / 2, 0, s.axis === 'ns' ? 0 : Math.PI / 2]}
      material={faded ? mats.lineFaded : mats.line}
    >
      <planeGeometry args={[width, len]} />
    </mesh>
  )
}

function Dashes({ s, across, faded }: { s: Seg; across: number; faded?: boolean }) {
  const items: ReactElement[] = []
  const period = DASH_LEN + DASH_GAP
  for (let a = s.a0 + 1.5; a + DASH_LEN < s.a1 - 1.5; a += period) {
    items.push(<Line key={a} s={s} across={across} a0={a} a1={a + DASH_LEN} faded={faded} />)
  }
  return <>{items}</>
}

function SegmentMarkings({ s }: { s: Seg }) {
  const edge = s.half - 0.28
  switch (s.kind) {
    case 'dual': {
      const laneLine = MEDIAN_W / 2 + (s.half - MEDIAN_W / 2) / 2
      return (
        <>
          <Dashes s={s} across={laneLine} />
          <Dashes s={s} across={-laneLine} />
          <Line s={s} across={edge} a0={s.a0} a1={s.a1} />
          <Line s={s} across={-edge} a0={s.a0} a1={s.a1} />
        </>
      )
    }
    case 'main':
      return (
        <>
          <Line s={s} across={0.14} a0={s.a0} a1={s.a1} width={0.1} />
          <Line s={s} across={-0.14} a0={s.a0} a1={s.a1} width={0.1} />
          <Dashes s={s} across={s.half / 2} />
          <Dashes s={s} across={-s.half / 2} />
          <Line s={s} across={edge} a0={s.a0} a1={s.a1} faded />
          <Line s={s} across={-edge} a0={s.a0} a1={s.a1} faded />
        </>
      )
    case 'street':
      return <Dashes s={s} across={0} faded={s.worn} />
    default:
      return null
  }
}

/** Raised median with black-and-white kerb and grass, trimmed back from roundabouts. */
function Median({ s }: { s: Seg }) {
  const a0 = Math.max(s.a0 + 0.4, s.j0 + medianTrim(s.axis === 'ns' ? s.c : s.j0, s.axis === 'ns' ? s.j0 : s.c))
  const a1 = Math.min(s.a1 - 0.4, s.j1 - medianTrim(s.axis === 'ns' ? s.c : s.j1, s.axis === 'ns' ? s.j1 : s.c))
  const len = a1 - a0
  if (len < 1) return null
  const mid = (a0 + a1) / 2
  return (
    <>
      <mesh position={segPos(s, 0, mid, ROAD_TOP_Y + MEDIAN_H / 2)} material={mats.kerb} castShadow receiveShadow>
        <boxGeometry args={segSize(s, MEDIAN_W, MEDIAN_H, len)} />
      </mesh>
      <mesh position={segPos(s, 0, mid, ROAD_TOP_Y + MEDIAN_H + 0.005)} rotation={[-Math.PI / 2, 0, s.axis === 'ns' ? 0 : Math.PI / 2]} material={mats.medianGrass} receiveShadow>
        <planeGeometry args={[MEDIAN_W - 0.24, len]} />
      </mesh>
    </>
  )
}

/** Solid medians: you can't ride across a dual carriageway. */
function MedianColliders({ segs }: { segs: Seg[] }) {
  const dual = segs.filter((s) => s.kind === 'dual')
  return (
    <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
      {dual.map((s) => {
        const a0 = Math.max(s.a0 + 0.4, s.j0 + medianTrim(s.axis === 'ns' ? s.c : s.j0, s.axis === 'ns' ? s.j0 : s.c))
        const a1 = Math.min(s.a1 - 0.4, s.j1 - medianTrim(s.axis === 'ns' ? s.c : s.j1, s.axis === 'ns' ? s.j1 : s.c))
        if (a1 - a0 < 1) return null
        const [hx, , hz] = segSize(s, MEDIAN_W / 2, 0, (a1 - a0) / 2)
        return <CuboidCollider key={s.key} args={[hx, 0.5, hz]} position={segPos(s, 0, (a0 + a1) / 2, 0.5)} />
      })}
    </RigidBody>
  )
}

function Segment({ s }: { s: Seg }) {
  const len = s.a1 - s.a0
  if (len <= 0.1) return null
  const mid = (s.a0 + s.a1) / 2
  return (
    <group>
      <mesh position={segPos(s, 0, mid, 0.03)} material={surfaceFor(s.kind, s.worn)} receiveShadow>
        <boxGeometry args={segSize(s, s.half * 2, 0.06, len)} />
      </mesh>
      <SegmentMarkings s={s} />
      {s.kind === 'dual' ? <Median s={s} /> : null}
    </group>
  )
}

/** Pavement strips (murram) the full length of each road, plus open drains along main roads. */
function Verges() {
  const items: ReactElement[] = []
  const mid = CITY_START + CITY_TOTAL / 2
  const strip = (axis: 'ns' | 'ew', k: number) => {
    const c = axis === 'ns' ? roadStripCenterX(k) : roadStripCenterZ(k)
    const half = axis === 'ns' ? nsHalf(k) : ewHalf(k)
    const kind = axis === 'ns' ? nsKind(k) : ewKind(k)
    for (const side of [-1, 1]) {
      const across = side * (half + SIDEWALK_WIDTH / 2)
      const pos: [number, number, number] = axis === 'ns' ? [c + across, 0.022, mid] : [mid, 0.022, c + across]
      const size: [number, number, number] = axis === 'ns' ? [SIDEWALK_WIDTH, 0.028, CITY_TOTAL] : [CITY_TOTAL, 0.028, SIDEWALK_WIDTH]
      items.push(
        <mesh key={`sw-${axis}-${k}-${side}`} position={pos} material={mats.shoulder} receiveShadow>
          <boxGeometry args={size} />
        </mesh>,
      )
      if (kind === 'main' || kind === 'dual') {
        // Open drain (dark channel with concrete lips) beyond the pavement, broken at each crossing road.
        const dAcross = side * (half + SIDEWALK_WIDTH + DRAIN_W / 2)
        for (let n = 0; n < NUM_BLOCKS; n++) {
          const crossA = axis === 'ns' ? ewHalf(n) : nsHalf(n)
          const crossB = axis === 'ns' ? ewHalf(n + 1) : nsHalf(n + 1)
          const startA = axis === 'ns' ? roadStripCenterZ(n) : roadStripCenterX(n)
          const startB = axis === 'ns' ? roadStripCenterZ(n + 1) : roadStripCenterX(n + 1)
          const a0 = startA + crossA + SIDEWALK_WIDTH + 0.2
          const a1 = startB - crossB - SIDEWALK_WIDTH - 0.2
          const len = a1 - a0
          if (len < 1) continue
          const am = (a0 + a1) / 2
          const at = (acr: number, y: number): [number, number, number] => (axis === 'ns' ? [c + acr, y, am] : [am, y, c + acr])
          const sz = (w: number, h: number): [number, number, number] => (axis === 'ns' ? [w, h, len] : [len, h, w])
          items.push(
            <mesh key={`dr-${axis}-${k}-${side}-${n}`} position={at(dAcross, 0.012)} material={mats.drain}>
              <boxGeometry args={sz(DRAIN_W, 0.02)} />
            </mesh>,
          )
          for (const lip of [-1, 1]) {
            items.push(
              <mesh key={`dl-${axis}-${k}-${side}-${n}-${lip}`} position={at(dAcross + lip * (DRAIN_W / 2 + 0.06), 0.06)} material={mats.concrete}>
                <boxGeometry args={sz(0.12, 0.12)} />
              </mesh>,
            )
          }
        }
      }
    }
  }
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    strip('ns', k)
    strip('ew', k)
  }
  return <>{items}</>
}

/** Junction boxes sized by the two crossing roads. */
function JunctionBoxes() {
  const items: ReactElement[] = []
  for (let i = 0; i <= NUM_BLOCKS; i++) {
    for (let j = 0; j <= NUM_BLOCKS; j++) {
      const murram = nsKind(i) === 'murram' && ewKind(j) === 'murram'
      items.push(
        <mesh key={`jb-${i}-${j}`} position={[roadStripCenterX(i), 0.031, roadStripCenterZ(j)]} material={murram ? mats.murram : mats.tarmac} receiveShadow>
          <boxGeometry args={[nsHalf(i) * 2, 0.062, ewHalf(j) * 2]} />
        </mesh>,
      )
    }
  }
  return <>{items}</>
}

function Zebras() {
  const items: ReactElement[] = []
  const stripes = (key: string, cx: number, cz: number, half: number, axis: 'ns' | 'ew') => {
    const span = half * 2 * 0.9
    const n = Math.floor(span / 0.62)
    for (let k = 0; k < n; k++) {
      const off = -span / 2 + 0.31 + k * 0.62
      items.push(
        <mesh
          key={`${key}-${k}`}
          position={axis === 'ns' ? [cx + off, ROAD_TOP_Y + 0.006, cz] : [cx, ROAD_TOP_Y + 0.006, cz + off]}
          rotation={[-Math.PI / 2, 0, axis === 'ns' ? 0 : Math.PI / 2]}
          material={mats.zebra}
        >
          <planeGeometry args={[0.32, 3]} />
        </mesh>,
      )
    }
  }
  for (const s of ZEBRA_VERTICAL_SITES) stripes(s.key, s.cx, s.z, nsHalf(s.vi), 'ns')
  for (const s of ZEBRA_HORIZONTAL_SITES) stripes(s.key, s.x, s.cz, ewHalf(s.hj), 'ew')
  return <>{items}</>
}

/** A real road hump: a low rounded bar right across the road, in weathered yellow and tarmac stripes. */
const humpGeometry = new THREE.CylinderGeometry(1, 1, 2, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2)
const humpStripes = (() => {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#2c2c2e'
  g.fillRect(0, 0, 16, 64)
  g.fillStyle = '#b89a2e'
  g.fillRect(0, 0, 16, 32)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, 7)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 })
})()

function Humps() {
  const { vertical, horizontal } = useMemo(() => listSpeedHumpSites(), [])
  // Sites give 80% of the road's half width (the ride effect fades there); the bar itself reaches the kerbs.
  return (
    <>
      {vertical.map((h) => (
        <mesh key={h.key} geometry={humpGeometry} position={[h.cx, ROAD_TOP_Y, h.z]} scale={[h.ax / 0.8, HUMP_HALF_H * 1.4, HUMP_ALONG]} material={humpStripes} castShadow receiveShadow />
      ))}
      {horizontal.map((h) => (
        <mesh key={h.key} geometry={humpGeometry} position={[h.x, ROAD_TOP_Y, h.cz]} rotation={[0, Math.PI / 2, 0]} scale={[h.ax / 0.8, HUMP_HALF_H * 1.4, HUMP_ALONG]} material={humpStripes} castShadow receiveShadow />
      ))}
    </>
  )
}

function Potholes() {
  const sites = useMemo(() => listPotholeSites(), [])
  return (
    <>
      {sites.map((p) => {
        const rot = (p.x * 0.17 + p.z * 0.13) % (Math.PI * 2)
        return (
          <group key={p.key}>
            <mesh position={[p.x, ROAD_TOP_Y + 0.001, p.z]} rotation={[-Math.PI / 2, 0, rot]} material={mats.potholeDeep}>
              <circleGeometry args={[p.r * 0.92, 12]} />
            </mesh>
            <mesh position={[p.x, ROAD_TOP_Y + 0.003, p.z]} rotation={[-Math.PI / 2, 0, rot]} material={mats.potholeRim}>
              <ringGeometry args={[p.r * 0.7, p.r * 1.04, 12]} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

export function RoadNetwork() {
  const segs = useMemo(() => buildSegments(), [])
  return (
    <group>
      <Verges />
      <JunctionBoxes />
      {segs.map((s) => (
        <Segment key={s.key} s={s} />
      ))}
      <MedianColliders segs={segs} />
      <Zebras />
      <Humps />
      <Potholes />
    </group>
  )
}
