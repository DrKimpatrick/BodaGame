import type { ReactElement } from 'react'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
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

function segmentRandom(a: number, b: number, salt: number) {
  const t = Math.sin(a * 12.9898 + b * 78.233 + salt * 43.758) * 43758.5453123
  return t - Math.floor(t)
}

function TrafficLight() {
  const phase = useRef(Math.random() * 15)
  const elapsed = useRef(0)
  const red = useRef<THREE.MeshStandardMaterial>(null)
  const yellow = useRef<THREE.MeshStandardMaterial>(null)
  const green = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((_, delta) => {
    elapsed.current += delta
    const cycle = (elapsed.current + phase.current) % 15
    const next = cycle < 5 ? 'red' : cycle < 10 ? 'yellow' : 'green'
    if (red.current) {
      red.current.color.set(next === 'red' ? '#ef4444' : '#3f1111')
      red.current.emissive.set(next === 'red' ? '#ef4444' : '#3f1111')
    }
    if (yellow.current) {
      yellow.current.color.set(next === 'yellow' ? '#f59e0b' : '#3f2a06')
      yellow.current.emissive.set(next === 'yellow' ? '#f59e0b' : '#3f2a06')
    }
    if (green.current) {
      green.current.color.set(next === 'green' ? '#22c55e' : '#0d2e17')
      green.current.emissive.set(next === 'green' ? '#22c55e' : '#0d2e17')
    }
  })

  return (
    <group>
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 3.6, 8]} />
        <meshStandardMaterial color="#475569" roughness={0.75} />
      </mesh>
      <mesh position={[0.16, 3.15, 0]} castShadow>
        <boxGeometry args={[0.32, 0.62, 0.24]} />
        <meshStandardMaterial color="#111827" roughness={0.85} />
      </mesh>
      <mesh position={[0.23, 3.34, 0]} castShadow>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial ref={red} color="#3f1111" emissive="#3f1111" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0.23, 3.15, 0]} castShadow>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial
          ref={yellow}
          color="#3f2a06"
          emissive="#3f2a06"
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh position={[0.23, 2.96, 0]} castShadow>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial ref={green} color="#0d2e17" emissive="#0d2e17" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

function IntersectionTrafficLights() {
  return (
    <group>
      {Array.from({ length: NUM_BLOCKS - 1 }, (_, ix) =>
        Array.from({ length: NUM_BLOCKS - 1 }, (_, iz) => {
          const x = roadStripCenterX(ix + 1)
          const z = roadStripCenterZ(iz + 1)
          return (
            <group key={`tl-${ix}-${iz}`}>
              <group position={[x + 1.65, 0, z + 1.65]}>
                <TrafficLight />
              </group>
              <group position={[x - 1.65, 0, z - 1.65]} rotation={[0, Math.PI, 0]}>
                <TrafficLight />
              </group>
            </group>
          )
        }),
      )}
    </group>
  )
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

  return (
    <group>
      {vertical}
      {horizontal}
      <IntersectionTrafficLights />
    </group>
  )
}
