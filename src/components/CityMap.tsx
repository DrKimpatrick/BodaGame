import { useTexture } from '@react-three/drei'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import type { ReactNode } from 'react'
import { Suspense, useMemo, useState } from 'react'
import * as THREE from 'three'
import {
  BLOCK,
  CITY_START,
  ewHalf,
  nsHalf,
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
import { BuildingNameLabel } from './BuildingNameLabel'
import {
  CylinderCurtainPanels,
  GlassTowerMullions,
  MidriseWindowGrids,
  TowerFaceWindowGrid,
} from './BuildingFacadeWindows'
import { RoadNetwork } from './RoadNetwork'
import { StaticBatch } from './StaticBatch'
import { useSettingsStore } from '../store/useSettingsStore'
import { VIEW_SCALE } from './viewScale'
import { sceneStatus } from '../roadRules/world/telemetry'
import { ShopBuilding } from './realism/KampalaBuildings'
import { FLOOR_H, lotBounds, shopRowsForBlock, type ShopLot } from './realism/kampalaLots'
import { RealTree, StandingHuman } from './realism/Nature'
import { Roundabouts } from './realism/Roundabouts'
import { KampalaLandmarks } from './realism/Landmarks'
import { VehicleModel } from './realism/Vehicles'
import { BodaStages } from './realism/StreetLife'
import { CHANNEL, CHANNEL_BLOCKS, forcedShopEdges, isLandmarkBlock } from '../game/kampalaMap'
import { NakivuboChannel } from './realism/Channel'
import { ClockTowerFlyover } from './realism/Flyover'
import { grassTexture } from './realism/textures'
import { RoadSign } from './RoadSign'
import { STREETS_EW, STREETS_NS } from '../game/streetNames'
import { RoadSignage } from './roadRules/RoadSignage'
import { SignalHeads } from './roadRules/SignalHeads'

/** Past tarmac onto murram diagonal — poles sit on the road shoulder, not in the lane. */
/** Corner offset (beyond the road edge, on the pavement) for street-name posts. */
const CORNER_POST_OUT = SIDEWALK_WIDTH * 0.55 + 0.95

/** Block centers so landmark footprints stay off tarmac (scaled ±200 sat too close to road strips). */
const LANDMARK_MAPEERA: [number, number] = blockCenter(9, 9)
const LANDMARK_STANBIC: [number, number] = blockCenter(0, 9)
const LANDMARK_NSSF: [number, number] = blockCenter(9, 0)

const LANDMARK_CLEARANCE = 20
const LANDMARK_BLOCK_SKIP = 34

type NamedMidrise = {
  title: string
  subtitle?: string
  /** Photo texture on the street-facing (+Z) façade */
  facade?: 'acacia' | 'garden'
}

/** Fixed blocks that always spawn a midrise with a recognizable mall / hub name. */
const NAMED_MIDRISE_BLOCKS: Record<string, NamedMidrise> = {
  '4,5': { title: 'Acacia Mall', subtitle: 'Kampala', facade: 'acacia' },
  '9,3': { title: 'Garden City', subtitle: 'Mall', facade: 'garden' },
  '2,8': { title: 'Oasis Mall' },
}

function rnd(i: number, j: number, salt: number) {
  const t = Math.sin(i * 12.9898 + j * 78.233 + salt * 43.758) * 43758.5453123
  return t - Math.floor(t)
}

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

/** The city's grass, with openings for Nakivubo channel so it has real depth. UVs match a plain plane. */
function buildGroundGeometry() {
  const span = CITY_TOTAL + GROUND_MARGIN
  const half = span / 2
  const shape = new THREE.Shape([
    new THREE.Vector2(-half, -half),
    new THREE.Vector2(half, -half),
    new THREE.Vector2(half, half),
    new THREE.Vector2(-half, half),
  ])
  for (const { i, j } of CHANNEL_BLOCKS) {
    const [cx, cz] = blockCenter(i, j)
    const { halfLength: l, halfWidth: w } = CHANNEL
    // The mesh lies flat with rotation -90° about X, so world +Z is local -Y.
    shape.holes.push(
      new THREE.Path([
        new THREE.Vector2(cx - l, -cz - w),
        new THREE.Vector2(cx - l, -cz + w),
        new THREE.Vector2(cx + l, -cz + w),
        new THREE.Vector2(cx + l, -cz - w),
      ]),
    )
  }
  const geo = new THREE.ShapeGeometry(shape)
  const pos = geo.attributes.position!
  const uv = geo.attributes.uv!
  for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + half) / span, (pos.getY(k) + half) / span)
  return geo
}

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
      <group position={[-1.2, towerH / 2, 0]}>
        <mesh castShadow receiveShadow material={material}>
          <boxGeometry args={[3, towerH, 3.2]} />
        </mesh>
        <TowerFaceWindowGrid towerH={towerH} halfW={1.48} halfD={1.62} />
      </group>
      <group position={[1.2, towerH / 2, 0]}>
        <mesh castShadow receiveShadow material={material}>
          <boxGeometry args={[3, towerH, 3.2]} />
        </mesh>
        <TowerFaceWindowGrid towerH={towerH} halfW={1.48} halfD={1.62} />
      </group>
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
      <CylinderCurtainPanels radius={5.8} centerY={13.5} height={27} segments={24} />
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
      <GlassTowerMullions width={5.2} height={21} depth={4.8} centerY={10.5} />
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

