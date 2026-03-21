import { useTexture } from '@react-three/drei'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import type { ReactNode } from 'react'
import { Suspense, useMemo, useState } from 'react'
import * as THREE from 'three'
import { v4 as uuidv4 } from 'uuid'
import {
  BLOCK,
  CITY_TOTAL,
  NUM_BLOCKS,
  ROAD_W,
  blockCenter,
  roadStripCenterX,
  roadStripCenterZ,
} from '@game/cityGrid'
import {
  isGreenZone,
  isOnRoad,
  isValidBuildingPlot,
  minDistToRoadNetwork,
  SIDEWALK_WIDTH,
} from '@game/roadSpatial'
import { RoadNetwork } from './RoadNetwork'
import { RoadSign } from './RoadSign'
import { IntersectionTrafficPair } from './TrafficLight'

/** Past tarmac onto murram diagonal — poles sit on the road shoulder, not in the lane. */
const TRAFFIC_LIGHT_CORNER =
  ROAD_W / 2 + SIDEWALK_WIDTH * 0.55

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

/** East–west street names (along Z strips). */
const STREETS_EW = [
  'Jinja Rd',
  'Bombo Rd',
  'Gaba Rd',
  'Kololo Dr',
  'Nakivubo',
  'Buganda Rd',
  'Mukwano Rd',
  'Ntinda Rd',
  'Lugogo By',
  'Kira Rd',
] as const

/** North–south street names (along X strips). */
const STREETS_NS = [
  'Luwum St',
  'Parliament Ave',
  'Acacia Ave',
  'Nakasero',
  'Muyenga Rd',
  'Bukoto St',
  'Kisaasi Rd',
  'Mulago Rd',
  'Entebbe Expy',
  'Wandegeya',
] as const

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
}: {
  material: THREE.MeshStandardMaterial
}) {
  const towerH = 22
  const moduleH = 8
  const spireH = moduleH * 3

  return (
    <group>
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
}: {
  material: THREE.MeshStandardMaterial
}) {
  return (
    <group>
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
export function NSSFGlassTower() {
  return (
    <group>
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
  const topY = bodyH + 0.04 + (pitchedRoof ? coneH * 0.92 : 0.14)
  const colliderHalfY = topY / 2

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={position}
      rotation={[0, rotationY, 0]}
    >
      <group>
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
      <CuboidCollider args={[w / 2, colliderHalfY, d / 2]} position={[0, colliderHalfY, 0]} />
    </RigidBody>
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

  const meshCenterY = h / 2 + 0.04

  return (
    <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]}>
      <group>
        <mesh position={[0, meshCenterY, 0]} castShadow receiveShadow material={bodyMaterial}>
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
      <CuboidCollider
        args={[fw / 2, h / 2 + 0.02, fd / 2]}
        position={[0, meshCenterY, 0]}
      />
    </RigidBody>
  )
}

type TreeProps = { x: number; z: number; scale?: number }

/** @react-three/drei does not include `<Tree />`; this is a dense tropical stand-in. */
export function Tree({ x, z, scale = 1 }: TreeProps) {
  const s = scale
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      <group scale={[s, s, s]}>
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
      <CylinderCollider args={[1.65 * s, 0.42 * s]} position={[0, 1.65 * s, 0]} />
    </RigidBody>
  )
}

function ParkedCar({ x, z, rotationY }: { x: number; z: number; rotationY: number }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      <group>
        <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.9, 0.42, 1.7]} />
          <meshStandardMaterial color="#d1d5db" roughness={0.42} />
        </mesh>
        <mesh position={[0, 0.6, 0.1]} castShadow>
          <boxGeometry args={[0.7, 0.24, 0.95]} />
          <meshStandardMaterial color="#9ca3af" roughness={0.45} metalness={0.2} />
        </mesh>
      </group>
      <CuboidCollider args={[0.46, 0.32, 0.86]} position={[0, 0.36, 0]} />
    </RigidBody>
  )
}

