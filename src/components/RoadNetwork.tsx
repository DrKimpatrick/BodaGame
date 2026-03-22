import type { ReactElement } from 'react'
import { useMemo } from 'react'
import * as THREE from 'three'
import {
  BLOCK,
  CITY_START,
  CITY_TOTAL,
  NUM_BLOCKS,
  ROAD_W,
  roadStripCenterX,
  roadStripCenterZ,
} from '@game/cityGrid'
import {
  segmentRandom,
  ZEBRA_HORIZONTAL_SITES,
  ZEBRA_VERTICAL_SITES,
} from '@game/roadDecorPlacements'
import {
  HUMP_ALONG,
  HUMP_HALF_H,
  listPotholeSites,
  listSpeedHumpSites,
  ROAD_TOP_Y,
} from '@game/roadSurfaceFeatures'
import { SIDEWALK_WIDTH } from '@game/roadSpatial'

const Z0 = CITY_START
const Z1 = CITY_START + CITY_TOTAL
const X0 = CITY_START
const X1 = CITY_START + CITY_TOTAL
const HALF = ROAD_W / 2

const LINE_Y = 0.062
const SHOULDER_INSET = 0.07
const SHOULDER_W = 0.11
const DASH_LEN = 2.2
const DASH_GAP = 2.8
const WORN_RATIO = 0.4
/** Half-width of the overlapping road square at each crossing (ROAD_W / 2). */
const INTERSECTION_HALF = HALF
/** Extra gap so dashes / shoulders don’t bleed into the junction. */
const MARK_PAD = 0.1
/** Radius of outer white corner fillet (matches reference: rounded junction corners). */
const CORNER_FILLET_R = 0.92

const STRIP_CENTERS_X = Array.from({ length: NUM_BLOCKS + 1 }, (_, k) => roadStripCenterX(k))
const STRIP_CENTERS_Z = Array.from({ length: NUM_BLOCKS + 1 }, (_, k) => roadStripCenterZ(k))

const lineMatFresh = new THREE.MeshBasicMaterial({
  color: '#f0f0ea',
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
})

const lineMatFaded = new THREE.MeshBasicMaterial({
  color: '#9c9a92',
  toneMapped: false,
  opacity: 0.52,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
})

const lineMatWorn = new THREE.MeshBasicMaterial({
  color: '#6a6860',
  toneMapped: false,
  opacity: 0.26,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1.2,
  polygonOffsetUnits: -1,
})

function pickRoadLineMat(ia: number, ib: number, salt: number): THREE.MeshBasicMaterial {
  const r = segmentRandom(ia, ib, salt)
  if (r < 0.27) return lineMatWorn
  if (r < 0.54) return lineMatFaded
  return lineMatFresh
}

function dashOverlapsIntersectionAlongZ(z: number): boolean {
  const ext = INTERSECTION_HALF + DASH_LEN / 2 + MARK_PAD
  return STRIP_CENTERS_Z.some((iz) => Math.abs(z - iz) < ext)
}

function dashOverlapsIntersectionAlongX(x: number): boolean {
  const ext = INTERSECTION_HALF + DASH_LEN / 2 + MARK_PAD
  return STRIP_CENTERS_X.some((ix) => Math.abs(x - ix) < ext)
}

/** Straight shoulder runs along Z between intersection boxes (for N–S strips). */
function verticalShoulderZRanges(): [number, number][] {
  const sorted = [...STRIP_CENTERS_Z].sort((a, b) => a - b)
  const out: [number, number][] = []
  let zLo = Z0
  for (const iz of sorted) {
    const zHi = iz - INTERSECTION_HALF - MARK_PAD * 0.5
    if (zHi - zLo > 0.2) out.push([zLo, zHi])
    zLo = iz + INTERSECTION_HALF + MARK_PAD * 0.5
  }
  if (Z1 - zLo > 0.2) out.push([zLo, Z1])
  return out
}

/** Straight shoulder runs along X between intersection boxes (for E–W strips). */
function horizontalShoulderXRanges(): [number, number][] {
  const sorted = [...STRIP_CENTERS_X].sort((a, b) => a - b)
  const out: [number, number][] = []
  let xLo = X0
  for (const ix of sorted) {
    const xHi = ix - INTERSECTION_HALF - MARK_PAD * 0.5
    if (xHi - xLo > 0.2) out.push([xLo, xHi])
    xLo = ix + INTERSECTION_HALF + MARK_PAD * 0.5
  }
  if (X1 - xLo > 0.2) out.push([xLo, X1])
  return out
}