const midriseDetailMats = {
  slab: new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.85 }),
  podiumGlass: new THREE.MeshStandardMaterial({ color: '#33475b', roughness: 0.1, metalness: 0.7 }),
  tank: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.55 }),
  aerial: new THREE.MeshStandardMaterial({ color: '#9ca3af', roughness: 0.4, metalness: 0.8 }),
}

/**
 * Kampala office-block detail on a mid-rise: glazed shopfront podium, a slab band at every floor, roof
 * parapet with black water tanks and an aerial. Static (batched).
 */
function MidriseDetails({ w, d, h, floors, seed }: { w: number; d: number; h: number; floors: number; seed: number }) {
  const sign = Math.abs(seed)
  return (
    <group>
      {/* Podium: dark glass shopfronts on all four sides, with a signboard band */}
      <mesh position={[0, 1.6, 0]} material={midriseDetailMats.podiumGlass}>
        <boxGeometry args={[w + 0.06, 2.6, d + 0.06]} />
      </mesh>
      <mesh position={[0, 3.25, 0]} material={midriseDetailMats.slab} castShadow>
        <boxGeometry args={[w + 0.6, 0.35, d + 0.6]} />
      </mesh>
      {/* Floor slab bands */}
      {Array.from({ length: Math.max(0, floors - 1) }, (_, f) => (
        <mesh key={f} position={[0, (f + 1) * FLOOR_H + 0.05, 0]} material={midriseDetailMats.slab}>
          <boxGeometry args={[w + 0.25, 0.18, d + 0.25]} />
        </mesh>
      ))}
      {/* Roof parapet, tanks and aerial */}
      <mesh position={[0, h + 0.45, 0]} material={midriseDetailMats.slab}>
        <boxGeometry args={[w + 0.1, 0.9, d + 0.1]} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (w / 4), h + 1.6, -d / 4]} material={midriseDetailMats.tank} castShadow>
          <cylinderGeometry args={[0.8, 0.8, 1.8, 14]} />
        </mesh>
      ))}
      <mesh position={[w / 3, h + 3.5, d / 4]} material={midriseDetailMats.aerial}>
        <cylinderGeometry args={[0.05, 0.08, 6 + (sign % 4), 6]} />
      </mesh>
    </group>
  )
}

