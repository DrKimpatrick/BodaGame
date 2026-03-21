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

/** Top of road deck (matches vertical/horizontal segment mesh). */
const ROAD_TOP_Y = 0.06
const HUMP_HALF_H = 0.1
const HUMP_ALONG = 1.28 /** span along traffic direction */

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

function segmentRandom(a: number, b: number, salt: number) {
  const t = Math.sin(a * 12.9898 + b * 78.233 + salt * 43.758) * 43758.5453123
  return t - Math.floor(t)
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
      items.push(
        <mesh
          key={`d-${i}`}
          position={[cx, LINE_Y, z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.16, DASH_LEN]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>,
      )
      z += period
      i++
    }
    return items
  }, [cx])

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

  return (
    <group>
      {roadSegments}
      <mesh position={[cx - HALF + SHOULDER_INSET, LINE_Y, midZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SHOULDER_W, CITY_TOTAL]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[cx + HALF - SHOULDER_INSET, LINE_Y, midZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SHOULDER_W, CITY_TOTAL]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
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
      items.push(
        <mesh
          key={`hd-${i}`}
          position={[x, LINE_Y, cz]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        >
          <planeGeometry args={[0.16, DASH_LEN]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>,
      )
      x += period
      i++
    }
    return items
  }, [cz])

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

  return (
    <group>
      {roadSegments}
      <mesh position={[midX, LINE_Y, cz - HALF + SHOULDER_INSET]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[SHOULDER_W, CITY_TOTAL]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[midX, LINE_Y, cz + HALF - SHOULDER_INSET]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[SHOULDER_W, CITY_TOTAL]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
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

  /** Mid-block only: halfway between junctions, never on intersection centres. */
  const zebraCrossings = useMemo(() => {
    const out: ReactElement[] = []
    for (let vi = 0; vi <= NUM_BLOCKS; vi++) {
      const cx = roadStripCenterX(vi)
      for (let j = 0; j < NUM_BLOCKS; j++) {
        if (segmentRandom(vi, j, 505) > 0.28) continue
        const z = (roadStripCenterZ(j) + roadStripCenterZ(j + 1)) / 2
        out.push(<ZebraAcrossVerticalRoad key={`zv-${vi}-${j}`} cx={cx} z={z} />)
      }
    }
    for (let hj = 0; hj <= NUM_BLOCKS; hj++) {
      const cz = roadStripCenterZ(hj)
      for (let i = 0; i < NUM_BLOCKS; i++) {
        if (segmentRandom(i, hj, 606) > 0.28) continue
        const x = (roadStripCenterX(i) + roadStripCenterX(i + 1)) / 2
        out.push(<ZebraAcrossHorizontalRoad key={`zh-${i}-${hj}`} x={x} cz={cz} />)
      }
    }
    return out
  }, [])

  /** Mid-block humps, offset along the road so they don’t always sit on zebras. */
  const speedHumps = useMemo(() => {
    const out: ReactElement[] = []
    const maxOff = 11
    for (let vi = 0; vi <= NUM_BLOCKS; vi++) {
      const cx = roadStripCenterX(vi)
      for (let j = 0; j < NUM_BLOCKS; j++) {
        if (segmentRandom(vi, j, 919) > 0.2) continue
        const mid = (roadStripCenterZ(j) + roadStripCenterZ(j + 1)) / 2
        const z = mid + (segmentRandom(vi, j, 920) - 0.5) * 2 * maxOff
        out.push(
          <SpeedHumpVerticalRoad key={`hv-${vi}-${j}`} cx={cx} z={z} material={tarmacMat} />,
        )
      }
    }
    for (let hj = 0; hj <= NUM_BLOCKS; hj++) {
      const cz = roadStripCenterZ(hj)
      for (let i = 0; i < NUM_BLOCKS; i++) {
        if (segmentRandom(i, hj, 921) > 0.2) continue
        const mid = (roadStripCenterX(i) + roadStripCenterX(i + 1)) / 2
        const x = mid + (segmentRandom(i, hj, 922) - 0.5) * 2 * maxOff
        out.push(
          <SpeedHumpHorizontalRoad key={`hh-${i}-${hj}`} x={x} cz={cz} material={tarmacMat} />,
        )
      }
    }
    return out
  }, [tarmacMat])

  return (
    <group>
      {vertical}
      {horizontal}
      {speedHumps}
      {zebraCrossings}
    </group>
  )
}
