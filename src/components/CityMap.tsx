import { useTexture } from '@react-three/drei'
import type { ReactNode } from 'react'
import { Suspense, useMemo, useState } from 'react'
import * as THREE from 'three'
import { v4 as uuidv4 } from 'uuid'

/** 10×10 blocks, roads between (11 strips each way). Origin = central intersection. */
const NUM_BLOCKS = 10
const ROAD_W = 4
const BLOCK = 14
const CITY_TOTAL = NUM_BLOCKS * BLOCK + (NUM_BLOCKS + 1) * ROAD_W
const CITY_START = -CITY_TOTAL / 2

/** Map coords from design brief → world XZ (±200 → inside playable city). */
const MAP_COORD_SCALE = (CITY_TOTAL * 0.38) / 200
const LANDMARK_MAPEERA: [number, number] = [
  200 * MAP_COORD_SCALE,
  200 * MAP_COORD_SCALE,
]
const LANDMARK_STANBIC: [number, number] = [
  -200 * MAP_COORD_SCALE,
  200 * MAP_COORD_SCALE,
]
const LANDMARK_NSSF: [number, number] = [
  200 * MAP_COORD_SCALE,
  -200 * MAP_COORD_SCALE,
]

const LANDMARK_CLEARANCE = 20
const LANDMARK_BLOCK_SKIP = 34

function roadStripCenterX(k: number) {
  return CITY_START + k * (ROAD_W + BLOCK) + ROAD_W / 2
}

function roadStripCenterZ(k: number) {
  return CITY_START + k * (ROAD_W + BLOCK) + ROAD_W / 2
}

function blockCenter(i: number, j: number): [number, number] {
  const cx =
    CITY_START + ROAD_W + i * (ROAD_W + BLOCK) + BLOCK / 2
  const cz =
    CITY_START + ROAD_W + j * (ROAD_W + BLOCK) + BLOCK / 2
  return [cx, cz]
}

function rnd(i: number, j: number, salt: number) {
  const t = Math.sin(i * 12.9898 + j * 78.233 + salt * 43.758) * 43758.5453123
  return t - Math.floor(t)
}

const WALL_TONES = ['#f5edd8', '#e8dcc4', '#d4c4a8', '#c9b896'] as const

function configureFacadeTexture(t: THREE.Texture) {
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.colorSpace = THREE.SRGBColorSpace
}

function createNSSFTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 200
  const g = c.getContext('2d')
  if (!g) return new THREE.Texture()
  g.fillStyle = '#0369c9'
  g.fillRect(0, 0, 512, 200)
  g.fillStyle = '#ffffff'
  g.font = 'bold 110px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('NSSF', 256, 100)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function createAsphaltRoadTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  if (!ctx) return new THREE.Texture()
  ctx.fillStyle = '#252528'
  ctx.fillRect(0, 0, s, s)
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1)
  }
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(CITY_TOTAL / 12, CITY_TOTAL / 12)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function createMurramHazeTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  if (!ctx) return new THREE.Texture()
  ctx.fillStyle = '#9a3412'
  ctx.fillRect(0, 0, s, s)
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(180,80,30,${0.08 + Math.random() * 0.2})`
    ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2)
  }
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgba(60,30,15,${Math.random() * 0.12})`
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(CITY_TOTAL / 14, CITY_TOTAL / 14)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const landmarkPoints: [number, number][] = [
  LANDMARK_MAPEERA,
  LANDMARK_STANBIC,
  LANDMARK_NSSF,
]

function minDistToLandmark(x: number, z: number) {
  let m = Infinity
  for (const [lx, lz] of landmarkPoints) {
    m = Math.min(m, Math.hypot(x - lx, z - lz))
  }
  return m
}

/** Twin volumes + tall spire (~3× typical tower module), textured like Mapeera façade. */
export function MapeeraBuilding({
  material,
  cx,
  cz,
}: {
  material: THREE.MeshStandardMaterial
  cx: number
  cz: number
}) {
  const towerH = 22
  const moduleH = 8
  const spireH = moduleH * 3

  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[-1.2, towerH / 2, 0]} castShadow receiveShadow material={material}>
        <boxGeometry args={[3, towerH, 3.2]} />
      </mesh>
      <mesh position={[1.2, towerH / 2, 0]} castShadow receiveShadow material={material}>
        <boxGeometry args={[3, towerH, 3.2]} />
      </mesh>
      <mesh position={[0, towerH * 0.62, 0]} castShadow receiveShadow material={material}>
        <boxGeometry args={[2.6, 1.4, 2.2]} />
      </mesh>
      <mesh position={[0, towerH + spireH / 2, 0]} castShadow receiveShadow material={material}>
        <cylinderGeometry args={[0.85, 1.15, spireH, 12]} />
      </mesh>
      <mesh position={[0, towerH + spireH + 1.4, 0]} castShadow>
        <coneGeometry args={[0.55, 2.8, 8]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.35} roughness={0.35} />
      </mesh>
    </group>
  )
}