function MidriseTextured({
  cx,
  cz,
  floors,
  footprint,
  bodyMaterial,
  roofLabel,
  facadeMaterial,
}: {
  cx: number
  cz: number
  floors: number
  footprint: [number, number]
  bodyMaterial: THREE.MeshStandardMaterial
  roofLabel?: NamedMidrise
  /** Optional photo on the box +Z face (material index 4 on BoxGeometry). */
  facadeMaterial?: THREE.MeshBasicMaterial
}) {
  const [fw, fd] = footprint
  const h = floors * FLOOR_H

  const meshCenterY = h / 2 + 0.04
  const labelW = Math.min(Math.max(fw * 0.92, 5.2), 11)

  /**
   * Box face order: +X, -X, +Y, -Y, +Z, -Z.
   * Same photo on both Z faces so it reads from either side of the block.
   */
  const boxMaterials = useMemo(() => {
    if (!facadeMaterial) return bodyMaterial
    return [
      bodyMaterial,
      bodyMaterial,
      bodyMaterial,
      bodyMaterial,
      facadeMaterial,
      facadeMaterial,
    ] as THREE.Material[]
  }, [bodyMaterial, facadeMaterial])

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[cx, 0, cz]}
      userData={{ kind: 'building' }}
    >
      <group>
        <mesh position={[0, meshCenterY, 0]} castShadow receiveShadow material={boxMaterials}>
          <boxGeometry args={[fw, h, fd]} />
        </mesh>
        <MidriseWindowGrids
          footprintW={fw}
          footprintD={fd}
          totalHeight={h}
          floors={floors}
          meshCenterY={meshCenterY}
          skipZFaces={Boolean(facadeMaterial)}
        />
        <MidriseDetails w={fw} d={fd} h={h} floors={floors} seed={Math.round(cx * 3 + cz * 7)} />
        {roofLabel ? (
          <BuildingNameLabel
            position={[0, h + 0.55, 0]}
            title={roofLabel.title}
            subtitle={roofLabel.subtitle}
            width={labelW}
          />
        ) : null}
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