const VERTICAL_SHOULDER_Z_RANGES = verticalShoulderZRanges()
const HORIZONTAL_SHOULDER_X_RANGES = horizontalShoulderXRanges()

/** Quarter-ring white fillets at the four outer corners of each intersection. */
function IntersectionCornerFillets() {
  const filletInner = Math.max(0.06, CORNER_FILLET_R - SHOULDER_W)
  const segs = 14
  const elems: ReactElement[] = []
  let key = 0
  for (let vi = 0; vi <= NUM_BLOCKS; vi++) {
    const ix = roadStripCenterX(vi)
    for (let hj = 0; hj <= NUM_BLOCKS; hj++) {
      const iz = roadStripCenterZ(hj)
      const corners: { ox: number; oz: number; thetaStart: number }[] = [
        { ox: ix + INTERSECTION_HALF - CORNER_FILLET_R, oz: iz + INTERSECTION_HALF - CORNER_FILLET_R, thetaStart: 0 },
        { ox: ix - INTERSECTION_HALF + CORNER_FILLET_R, oz: iz + INTERSECTION_HALF - CORNER_FILLET_R, thetaStart: Math.PI / 2 },
        { ox: ix - INTERSECTION_HALF + CORNER_FILLET_R, oz: iz - INTERSECTION_HALF + CORNER_FILLET_R, thetaStart: Math.PI },
        {
          ox: ix + INTERSECTION_HALF - CORNER_FILLET_R,
          oz: iz - INTERSECTION_HALF + CORNER_FILLET_R,
          thetaStart: (3 * Math.PI) / 2,
        },
      ]
      for (let c = 0; c < 4; c++) {
        const { ox, oz, thetaStart } = corners[c]!
        elems.push(
          <mesh
            key={`fillet-${key++}`}
            position={[ox, LINE_Y, oz]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={pickRoadLineMat(vi, hj * 11 + c, 823)}
          >
            <ringGeometry args={[filletInner, CORNER_FILLET_R, segs, 1, thetaStart, Math.PI / 2]} />
          </mesh>,
        )
      }
    }
  }
  return <group>{elems}</group>
}

/** High-contrast old tarmac: #1a1a1a + subtle grain (normal-style noise in albedo). */
function createOldTarmacTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  if (!ctx) return new THREE.Texture()
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, s, s)
  for (let i = 0; i < 12000; i++) {
    const v = Math.random()
    ctx.fillStyle =
      v > 0.5
        ? `rgba(255,255,255,${0.012 + Math.random() * 0.028})`
        : `rgba(0,0,0,${0.02 + Math.random() * 0.06})`
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1)
  }
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(45,45,48,${0.15 + Math.random() * 0.25})`
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(CITY_TOTAL / 8, CITY_TOTAL / 8)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function createWornTarmacTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  if (!ctx) return new THREE.Texture()
  ctx.fillStyle = '#2f3236'
  ctx.fillRect(0, 0, s, s)
  for (let i = 0; i < 12000; i++) {
    ctx.fillStyle = `rgba(160,160,160,${0.01 + Math.random() * 0.045})`
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1)
  }
  for (let i = 0; i < 48; i++) {
    const x = Math.random() * s
    const y = Math.random() * s
    const rx = 7 + Math.random() * 20
    const rz = 5 + Math.random() * 16
    const red = 105 + Math.floor(Math.random() * 35)
    const green = 62 + Math.floor(Math.random() * 18)
    const blue = 30 + Math.floor(Math.random() * 14)
    ctx.fillStyle = `rgba(${red},${green},${blue},${0.2 + Math.random() * 0.26})`
    ctx.beginPath()
    ctx.ellipse(x, y, rx, rz, Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3.4, 2.2)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const dirtMatProps = {
  color: '#5c4a38',
  roughness: 0.92,
  metalness: 0.02,
} as const

const ZEBRA_Y = 0.066
const ZEBRA_STRIPE = 0.32
const ZEBRA_GAP = 0.3
const ZEBRA_COVER = 0.86 /** fraction of ROAD_W covered along each axis */

const zebraStripeMat = new THREE.MeshBasicMaterial({
  color: '#f2f2f0',
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -1.5,
  polygonOffsetUnits: -1,
})

/** Rounded transverse hump on an N–S carriageway (ellipsoid, traffic ±Z). */
function SpeedHumpVerticalRoad({
  cx,
  z,
  material,
}: {
  cx: number
  z: number
  material: THREE.MeshStandardMaterial
}) {
  return (
    <mesh
      position={[cx, ROAD_TOP_Y + HUMP_HALF_H, z]}
      scale={[ROAD_W * 0.4, HUMP_HALF_H, HUMP_ALONG]}
      castShadow
      receiveShadow
      material={material}
    >
      <sphereGeometry args={[1, 14, 10]} />
    </mesh>
  )
}

/** Rounded transverse hump on an E–W carriageway (traffic ±X). */
function SpeedHumpHorizontalRoad({
  x,
  cz,
  material,
}: {
  x: number
  cz: number
  material: THREE.MeshStandardMaterial
}) {
  return (
    <mesh
      position={[x, ROAD_TOP_Y + HUMP_HALF_H, cz]}
      scale={[HUMP_ALONG, HUMP_HALF_H, ROAD_W * 0.4]}
      castShadow
      receiveShadow
      material={material}
    >
      <sphereGeometry args={[1, 14, 10]} />
    </mesh>
  )
}

/** Stripes across a N–S road (traffic ±Z): wide along X, thin along Z. */
function ZebraAcrossVerticalRoad({ cx, z }: { cx: number; z: number }) {
  const span = ROAD_W * ZEBRA_COVER
  const period = ZEBRA_STRIPE + ZEBRA_GAP
  const n = Math.max(4, Math.floor(span / period))
  const used = n * period - ZEBRA_GAP
  const startOff = -used / 2 + ZEBRA_STRIPE / 2
  const roadW = ROAD_W * 0.94

  const bars: ReactElement[] = []
  for (let k = 0; k < n; k++) {
    bars.push(
      <mesh
        key={k}
        position={[cx, ZEBRA_Y, z + startOff + k * period]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={zebraStripeMat}
      >
        <planeGeometry args={[roadW, ZEBRA_STRIPE]} />
      </mesh>,
    )
  }
  return <group>{bars}</group>
}

/** Stripes across an E–W road (traffic ±X): thin along X, wide along Z. */
function ZebraAcrossHorizontalRoad({ x, cz }: { x: number; cz: number }) {
  const span = ROAD_W * ZEBRA_COVER
  const period = ZEBRA_STRIPE + ZEBRA_GAP
  const n = Math.max(4, Math.floor(span / period))
  const used = n * period - ZEBRA_GAP
  const startOff = -used / 2 + ZEBRA_STRIPE / 2
  const roadW = ROAD_W * 0.94

  const bars: ReactElement[] = []
  for (let k = 0; k < n; k++) {
    bars.push(
      <mesh
        key={k}
        position={[x + startOff + k * period, ZEBRA_Y, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={zebraStripeMat}
      >
        <planeGeometry args={[ZEBRA_STRIPE, roadW]} />
      </mesh>,
    )
  }
  return <group>{bars}</group>
}

function VerticalRoadStrip({
  cx,
  tarmacMat,
  wornMat,
  stripIndex,
}: {
  cx: number
  tarmacMat: THREE.MeshStandardMaterial
  wornMat: THREE.MeshStandardMaterial
  stripIndex: number
}) {
  const dashes = useMemo(() => {
    const items: ReactElement[] = []
    const period = DASH_LEN + DASH_GAP
    let z = Z0 + DASH_LEN / 2
    let i = 0
    while (z < Z1 - DASH_LEN / 2) {
      if (!dashOverlapsIntersectionAlongZ(z)) {
        items.push(
          <mesh
            key={`d-${i}`}
            position={[cx, LINE_Y, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={pickRoadLineMat(stripIndex, i, 707)}
          >
            <planeGeometry args={[0.16, DASH_LEN]} />
          </mesh>,
        )
      }
      z += period
      i++
    }
    return items
  }, [cx, stripIndex])

  const midZ = (Z0 + Z1) / 2
  const roadSegments = useMemo(
    () =>
      Array.from({ length: NUM_BLOCKS }, (_, seg) => {
        const length = BLOCK + ROAD_W
        const z = CITY_START + ROAD_W / 2 + seg * length + length / 2
        const worn = segmentRandom(stripIndex, seg, 17) < WORN_RATIO
        return (
          <mesh key={`vr-${seg}`} position={[cx, 0.03, z]} receiveShadow material={worn ? wornMat : tarmacMat}>
            <boxGeometry args={[ROAD_W, 0.06, length]} />
          </mesh>
        )
      }),
    [cx, stripIndex, tarmacMat, wornMat],
  )

  const xLeft = cx - HALF + SHOULDER_INSET
  const xRight = cx + HALF - SHOULDER_INSET

  return (
    <group>
      {roadSegments}
      {VERTICAL_SHOULDER_Z_RANGES.map(([za, zb], si) => {
        const len = zb - za
        const zm = (za + zb) / 2
        return (
          <group key={`vs-${stripIndex}-${si}`}>
            <mesh
              position={[xLeft, LINE_Y, zm]}
              rotation={[-Math.PI / 2, 0, 0]}
              material={pickRoadLineMat(stripIndex, si, 717)}
            >
              <planeGeometry args={[SHOULDER_W, len]} />
            </mesh>
            <mesh
              position={[xRight, LINE_Y, zm]}
              rotation={[-Math.PI / 2, 0, 0]}
              material={pickRoadLineMat(stripIndex, si + 64, 718)}
            >
              <planeGeometry args={[SHOULDER_W, len]} />
            </mesh>
          </group>
        )
      })}
      {dashes}
      <mesh position={[cx + HALF + SIDEWALK_WIDTH / 2, 0.022, midZ]} receiveShadow>
        <boxGeometry args={[SIDEWALK_WIDTH, 0.028, CITY_TOTAL]} />
        <meshStandardMaterial {...dirtMatProps} />
      </mesh>
      <mesh position={[cx - HALF - SIDEWALK_WIDTH / 2, 0.022, midZ]} receiveShadow>
        <boxGeometry args={[SIDEWALK_WIDTH, 0.028, CITY_TOTAL]} />
        <meshStandardMaterial {...dirtMatProps} />
      </mesh>
    </group>
  )
}

function HorizontalRoadStrip({
  cz,
  tarmacMat,
  wornMat,
  stripIndex,
}: {
  cz: number
  tarmacMat: THREE.MeshStandardMaterial
  wornMat: THREE.MeshStandardMaterial
  stripIndex: number
}) {
  const dashes = useMemo(() => {
    const items: ReactElement[] = []
    const period = DASH_LEN + DASH_GAP
    let x = X0 + DASH_LEN / 2
    let i = 0
    while (x < X1 - DASH_LEN / 2) {
      if (!dashOverlapsIntersectionAlongX(x)) {
        items.push(
          <mesh
            key={`hd-${i}`}
            position={[x, LINE_Y, cz]}
            rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            material={pickRoadLineMat(stripIndex, i, 807)}
          >
            <planeGeometry args={[0.16, DASH_LEN]} />
          </mesh>,
        )
      }
      x += period
      i++
    }
    return items
  }, [cz, stripIndex])

  const midX = (X0 + X1) / 2
  const roadSegments = useMemo(
    () =>
      Array.from({ length: NUM_BLOCKS }, (_, seg) => {
        const length = BLOCK + ROAD_W
        const x = CITY_START + ROAD_W / 2 + seg * length + length / 2
        const worn = segmentRandom(stripIndex, seg, 31) < WORN_RATIO
        return (
          <mesh key={`hr-${seg}`} position={[x, 0.03, cz]} receiveShadow material={worn ? wornMat : tarmacMat}>
            <boxGeometry args={[length, 0.06, ROAD_W]} />
          </mesh>
        )
      }),
    [cz, stripIndex, tarmacMat, wornMat],
  )

  const zSouth = cz - HALF + SHOULDER_INSET
  const zNorth = cz + HALF - SHOULDER_INSET

  return (
    <group>
      {roadSegments}
      {HORIZONTAL_SHOULDER_X_RANGES.map(([xa, xb], si) => {
        const len = xb - xa
        const xm = (xa + xb) / 2
        return (
          <group key={`hs-${stripIndex}-${si}`}>
            <mesh
              position={[xm, LINE_Y, zSouth]}
              rotation={[-Math.PI / 2, 0, Math.PI / 2]}
              material={pickRoadLineMat(stripIndex, si, 727)}
            >
              <planeGeometry args={[SHOULDER_W, len]} />
            </mesh>
            <mesh
              position={[xm, LINE_Y, zNorth]}
              rotation={[-Math.PI / 2, 0, Math.PI / 2]}
              material={pickRoadLineMat(stripIndex, si + 64, 728)}
            >
              <planeGeometry args={[SHOULDER_W, len]} />
            </mesh>
          </group>
        )
      })}
      {dashes}
      <mesh position={[midX, 0.022, cz + HALF + SIDEWALK_WIDTH / 2]} receiveShadow>
        <boxGeometry args={[CITY_TOTAL, 0.028, SIDEWALK_WIDTH]} />
        <meshStandardMaterial {...dirtMatProps} />
      </mesh>
      <mesh position={[midX, 0.022, cz - HALF - SIDEWALK_WIDTH / 2]} receiveShadow>
        <boxGeometry args={[CITY_TOTAL, 0.028, SIDEWALK_WIDTH]} />
        <meshStandardMaterial {...dirtMatProps} />
      </mesh>
    </group>
  )
}

/** Charcoal tarmac, dashed centre line, solid shoulders, murram strips (no physics). */
export function RoadNetwork() {
  const tarmacTex = useMemo(() => createOldTarmacTexture(), [])
  const wornTex = useMemo(() => createWornTarmacTexture(), [])
  const tarmacMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: tarmacTex,
        color: '#1a1a1a',
        roughness: 0.94,
        metalness: 0.02,
      }),
    [tarmacTex],
  )
  const wornMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: wornTex,
        color: '#2f3236',
        roughness: 0.98,
        metalness: 0.01,
      }),
    [wornTex],
  )

  const vertical = useMemo(
    () =>
      Array.from({ length: NUM_BLOCKS + 1 }, (_, k) => (
        <VerticalRoadStrip
          key={`v-${k}`}
          cx={roadStripCenterX(k)}
          tarmacMat={tarmacMat}
          wornMat={wornMat}
          stripIndex={k}
        />
      )),
    [tarmacMat, wornMat],
  )

  const horizontal = useMemo(
    () =>
      Array.from({ length: NUM_BLOCKS + 1 }, (_, k) => (
        <HorizontalRoadStrip
          key={`h-${k}`}
          cz={roadStripCenterZ(k)}
          tarmacMat={tarmacMat}
          wornMat={wornMat}
          stripIndex={k}
        />
      )),
    [tarmacMat, wornMat],
  )

  const zebraCrossings = useMemo(() => {
    const out: ReactElement[] = []
    for (const s of ZEBRA_VERTICAL_SITES) {
      out.push(<ZebraAcrossVerticalRoad key={s.key} cx={s.cx} z={s.z} />)
    }
    for (const s of ZEBRA_HORIZONTAL_SITES) {
      out.push(<ZebraAcrossHorizontalRoad key={s.key} x={s.x} cz={s.cz} />)
    }
    return out
  }, [])

  const speedHumps = useMemo(() => {
    const { vertical, horizontal } = listSpeedHumpSites()
    const out: ReactElement[] = []
    for (const h of vertical) {
      out.push(
        <SpeedHumpVerticalRoad key={h.key} cx={h.cx} z={h.z} material={tarmacMat} />,
      )
    }
    for (const h of horizontal) {
      out.push(
        <SpeedHumpHorizontalRoad key={h.key} x={h.x} cz={h.cz} material={tarmacMat} />,
      )
    }
    return out
  }, [tarmacMat])

  const potholeDeepMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#060504',
        roughness: 1,
        metalness: 0,
        emissive: '#1a0f08',
        emissiveIntensity: 0.12,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  )
  const potholeAsphaltMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#2a2520',
        roughness: 0.96,
        metalness: 0.03,
        polygonOffset: true,
        polygonOffsetFactor: -0.8,
        polygonOffsetUnits: -1,
      }),
    [],
  )
  const potholeCrackMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#8a7a68',
        roughness: 0.88,
        metalness: 0.06,
        emissive: '#3d3228',
        emissiveIntensity: 0.08,
        polygonOffset: true,
        polygonOffsetFactor: -0.6,
        polygonOffsetUnits: -1,
      }),
    [],
  )

  const potholeMeshes = useMemo(() => {
    return listPotholeSites().map((p) => {
      const rot = (p.x * 0.17 + p.z * 0.13) % (Math.PI * 2)
      return (
        <group key={p.key}>
          <mesh
            position={[p.x, ROAD_TOP_Y - 0.024, p.z]}
            rotation={[-Math.PI / 2, 0, rot]}
            material={potholeDeepMat}
            renderOrder={1}
          >
            <circleGeometry args={[p.r * 0.92, 28]} />
          </mesh>
          <mesh
            position={[p.x, ROAD_TOP_Y + 0.002, p.z]}
            rotation={[-Math.PI / 2, 0, rot]}
            material={potholeAsphaltMat}
            renderOrder={2}
          >
            <ringGeometry args={[p.r * 0.18, p.r * 1.04, 24]} />
          </mesh>
          <mesh
            position={[p.x, ROAD_TOP_Y + 0.005, p.z]}
            rotation={[-Math.PI / 2, 0, rot * 1.7]}
            material={potholeCrackMat}
            renderOrder={3}
          >
            <ringGeometry args={[p.r * 0.28, p.r * 0.88, 22]} />
          </mesh>
        </group>
      )
    })
  }, [potholeDeepMat, potholeAsphaltMat, potholeCrackMat])

  return (
    <group>
      {vertical}
      {horizontal}
      <IntersectionCornerFillets />
      {speedHumps}
      {potholeMeshes}
      {zebraCrossings}
    </group>
  )
}