/** Curved curtain wall massing (high-segment cylinder). */
export function StanbicBankTower({
  material,
  cx,
  cz,
}: {
  material: THREE.MeshStandardMaterial
  cx: number
  cz: number
}) {
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 13.5, 0]} castShadow receiveShadow material={material}>
        <cylinderGeometry args={[5.8, 5.8, 27, 64]} />
      </mesh>
      <mesh position={[0, 26.5, 0]} castShadow>
        <cylinderGeometry args={[5.2, 4.2, 2.2, 32]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} metalness={0.2} />
      </mesh>
    </group>
  )
}

function NSSFRoofSign({ y }: { y: number }) {
  const [map] = useState(createNSSFTexture)
  return (
    <mesh position={[0, y, 2.85]} rotation={[-0.1, 0, 0]}>
      <planeGeometry args={[6, 2.4]} />
      <meshBasicMaterial map={map} transparent toneMapped={false} />
    </mesh>
  )
}

/** Bright blue glass landmark (NSSF-style). */
export function NSSFGlassTower({ cx, cz }: { cx: number; cz: number }) {
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 10.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.2, 21, 4.8]} />
        <meshPhysicalMaterial
          color="#0284c7"
          metalness={0.93}
          roughness={0.1}
          transparent
          opacity={0.94}
          transmission={0.38}
          thickness={0.55}
          envMapIntensity={1.35}
        />
      </mesh>
      <mesh position={[-2.9, 9, 0.4]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[2.4, 17, 3.6]} />
        <meshPhysicalMaterial
          color="#0ea5e9"
          metalness={0.9}
          roughness={0.14}
          transmission={0.28}
          thickness={0.45}
          transparent
          opacity={0.92}
        />
      </mesh>
      <NSSFRoofSign y={22.2} />
    </group>
  )
}

function GenericCommercialBlock({
  wallColor,
  pitchedRoofMaterial,
  position,
  width,
  depth,
  stories,
  pitchedRoof,
  rotationY = 0,
}: {
  wallColor: string
  pitchedRoofMaterial: THREE.MeshStandardMaterial
  position: [number, number, number]
  width: number
  depth: number
  stories: 2 | 3
  pitchedRoof: boolean
  rotationY?: number
}) {
  const bodyH = stories === 2 ? 2.05 : 2.95
  const w = width
  const d = depth

  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wallColor,
        roughness: 0.64,
        metalness: 0.05,
      }),
    [wallColor],
  )

  const flatRoofMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wallColor,
        roughness: 0.82,
        metalness: 0.04,
      }),
    [wallColor],
  )

  const coneR = Math.hypot(w, d) * 0.42
  const coneH = 1.05

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh
        position={[0, bodyH / 2 + 0.04, 0]}
        castShadow
        receiveShadow
        material={wallMat}
      >
        <boxGeometry args={[w, bodyH, d]} />
      </mesh>
      {pitchedRoof ? (
        <mesh
          position={[0, bodyH + coneH * 0.48, 0]}
          scale={[w / (coneR * 2), 1, d / (coneR * 2)]}
          castShadow
          material={pitchedRoofMaterial}
        >
          <coneGeometry args={[coneR, coneH, 4, 1]} />
        </mesh>
      ) : (
        <mesh
          position={[0, bodyH + 0.08, 0]}
          castShadow
          material={flatRoofMat}
        >
          <boxGeometry args={[w * 1.04, 0.14, d * 1.04]} />
        </mesh>
      )}
    </group>
  )
}