/** Parked car: the same real-scale models as traffic (saloons, SUVs, pickups, vans). */
const PARKED_KINDS = ['sedan', 'sedan', 'suv', 'pickup', 'van'] as const
function ParkedCar({ x, z, rotationY }: { x: number; z: number; rotationY: number }) {
  const h = Math.abs(Math.floor(x * 7.3 + z * 3.1))
  // Phones get emptier car parks (each car is ~1.5k triangles).
  if (useSettingsStore.getState().quality === 'low' && h % 5 < 3) return null
  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      <VehicleModel kind={PARKED_KINDS[h % PARKED_KINDS.length]!} seed={h} />
    </group>
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
  const pad = SIDEWALK_WIDTH + 0.35

  for (let i = 0; i < NUM_BLOCKS; i++) {
    for (let j = 0; j < NUM_BLOCKS; j++) {
      const xMin = roadStripCenterX(i) + nsHalf(i) + pad
      const xMax = roadStripCenterX(i + 1) - nsHalf(i + 1) - pad
      const zMin = roadStripCenterZ(j) + ewHalf(j) + pad
      const zMax = roadStripCenterZ(j + 1) - ewHalf(j + 1) - pad
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
  const [
    mapeeraMap,
    stanbicMap,
    concreteMap,
    picketFenceMap,
    acaciaMallMap,
    gardenCityMap,
  ] = useTexture(
    [
      '/textures/mapeera.jpg',
      '/textures/stanbic_bank.jpg',
      '/textures/ground-concrete.jpg',
      '/textures/perimeter-picket-fence.jpg',
      '/textures/Acacia-Mall-1.jpg',
      '/textures/garden-city.jpg',
    ],
    (loaded) => {
      configureFacadeTexture(loaded[0])
      const st = loaded[1]
      st.wrapS = THREE.RepeatWrapping
      st.wrapT = THREE.ClampToEdgeWrapping
      st.repeat.set(5, 1)
      st.colorSpace = THREE.SRGBColorSpace
      const groundSpan = CITY_TOTAL + GROUND_MARGIN
      const conc = loaded[2]
      conc.wrapS = conc.wrapT = THREE.RepeatWrapping
      conc.colorSpace = THREE.SRGBColorSpace
      conc.repeat.set(5, 5)
      const fence = loaded[3]
      fence.colorSpace = THREE.SRGBColorSpace
      fence.wrapS = THREE.RepeatWrapping
      fence.wrapT = THREE.ClampToEdgeWrapping
      fence.offset.set(0, 0.16)
      fence.repeat.set(groundSpan / 24, 0.58)
      for (const idx of [4, 5]) {
        const mall = loaded[idx]
        mall.wrapS = mall.wrapT = THREE.ClampToEdgeWrapping
        mall.colorSpace = THREE.SRGBColorSpace
        mall.needsUpdate = true
      }
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

  /** Basic + unlit so photos read clearly (standard materials were easy to miss in shadow / angle). */
  const mallFacadeMats = useMemo(
    () => ({
      acacia: new THREE.MeshBasicMaterial({
        map: acaciaMallMap,
        toneMapped: false,
      }),
      garden: new THREE.MeshBasicMaterial({
        map: gardenCityMap,
        toneMapped: false,
      }),
    }),
    [acaciaMallMap, gardenCityMap],
  )

  const groundGeo = useMemo(() => buildGroundGeometry(), [])

  const groundMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: (() => {
          const t = grassTexture().clone()
          const span = CITY_TOTAL + GROUND_MARGIN
          t.repeat.set(span / 9, span / 9)
          t.needsUpdate = true
          return t
        })(),
        color: '#ffffff',
        roughness: 0.94,
        metalness: 0.02,
      }),
    [],
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
    const pad = SIDEWALK_WIDTH + 0.35
    for (let i = 0; i < NUM_BLOCKS; i++) {
      for (let j = 0; j < NUM_BLOCKS; j++) {
        if (rnd(i, j, 902) > 0.34) continue
        const [bcx, bcz] = blockCenter(i, j)
        if (minDistToLandmark(bcx, bcz) < LANDMARK_BLOCK_SKIP || isLandmarkBlock(i, j)) continue
        const xMin = roadStripCenterX(i) + nsHalf(i) + pad
        const xMax = roadStripCenterX(i + 1) - nsHalf(i + 1) - pad
        const zMin = roadStripCenterZ(j) + ewHalf(j) + pad
        const zMax = roadStripCenterZ(j + 1) - ewHalf(j + 1) - pad
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

  const { retail, midrise, trees, parkingLots, parkedCars, parkingStanders } = useMemo(() => {
    const retailList: ReactNode[] = []
    const shopLots: ShopLot[] = []
    const midList: ReactNode[] = []
    const lotList: ReactNode[] = []
    const carList: ReactNode[] = []
    const standList: ReactNode[] = []

    for (let i = 0; i < NUM_BLOCKS; i++) {
      for (let j = 0; j < NUM_BLOCKS; j++) {
        const [bcx, bcz] = blockCenter(i, j)
        if (forcedShopEdges(i, j)) {
          for (const lot of shopRowsForBlock(i, j)) {
            shopLots.push(lot)
            retailList.push(<ShopBuilding key={lot.key} lot={lot} />)
          }
          continue
        }
        if (minDistToLandmark(bcx, bcz) < LANDMARK_BLOCK_SKIP || isLandmarkBlock(i, j)) continue

        const namedMid = NAMED_MIDRISE_BLOCKS[`${i},${j}`]
        if (rnd(i, j, 17) < 0.1 || namedMid) {
          const fw = 10 + rnd(i, j, 19) * 4
          const fd = 9 + rnd(i, j, 20) * 3
          if (footprintClearOfTarmac(bcx, bcz, fw / 2, fd / 2, 0)) {
            const lotSlots = 3 + Math.floor(rnd(i, j, 301) * 3)
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
                if (rnd(i, j, 320 + c) < 0.05) continue
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
              for (let c = 0; c < lotSlots; c++) {
                if (rnd(i, j, 420 + c) < 0.12) continue
                const cx1 = lotX - (lotSlots - 1) * 0.6 + c * 1.2
                const cz1 = lotZ + (rnd(i, j, 430 + c) - 0.5) * 0.22
                const cx2 = cx1 + Math.sin(lotRot) * 2.35
                const cz2 = cz1 - Math.cos(lotRot) * 2.35
                carList.push(
                  <ParkedCar
                    key={`pc-mid2-${i}-${j}-${c}`}
                    x={cx2}
                    z={cz2}
                    rotationY={lotRot}
                  />,
                )
              }
              for (let s = 0; s < 4; s++) {
                if (rnd(i, j, 440 + s) > 0.38) continue
                const ang = lotRot + (rnd(i, j, 450 + s) - 0.5) * 0.5
                const sx = lotX + Math.cos(ang) * (1.9 + s * 0.35)
                const sz = lotZ + Math.sin(ang) * (1.9 + s * 0.35)
                standList.push(
                  <StandingHuman
                    key={`st-mid-${i}-${j}-${s}`}
                    x={sx}
                    z={sz}
                    rotationY={lotRot + Math.PI / 2}
                    seed={i * 7 + j * 3 + s}
                  />,
                )
              }
            }
            const midFloors = 5 + Math.floor(rnd(i, j, 18) * 4)

            midList.push(
              <group key={`mid-${i}-${j}`}>
                <MidriseTextured
                  cx={bcx}
                  cz={bcz}
                  floors={midFloors}
                  footprint={[fw, fd]}
                  bodyMaterial={midriseMat}
                  roofLabel={namedMid}
                  facadeMaterial={
                    namedMid?.facade ? mallFacadeMats[namedMid.facade] : undefined
                  }
                />
              </group>,
            )
            continue
          }
        }

        // Street-facing Kampala shop rows (concrete car-park blocks are left to the car park).
        if (rnd(i, j, 902) <= 0.34) continue
        for (const lot of shopRowsForBlock(i, j)) {
          if (minDistToLandmark(lot.x, lot.z) < LANDMARK_CLEARANCE) continue
          shopLots.push(lot)
          retailList.push(<ShopBuilding key={lot.key} lot={lot} />)
        }
      }
    }

    const bounds = shopLots.map(lotBounds)
    const clearOfShops = (x: number, z: number) =>
      !bounds.some((b) => x > b.minX - 1.6 && x < b.maxX + 1.6 && z > b.minZ - 1.6 && z < b.maxZ + 1.6)
    const blockOf = (c: number) => Math.floor((c - CITY_START - ROAD_W) / (BLOCK + ROAD_W))
    const treePts = sampleGreenZoneTreePositions().filter(
      ([tx, tz], k) =>
        // Thinned for the bigger city (fewer on phones): a share of green-zone spots get a tree.
        rnd(k, 3, 510) < TREE_SHARE[useSettingsStore.getState().quality] && clearOfShops(tx, tz) && !isLandmarkBlock(blockOf(tx), blockOf(tz)),
    )
    const treeNodes = treePts.map(([tx, tz], idx) => (
      <RealTree key={`tr-${idx}`} x={tx} z={tz} seed={idx} scale={0.85 + rnd(idx, 1, 500) * 0.5} />
    ))

    return {
      retail: retailList,
      midrise: midList,
      trees: treeNodes,
      parkingLots: lotList,
      parkedCars: carList,
      parkingStanders: standList,
    }
  }, [midriseMat, mallFacadeMats])

  const concreteLotDecor = useMemo(() => {
    const nodes: ReactNode[] = []
    concreteLots.forEach((lot, idx) => {
      const hw = lot.w * 0.88 * 0.5
      const hd = lot.d * 0.88 * 0.5
      const cols = Math.min(5, Math.max(2, Math.floor(hw / 1.15)))
      const rows = Math.min(4, Math.max(2, Math.floor(hd / 2.05)))
      let carN = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rnd(idx, r * 31 + c, 9600) > 0.48) continue
          const lx = ((c + 0.5) / cols - 0.5) * 2 * hw * 0.92
          const lz = ((r + 0.5) / rows - 0.5) * 2 * hd * 0.92
          const px = lot.cx + lx
          const pz = lot.cz + lz
          if (!isValidBuildingPlot(px, pz, 1.0)) continue
          nodes.push(
            <ParkedCar
              key={`pc-conc-${idx}-${carN}`}
              x={px}
              z={pz}
              rotationY={rnd(idx, carN, 9610) * Math.PI * 2}
            />,
          )
          carN++
        }
      }
      for (let s = 0; s < 6; s++) {
        if (rnd(idx, s, 9700) > 0.44) continue
        const px = lot.cx + (rnd(idx, s, 9710) - 0.5) * hw * 1.75
        const pz = lot.cz + (rnd(idx, s, 9720) - 0.5) * hd * 1.75
        if (!isValidBuildingPlot(px, pz, 0.45)) continue
        nodes.push(
          <StandingHuman
            key={`st-conc-${idx}-${s}`}
            x={px}
            z={pz}
            rotationY={rnd(idx, s, 9730) * Math.PI * 2}
            seed={idx * 3 + s}
          />,
        )
      }
    })
    return nodes
  }, [concreteLots])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow material={groundMat} geometry={groundGeo} />

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
      {/* City boundary: invisible walls along the perimeter fence so riders can't leave the map. */}
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
        {[
          [0, HALF_GROUND - FENCE_STRIP_DEPTH, HALF_GROUND, 1],
          [0, -HALF_GROUND + FENCE_STRIP_DEPTH, HALF_GROUND, 1],
          [HALF_GROUND - FENCE_STRIP_DEPTH, 0, 1, HALF_GROUND],
          [-HALF_GROUND + FENCE_STRIP_DEPTH, 0, 1, HALF_GROUND],
        ].map(([x, z, hx, hz], k) => (
          <CuboidCollider key={k} args={[hx!, 3, hz!]} position={[x!, 3, z!]} />
        ))}
      </RigidBody>

      <SignalHeads />
      <RoadSignage />
      <Roundabouts />
      <KampalaLandmarks />
      <NakivuboChannel />
      <ClockTowerFlyover />
      <BodaStages />

      <group>
        {Array.from({ length: NUM_BLOCKS - 1 }, (_, ix) =>
          Array.from({ length: NUM_BLOCKS - 1 }, (_, iz) => {
            const cx = roadStripCenterX(ix + 1)
            const cz = roadStripCenterZ(iz + 1)
            // Street-name poles sit outside the signal / sign poles on the same corner.
            const dx = nsHalf(ix + 1) + CORNER_POST_OUT
            const dz = ewHalf(iz + 1) + CORNER_POST_OUT
            const si = ix + 1
            const sj = iz + 1
            const ew = STREETS_EW[sj % STREETS_EW.length]
            const ns = STREETS_NS[si % STREETS_NS.length]
            return (
              <group key={`rs-${ix}-${iz}`}>
                <RoadSign
                  x={cx + dx}
                  z={cz - dz}
                  rotationY={0}
                  streetName={ew}
                  crossStreet={ns}
                />
                <RoadSign
                  x={cx - dx}
                  z={cz + dz}
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

      <RigidBody
        type="fixed"
        position={[mx, 0, mz]}
        colliders={false}
        userData={{ kind: 'building' }}
      >
        <MapeeraBuilding material={mapeeraMat} />
        <CuboidCollider args={[3.4, 14, 3.2]} position={[0, 12, 0]} />
      </RigidBody>
      <RigidBody
        type="fixed"
        position={[sx, 0, sz]}
        colliders={false}
        userData={{ kind: 'building' }}
      >
        <StanbicBankTower material={stanbicMat} />
        <CylinderCollider args={[13.5, 5.85]} position={[0, 13.5, 0]} />
      </RigidBody>
      <RigidBody
        type="fixed"
        position={[nx, 0, nz]}
        colliders={false}
        userData={{ kind: 'building' }}
      >
        <NSSFGlassTower />
        <CuboidCollider args={[4.2, 11, 5]} position={[0, 11, 0]} />
      </RigidBody>

      <BuildingNameLabel
        position={[mx, 50, mz]}
        title="Centenary Tower"
        subtitle="Mapeera House"
        width={10}
      />
      <BuildingNameLabel
        position={[sx, 28.5, sz]}
        title="Stanbic Tower"
        subtitle="Kampala"
        width={9}
      />
      <BuildingNameLabel
        position={[nx, 23.5, nz]}
        title="NSSF Tower"
        subtitle="Workers House"
        width={8}
      />

      {midrise}
      {retail}
      {trees}
      {parkingLots}
      {parkedCars}
      {parkingStanders}
      {concreteLotDecor}
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

/** Beyond this the clear-day fog has swallowed the streets; batch cells farther away aren't drawn. */
const CITY_CULL_DISTANCE = 560
/** Share of possible tree spots planted, per graphics setting. */
const TREE_SHARE = { low: 0.22, medium: 0.33, high: 0.45 } as const

const markCityBuilt = () => {
  sceneStatus.cityBuilt = true
}

export function CityMap() {
  const quality = useSettingsStore((s) => s.quality)
  return (
    <Suspense fallback={<CityMapFallback />}>
      <StaticBatch onBuilt={markCityBuilt} cullDistance={CITY_CULL_DISTANCE * VIEW_SCALE[quality]}>
        <CityMapContent />
      </StaticBatch>
    </Suspense>
  )
}