function ParkingLot({
  x,
  z,
  rotationY,
  slots,
}: {
  x: number
  z: number
  rotationY: number
  slots: number
}) {
  const lotDepth = 3.2
  const lotWidth = slots * 1.2 + 1
  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[lotWidth, 0.08, lotDepth]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.95} />
      </mesh>
      {Array.from({ length: slots + 1 }, (_, i) => {
        const lx = -lotWidth / 2 + 0.5 + i * 1.2
        return (
          <mesh key={`line-${i}`} position={[lx, 0.09, 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.05, lotDepth - 0.45]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Trees only in block interiors, ≥5 units from road tarmac (green zone / sidewalk strip). */
function sampleGreenZoneTreePositions(): [number, number][] {
  const out: [number, number][] = []
  const hw = ROAD_W / 2
  const pad = SIDEWALK_WIDTH + 0.35

  for (let i = 0; i < NUM_BLOCKS; i++) {
    for (let j = 0; j < NUM_BLOCKS; j++) {
      const xMin = roadStripCenterX(i) + hw + pad
      const xMax = roadStripCenterX(i + 1) - hw - pad
      const zMin = roadStripCenterZ(j) + hw + pad
      const zMax = roadStripCenterZ(j + 1) - hw - pad
      if (xMax <= xMin + 0.5 || zMax <= zMin + 0.5) continue

      for (let t = 0; t < 6; t++) {
        const x = xMin + rnd(i, j, 700 + t) * (xMax - xMin)
        const z = zMin + rnd(i, j, 750 + t) * (zMax - zMin)
        if (isOnRoad(x, z)) continue
        if (!isGreenZone(x, z)) continue
        out.push([x, z])
      }
    }
  }
  return out
}

/** Corners of a horizontal box must stay off tarmac (centroid-only checks miss large rotated footprints). */
function footprintClearOfTarmac(
  cx: number,
  cz: number,
  halfW: number,
  halfD: number,
  rotationY: number,
  margin = 0.2,
): boolean {
  const c = Math.cos(rotationY)
  const s = Math.sin(rotationY)
  const corners: [number, number][] = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ]
  for (const [lx, lz] of corners) {
    const x = cx + c * lx + s * lz
    const z = cz - s * lx + c * lz
    if (isOnRoad(x, z)) return false
    if (minDistToRoadNetwork(x, z) < margin) return false
  }
  return true
}

/** Extra world units beyond `CITY_TOTAL` on the grass plane (half = border strip width). */
const GROUND_MARGIN = 80
const HALF_GROUND = (CITY_TOTAL + GROUND_MARGIN) / 2
/** One thin row at the outer rim (photo is a fence strip, not a tile). */
const FENCE_STRIP_DEPTH = 6.5

function CityMapContent() {
  const [mapeeraMap, stanbicMap, grassFieldMap, concreteMap, picketFenceMap] = useTexture(
    [
      '/textures/mapeera.jpg',
      '/textures/stanbic_bank.jpg',
      '/textures/grass-vector-seamless.jpg',
      '/textures/ground-concrete.jpg',
      '/textures/perimeter-picket-fence.jpg',
    ],
    (loaded) => {
      configureFacadeTexture(loaded[0])
      const st = loaded[1]
      st.wrapS = THREE.RepeatWrapping
      st.wrapT = THREE.ClampToEdgeWrapping
      st.repeat.set(5, 1)
      st.colorSpace = THREE.SRGBColorSpace
      const grass = loaded[2]
      grass.wrapS = grass.wrapT = THREE.RepeatWrapping
      grass.colorSpace = THREE.SRGBColorSpace
      const groundSpan = CITY_TOTAL + GROUND_MARGIN
      const tile = 14
      grass.repeat.set(groundSpan / tile, groundSpan / tile)
      grass.center.set(0.5, 0.5)
      grass.rotation = -Math.PI / 2
      const conc = loaded[3]
      conc.wrapS = conc.wrapT = THREE.RepeatWrapping
      conc.colorSpace = THREE.SRGBColorSpace
      conc.repeat.set(5, 5)
      const fence = loaded[4]
      fence.colorSpace = THREE.SRGBColorSpace
      fence.wrapS = THREE.RepeatWrapping
      fence.wrapT = THREE.ClampToEdgeWrapping
      fence.offset.set(0, 0.16)
      fence.repeat.set(groundSpan / 24, 0.58)
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

  const groundMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: grassFieldMap,
        color: '#ffffff',
        roughness: 0.94,
        metalness: 0.02,
      }),
    [grassFieldMap],
  )

  const concreteMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: concreteMap,
        color: '#ffffff',
        roughness: 0.9,
        metalness: 0.04,
      }),
    [concreteMap],
  )

  const picketFenceMapEW = useMemo(() => {
    const t = picketFenceMap.clone()
    t.wrapS = THREE.ClampToEdgeWrapping
    t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.offset.set(0.16, 0)
    t.repeat.set(0.58, (CITY_TOTAL + GROUND_MARGIN) / 24)
    t.needsUpdate = true
    return t
  }, [picketFenceMap])

  const perimeterMatNS = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: picketFenceMap,
        color: '#ffffff',
        roughness: 0.72,
        metalness: 0.06,
      }),
    [picketFenceMap],
  )

  const perimeterMatEW = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: picketFenceMapEW,
        color: '#ffffff',
        roughness: 0.72,
        metalness: 0.06,
      }),
    [picketFenceMapEW],
  )

  const concreteLots = useMemo(() => {
    const lots: { cx: number; cz: number; w: number; d: number }[] = []
    const hw = ROAD_W / 2
    const pad = SIDEWALK_WIDTH + 0.35
    for (let i = 0; i < NUM_BLOCKS; i++) {
      for (let j = 0; j < NUM_BLOCKS; j++) {
        if (rnd(i, j, 902) > 0.34) continue
        const [bcx, bcz] = blockCenter(i, j)
        if (minDistToLandmark(bcx, bcz) < LANDMARK_BLOCK_SKIP) continue
        const xMin = roadStripCenterX(i) + hw + pad
        const xMax = roadStripCenterX(i + 1) - hw - pad
        const zMin = roadStripCenterZ(j) + hw + pad
        const zMax = roadStripCenterZ(j + 1) - hw - pad
        if (xMax <= xMin + 1 || zMax <= zMin + 1) continue
        lots.push({
          cx: bcx,
          cz: bcz,
          w: xMax - xMin,
          d: zMax - zMin,
        })
      }
    }
    return lots
  }, [])

  const [mx, mz] = LANDMARK_MAPEERA
  const [sx, sz] = LANDMARK_STANBIC
  const [nx, nz] = LANDMARK_NSSF

  const { retail, midrise, trees, parkingLots, parkedCars } = useMemo(() => {
    const retailList: ReactNode[] = []
    const midList: ReactNode[] = []
    const lotList: ReactNode[] = []
    const carList: ReactNode[] = []

    for (let i = 0; i < NUM_BLOCKS; i++) {
      for (let j = 0; j < NUM_BLOCKS; j++) {
        const [bcx, bcz] = blockCenter(i, j)
        if (minDistToLandmark(bcx, bcz) < LANDMARK_BLOCK_SKIP) continue

        if (rnd(i, j, 17) < 0.1) {
          const fw = 6 + rnd(i, j, 19) * 3
          const fd = 5 + rnd(i, j, 20) * 2
          if (footprintClearOfTarmac(bcx, bcz, fw / 2, fd / 2, 0)) {
            const lotSlots = 2 + Math.floor(rnd(i, j, 301) * 2)
            const lotX = bcx + (rnd(i, j, 302) < 0.5 ? 6.4 : -6.4)
            const lotZ = bcz + (rnd(i, j, 303) - 0.5) * 3.2
            if (isValidBuildingPlot(lotX, lotZ, 2.2)) {
              const lotRot = rnd(i, j, 304) < 0.5 ? 0 : Math.PI / 2
              lotList.push(
                <ParkingLot
                  key={`lot-mid-${i}-${j}`}
                  x={lotX}
                  z={lotZ}
                  rotationY={lotRot}
                  slots={lotSlots}
                />,
              )
              for (let c = 0; c < lotSlots; c++) {
                if (rnd(i, j, 320 + c) < 0.15) continue
                const cx = lotX - (lotSlots - 1) * 0.6 + c * 1.2
                const cz = lotZ + (rnd(i, j, 330 + c) - 0.5) * 0.22
                carList.push(
                  <ParkedCar
                    key={`pc-mid-${i}-${j}-${c}`}
                    x={cx}
                    z={cz}
                    rotationY={lotRot}
                  />,
                )
              }
            }
            midList.push(
              <MidriseTextured
                key={`mid-${i}-${j}`}
                cx={bcx}
                cz={bcz}
                floors={8 + Math.floor(rnd(i, j, 18) * 4)}
                footprint={[fw, fd]}
                bodyMaterial={midriseMat}
              />,
            )
            continue
          }
        }

        const count = 1 + Math.floor(rnd(i, j, 1) * 3)
        for (let k = 0; k < count; k++) {
          const ox = (rnd(i, j, 20 + k) - 0.5) * (BLOCK - 5)
          const oz = (rnd(i, j, 30 + k) - 0.5) * (BLOCK - 5)
          const x = bcx + ox
          const z = bcz + oz
          if (minDistToLandmark(x, z) < LANDMARK_CLEARANCE) continue
          if (!isValidBuildingPlot(x, z)) continue

          const w = 2.3 + rnd(i, j, 40 + k) * 2.1
          const d = 2.1 + rnd(i, j, 50 + k) * 1.7
          const stories = rnd(i, j, 80 + k) < 0.52 ? 2 : 3
          const pitchedRoof = rnd(i, j, 91 + k) < 0.5
          const rot = rnd(i, j, 90 + k) * Math.PI * 2

          if (!footprintClearOfTarmac(x, z, w / 2, d / 2, rot)) continue

          const wallColor =
            WALL_TONES[Math.floor(rnd(i, j, 60 + k) * WALL_TONES.length)]

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

    const treePts = sampleGreenZoneTreePositions()
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
      trees: treeNodes,
      parkingLots: lotList,
      parkedCars: carList,
    }
  }, [midriseMat, pitchedRoofMat])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow material={groundMat}>
        <planeGeometry args={[CITY_TOTAL + GROUND_MARGIN, CITY_TOTAL + GROUND_MARGIN]} />
      </mesh>

      {concreteLots.map((lot, idx) => (
        <mesh
          key={`concrete-${idx}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[lot.cx, -0.009, lot.cz]}
          receiveShadow
          material={concreteMat}
        >
          <planeGeometry args={[lot.w * 0.88, lot.d * 0.88]} />
        </mesh>
      ))}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.006, HALF_GROUND - FENCE_STRIP_DEPTH / 2]}
        receiveShadow
        material={perimeterMatNS}
      >
        <planeGeometry args={[CITY_TOTAL + GROUND_MARGIN, FENCE_STRIP_DEPTH]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.006, -HALF_GROUND + FENCE_STRIP_DEPTH / 2]}
        receiveShadow
        material={perimeterMatNS}
      >
        <planeGeometry args={[CITY_TOTAL + GROUND_MARGIN, FENCE_STRIP_DEPTH]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[HALF_GROUND - FENCE_STRIP_DEPTH / 2, -0.006, 0]}
        receiveShadow
        material={perimeterMatEW}
      >
        <planeGeometry args={[FENCE_STRIP_DEPTH, CITY_TOTAL + GROUND_MARGIN]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-HALF_GROUND + FENCE_STRIP_DEPTH / 2, -0.006, 0]}
        receiveShadow
        material={perimeterMatEW}
      >
        <planeGeometry args={[FENCE_STRIP_DEPTH, CITY_TOTAL + GROUND_MARGIN]} />
      </mesh>

      <RoadNetwork />

      <group>
        {Array.from({ length: NUM_BLOCKS - 1 }, (_, ix) =>
          Array.from({ length: NUM_BLOCKS - 1 }, (_, iz) => (
            <IntersectionTrafficPair
              key={`tl-${ix}-${iz}`}
              x={roadStripCenterX(ix + 1)}
              z={roadStripCenterZ(iz + 1)}
              cornerOffset={TRAFFIC_LIGHT_CORNER}
            />
          )),
        )}
      </group>

      <group>
        {Array.from({ length: NUM_BLOCKS - 1 }, (_, ix) =>
          Array.from({ length: NUM_BLOCKS - 1 }, (_, iz) => {
            const cx = roadStripCenterX(ix + 1)
            const cz = roadStripCenterZ(iz + 1)
            const d = TRAFFIC_LIGHT_CORNER
            const si = ix + 1
            const sj = iz + 1
            const ew = STREETS_EW[sj % STREETS_EW.length]
            const ns = STREETS_NS[si % STREETS_NS.length]
            return (
              <group key={`rs-${ix}-${iz}`}>
                <RoadSign
                  x={cx + d}
                  z={cz - d}
                  rotationY={0}
                  streetName={ew}
                  crossStreet={ns}
                />
                <RoadSign
                  x={cx - d}
                  z={cz + d}
                  rotationY={Math.PI}
                  streetName={ew}
                  crossStreet={ns}
                />
              </group>
            )
          }),
        )}
      </group>

      <gridHelper
        args={[(CITY_TOTAL + GROUND_MARGIN) * 0.92, 40, '#4a4a4a', '#2a2a2a']}
        position={[0, 0.07, 0]}
      />

      <RigidBody type="fixed" position={[mx, 0, mz]} colliders={false}>
        <MapeeraBuilding material={mapeeraMat} />
        <CuboidCollider args={[3.4, 14, 3.2]} position={[0, 12, 0]} />
      </RigidBody>
      <RigidBody type="fixed" position={[sx, 0, sz]} colliders={false}>
        <StanbicBankTower material={stanbicMat} />
        <CylinderCollider args={[13.5, 5.85]} position={[0, 13.5, 0]} />
      </RigidBody>
      <RigidBody type="fixed" position={[nx, 0, nz]} colliders={false}>
        <NSSFGlassTower />
        <CuboidCollider args={[4.2, 11, 5]} position={[0, 11, 0]} />
      </RigidBody>

      {midrise}
      {retail}
      {trees}
      {parkingLots}
      {parkedCars}
    </group>
  )
}

function CityMapFallback() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[CITY_TOTAL + GROUND_MARGIN, CITY_TOTAL + GROUND_MARGIN]} />
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