function MidriseTextured({
  cx,
  cz,
  floors,
  footprint,
  bodyMaterial,
}: {
  cx: number
  cz: number
  floors: number
  footprint: [number, number]
  bodyMaterial: THREE.MeshStandardMaterial
}) {
  const [fw, fd] = footprint
  const h = floors * 0.95

  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, h / 2 + 0.04, 0]} castShadow receiveShadow material={bodyMaterial}>
        <boxGeometry args={[fw, h, fd]} />
      </mesh>
      {Array.from({ length: floors }, (_, f) => (
        <group key={f} position={[0, 0.5 + f * 0.95, fd / 2 + 0.02]}>
          {Array.from({ length: 6 }, (_, c) => (
            <mesh key={c} position={[(c - 2.5) * (fw / 6.2), 0, 0]}>
              <planeGeometry args={[0.32, 0.42]} />
              <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.2} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

type TreeProps = { x: number; z: number; scale?: number }

/** @react-three/drei does not include `<Tree />`; this is a dense tropical stand-in. */
export function Tree({ x, z, scale = 1 }: TreeProps) {
  const s = scale
  return (
    <group position={[x, 0, z]} scale={[s, s, s]}>
      <mesh position={[0, 1.15, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.22, 2.35, 8]} />
        <meshStandardMaterial color="#292524" roughness={0.92} />
      </mesh>
      <mesh position={[0, 3.05, 0]} castShadow>
        <icosahedronGeometry args={[1.45, 1]} />
        <meshStandardMaterial color="#0f3d24" roughness={0.9} metalness={0.02} />
      </mesh>
      <mesh position={[0.6, 3.35, 0.25]} castShadow>
        <icosahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color="#14532d" roughness={0.9} />
      </mesh>
      <mesh position={[-0.55, 3.1, -0.4]} castShadow>
        <icosahedronGeometry args={[0.75, 0]} />
        <meshStandardMaterial color="#166534" roughness={0.9} />
      </mesh>
      <mesh position={[0.2, 3.5, -0.55]} castShadow>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#0f3d24" roughness={0.9} />
      </mesh>
    </group>
  )
}

function Matatu({
  x,
  z,
  rotationY,
}: {
  x: number
  z: number
  rotationY: number
}) {
  return (
    <group position={[x, 0.52, z]} rotation={[0, rotationY, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[1.35, 1.1, 2.55]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.45} />
      </mesh>
      <mesh castShadow position={[0, 0.95, 0.15]}>
        <boxGeometry args={[1.2, 0.35, 1.35]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.45, 0.02]}>
        <boxGeometry args={[1.38, 0.18, 2.58]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[0.68, 0.35, 0]}>
        <boxGeometry args={[0.06, 0.45, 0.55]} />
        <meshStandardMaterial color="#171717" roughness={0.9} />
      </mesh>
    </group>
  )
}

function collectRoadSamples(): [number, number][] {
  const out: [number, number][] = []
  const span = CITY_TOTAL - ROAD_W
  const steps = 32
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const rx = roadStripCenterX(k)
    for (let s = 0; s < steps; s++) {
      const rz = CITY_START + ROAD_W / 2 + (s / (steps - 1)) * span
      out.push([rx, rz])
    }
  }
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const rz = roadStripCenterZ(k)
    for (let s = 0; s < steps; s++) {
      const rx = CITY_START + ROAD_W / 2 + (s / (steps - 1)) * span
      out.push([rx, rz])
    }
  }
  return out
}

function medianAndRoadsideTrees(): [number, number][] {
  const out: [number, number][] = []
  const span = CITY_TOTAL - ROAD_W
  const medianSteps = 10
  const edgeSteps = 16

  for (let k = 1; k < NUM_BLOCKS; k++) {
    const rx = roadStripCenterX(k)
    for (let s = 1; s < medianSteps; s++) {
      const t = s / medianSteps
      const rz = CITY_START + ROAD_W + t * (span - ROAD_W)
      if (rnd(k, s, 201) > 0.22) {
        out.push([rx + (rnd(k, s, 202) - 0.5) * 1.1, rz])
      }
    }
  }
  for (let k = 1; k < NUM_BLOCKS; k++) {
    const rz = roadStripCenterZ(k)
    for (let s = 1; s < medianSteps; s++) {
      const t = s / medianSteps
      const rx = CITY_START + ROAD_W + t * (span - ROAD_W)
      if (rnd(s, k, 203) > 0.22) {
        out.push([rx, rz + (rnd(s, k, 204) - 0.5) * 1.1])
      }
    }
  }

  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const rx = roadStripCenterX(k)
    for (let s = 0; s < edgeSteps; s++) {
      const rz = CITY_START + ROAD_W / 2 + (s / (edgeSteps - 1)) * span
      const off = ROAD_W * 0.32
      if (rnd(k + 50, s, 301) > 0.15) out.push([rx + off, rz + (rnd(k, s, 302) - 0.5)])
      if (rnd(k + 60, s, 303) > 0.15) out.push([rx - off, rz + (rnd(k, s, 304) - 0.5)])
    }
  }
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const rz = roadStripCenterZ(k)
    for (let s = 0; s < edgeSteps; s++) {
      const rx = CITY_START + ROAD_W / 2 + (s / (edgeSteps - 1)) * span
      const off = ROAD_W * 0.32
      if (rnd(k + 70, s, 401) > 0.15) out.push([rx + (rnd(k, s, 402) - 0.5), rz + off])
      if (rnd(k + 80, s, 403) > 0.15) out.push([rx + (rnd(k, s, 404) - 0.5), rz - off])
    }
  }

  return out
}

function CityMapContent() {
  const [mapeeraMap, stanbicMap] = useTexture(
    ['/textures/mapeera.jpg', '/textures/stanbic_bank.jpg'],
    (loaded) => {
      configureFacadeTexture(loaded[0])
      const st = loaded[1]
      st.wrapS = THREE.RepeatWrapping
      st.wrapT = THREE.ClampToEdgeWrapping
      st.repeat.set(5, 1)
      st.colorSpace = THREE.SRGBColorSpace
    },
  )

  const mapeeraMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: mapeeraMap,
        roughness: 0.4,
        metalness: 0.14,
      }),
    [mapeeraMap],
  )

  const stanbicMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: stanbicMap,
        roughness: 0.22,
        metalness: 0.52,
        envMapIntensity: 1.15,
      }),
    [stanbicMap],
  )

  const midriseMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ebe4d6',
        roughness: 0.58,
        metalness: 0.05,
      }),
    [],
  )

  const pitchedRoofMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#9a3412',
        roughness: 0.9,
        metalness: 0.02,
      }),
    [],
  )

  const asphaltTex = useMemo(() => createAsphaltRoadTexture(), [])
  const murramTex = useMemo(() => createMurramHazeTexture(), [])

  const roadAsphaltMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: asphaltTex,
        roughness: 0.93,
        metalness: 0.04,
      }),
    [asphaltTex],
  )

  const roadMurramMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: murramTex,
        roughness: 0.97,
        metalness: 0,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    [murramTex],
  )

  const [mx, mz] = LANDMARK_MAPEERA
  const [sx, sz] = LANDMARK_STANBIC
  const [nx, nz] = LANDMARK_NSSF

  const { retail, midrise, matatus, trees } = useMemo(() => {
    const retailList: ReactNode[] = []
    const midList: ReactNode[] = []

    for (let i = 0; i < NUM_BLOCKS; i++) {
      for (let j = 0; j < NUM_BLOCKS; j++) {
        const [bcx, bcz] = blockCenter(i, j)
        if (minDistToLandmark(bcx, bcz) < LANDMARK_BLOCK_SKIP) continue

        if (rnd(i, j, 17) < 0.1) {
          midList.push(
            <MidriseTextured
              key={`mid-${i}-${j}`}
              cx={bcx}
              cz={bcz}
              floors={8 + Math.floor(rnd(i, j, 18) * 4)}
              footprint={[6 + rnd(i, j, 19) * 3, 5 + rnd(i, j, 20) * 2]}
              bodyMaterial={midriseMat}
            />,
          )
          continue
        }

        const count = 1 + Math.floor(rnd(i, j, 1) * 3)
        for (let k = 0; k < count; k++) {
          const ox = (rnd(i, j, 20 + k) - 0.5) * (BLOCK - 5)
          const oz = (rnd(i, j, 30 + k) - 0.5) * (BLOCK - 5)
          const x = bcx + ox
          const z = bcz + oz
          if (minDistToLandmark(x, z) < LANDMARK_CLEARANCE) continue

          const w = 2.3 + rnd(i, j, 40 + k) * 2.1
          const d = 2.1 + rnd(i, j, 50 + k) * 1.7
          const wallColor =
            WALL_TONES[Math.floor(rnd(i, j, 60 + k) * WALL_TONES.length)]
          const stories = rnd(i, j, 80 + k) < 0.52 ? 2 : 3
          const pitchedRoof = rnd(i, j, 91 + k) < 0.5
          const rot = rnd(i, j, 90 + k) * Math.PI * 2

          retailList.push(
            <GenericCommercialBlock
              key={uuidv4()}
              wallColor={wallColor}
              pitchedRoofMaterial={pitchedRoofMat}
              position={[x, 0, z]}
              width={w}
              depth={d}
              stories={stories}
              pitchedRoof={pitchedRoof}
              rotationY={rot}
            />,
          )
        }
      }
    }

    const roadPts = collectRoadSamples().filter(
      ([rx, rz]) => minDistToLandmark(rx, rz) > 12,
    )
    const matatuCount = 28
    const mats: ReactNode[] = []
    const nRoad = roadPts.length
    for (let m = 0; m < matatuCount; m++) {
      const idx =
        nRoad > 0
          ? Math.min(
              Math.floor(rnd(99, m, 3) * nRoad),
              nRoad - 1,
            )
          : 0
      const [rx, rz] = nRoad > 0 ? roadPts[idx]! : [0, 0]
      const rot = rnd(m, 7, 11) < 0.5 ? 0 : Math.PI / 2
      mats.push(
        <Matatu
          key={uuidv4()}
          x={rx + (rnd(m, 2, 5) - 0.5) * 1.1}
          z={rz + (rnd(m, 4, 6) - 0.5) * 1.1}
          rotationY={rot}
        />,
      )
    }

    const treePts = medianAndRoadsideTrees()
    const treeNodes = treePts.map(([tx, tz], idx) => (
      <Tree
        key={`tr-${idx}`}
        x={tx}
        z={tz}
        scale={0.82 + rnd(idx, 1, 500) * 0.55}
      />
    ))

    return {
      retail: retailList,
      midrise: midList,
      matatus: mats,
      trees: treeNodes,
    }
  }, [midriseMat, pitchedRoofMat])

  const verticalRoads = useMemo(
    () =>
      Array.from({ length: NUM_BLOCKS + 1 }, (_, k) => (
        <group key={`rv-${k}`}>
          <mesh
            position={[roadStripCenterX(k), 0.03, 0]}
            receiveShadow
            material={roadAsphaltMat}
          >
            <boxGeometry args={[ROAD_W, 0.06, CITY_TOTAL]} />
          </mesh>
          <mesh
            position={[roadStripCenterX(k), 0.068, 0]}
            receiveShadow
            material={roadMurramMat}
          >
            <boxGeometry args={[ROAD_W * 0.94, 0.025, CITY_TOTAL * 0.99]} />
          </mesh>
        </group>
      )),
    [roadAsphaltMat, roadMurramMat],
  )

  const horizontalRoads = useMemo(
    () =>
      Array.from({ length: NUM_BLOCKS + 1 }, (_, k) => (
        <group key={`rh-${k}`}>
          <mesh
            position={[0, 0.03, roadStripCenterZ(k)]}
            receiveShadow
            material={roadAsphaltMat}
          >
            <boxGeometry args={[CITY_TOTAL, 0.06, ROAD_W]} />
          </mesh>
          <mesh
            position={[0, 0.068, roadStripCenterZ(k)]}
            receiveShadow
            material={roadMurramMat}
          >
            <boxGeometry args={[CITY_TOTAL * 0.99, 0.025, ROAD_W * 0.94]} />
          </mesh>
        </group>
      )),
    [roadAsphaltMat, roadMurramMat],
  )

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[CITY_TOTAL + 80, CITY_TOTAL + 80]} />
        <meshStandardMaterial color="#2a231e" roughness={0.94} metalness={0.02} />
      </mesh>

      {verticalRoads}
      {horizontalRoads}

      <gridHelper
        args={[CITY_TOTAL * 0.92, 40, '#5c4d42', '#3d342c']}
        position={[0, 0.048, 0]}
      />

      <MapeeraBuilding material={mapeeraMat} cx={mx} cz={mz} />
      <StanbicBankTower material={stanbicMat} cx={sx} cz={sz} />
      <NSSFGlassTower cx={nx} cz={nz} />

      {midrise}
      {retail}
      {trees}
      {matatus}
    </group>
  )
}

function CityMapFallback() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[CITY_TOTAL + 80, CITY_TOTAL + 80]} />
      <meshStandardMaterial color="#2a231e" roughness={0.92} />
    </mesh>
  )
}

export function CityMap() {
  return (
    <Suspense fallback={<CityMapFallback />}>
      <CityMapContent />
    </Suspense>
  )
}
