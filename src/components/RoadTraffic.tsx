import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  type RapierRigidBody,
  RigidBody,
  useRapier,
} from '@react-three/rapier'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CITY_START, CITY_TOTAL, NUM_BLOCKS, roadStripCenterX, roadStripCenterZ } from '@game/cityGrid'
import { segmentRandom } from '@game/roadDecorPlacements'

const X0 = CITY_START
const Z0 = CITY_START
const X1 = CITY_START + CITY_TOTAL
const Z1 = CITY_START + CITY_TOTAL
const EDGE = 3.5
/** Extra meters past city edge so respawns are off-screen / in fog before they drive in. */
const SPAWN_BEYOND = 64
const IZ_EPS = 0.2
const LANE = 0.58
/** Offset from strip center; all traffic stays on this one side (never ±LANE split). */
const ROAD_SIDE_V = LANE
const ROAD_SIDE_H = LANE
/** Two logical slots per strip (same road side, staggered along the road). */
const LANES_PER_STRIP = 2

function flatOccV(vi: number, laneSlot: number): number {
  return vi * LANES_PER_STRIP + laneSlot
}
function flatOccH(hj: number, laneSlot: number): number {
  return hj * LANES_PER_STRIP + laneSlot
}
function firstFreeV(occV: boolean[], vi: number): number | null {
  const b = flatOccV(vi, 0)
  for (let l = 0; l < LANES_PER_STRIP; l++) {
    if (!occV[b + l]) return l
  }
  return null
}
function firstFreeH(occH: boolean[], hj: number): number | null {
  const b = flatOccH(hj, 0)
  for (let l = 0; l < LANES_PER_STRIP; l++) {
    if (!occH[b + l]) return l
  }
  return null
}

export type VehicleKind =
  | 'taxi'
  | 'trailer'
  | 'pickup'
  | 'bus'
  | 'bicycle'
  | 'motorbike'
  | 'sedan'
  | 'van'
  | 'suv'
  | 'matatu'

type Heading = 'N' | 'S' | 'E' | 'W'

type Agent = {
  kind: VehicleKind
  speed: number
  mode: 'v' | 'h'
  vi: number
  hj: number
  laneV: number
  laneH: number
  heading: Heading
  x: number
  z: number
  /** Occupancy slot: flat index into occV / occH (strip × lane). */
  slot: { t: 'v' | 'h'; idx: number }
}

function pickKind(salt: number): VehicleKind {
  const r = segmentRandom(salt, salt >> 3, 701)
  if (r < 0.06) return 'bus'
  if (r < 0.11) return 'trailer'
  if (r < 0.18) return 'pickup'
  if (r < 0.26) return 'taxi'
  if (r < 0.32) return 'matatu'
  if (r < 0.4) return 'van'
  if (r < 0.5) return 'suv'
  if (r < 0.6) return 'sedan'
  if (r < 0.72) return 'bicycle'
  if (r < 0.84) return 'motorbike'
  if (r < 0.92) return 'taxi'
  return 'sedan'
}

function pickSpeed(kind: VehicleKind, salt: number): number {
  const r = segmentRandom(salt, salt >> 5, 702)
  switch (kind) {
    case 'bus':
      return 4.2 + r * 2.8
    case 'trailer':
      return 3.6 + r * 2.4
    case 'pickup':
      return 7.5 + r * 4.2
    case 'taxi':
      return 10.5 + r * 6
    case 'bicycle':
      return 3 + r * 3.2
    case 'motorbike':
      return 12 + r * 7
    case 'sedan':
      return 9.5 + r * 5.5
    case 'van':
      return 5.8 + r * 3.4
    case 'suv':
      return 8 + r * 4.5
    case 'matatu':
      return 5.5 + r * 3.2
    default:
      return 9 + r * 4
  }
}

function headingToYaw(h: Heading): number {
  switch (h) {
    case 'N':
      return 0
    case 'S':
      return Math.PI
    case 'E':
      return -Math.PI / 2
    case 'W':
      return Math.PI / 2
    default:
      return 0
  }
}

/** Approach into intersection: where we came from (opposite of motion). */
function approachFrom(heading: Heading): 'fromS' | 'fromN' | 'fromW' | 'fromE' {
  switch (heading) {
    case 'N':
      return 'fromS'
    case 'S':
      return 'fromN'
    case 'E':
      return 'fromW'
    case 'W':
      return 'fromE'
  }
}

function pickNextAtIntersection(
  a: Agent,
  viNode: number,
  jNode: number,
  occV: boolean[],
  occH: boolean[],
  rng: () => number,
): void {
  const from = approachFrom(a.heading)
  const cx = roadStripCenterX(viNode)
  const cz = roadStripCenterZ(jNode)

  type Opt = { w: number; go: () => void }
  const opts: Opt[] = []

  const releaseOld = () => {
    if (a.slot.t === 'v') occV[a.slot.idx] = false
    else occH[a.slot.idx] = false
  }
  const claimV = (viStrip: number, laneSlot: number) => {
    releaseOld()
    const idx = flatOccV(viStrip, laneSlot)
    occV[idx] = true
    a.slot = { t: 'v', idx }
    a.mode = 'v'
    a.vi = viStrip
  }
  const claimH = (hjStrip: number, laneSlot: number) => {
    releaseOld()
    const idx = flatOccH(hjStrip, laneSlot)
    occH[idx] = true
    a.slot = { t: 'h', idx }
    a.mode = 'h'
    a.hj = hjStrip
  }

  if (a.mode === 'v') {
    const vi = viNode
    const j = jNode
    if (from === 'fromS') {
      if (j < NUM_BLOCKS)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'N'
            a.laneV = a.laneV * 0.8 + ROAD_SIDE_V * 0.2
            a.x = cx + a.laneV
            a.z = cz
          },
        })
      if (vi > 0) {
        const lH = firstFreeH(occH, j)
        if (lH !== null)
          opts.push({
            w: 0.32,
            go: () => {
              claimH(j, lH)
              a.heading = 'W'
              a.laneH = ROAD_SIDE_H
              a.x = cx
              a.z = cz + a.laneH
            },
          })
      }
      if (vi < NUM_BLOCKS) {
        const lH = firstFreeH(occH, j)
        if (lH !== null)
          opts.push({
            w: 0.32,
            go: () => {
              claimH(j, lH)
              a.heading = 'E'
              a.laneH = ROAD_SIDE_H
              a.x = cx
              a.z = cz + a.laneH
            },
          })
      }
    } else {
      if (j > 0)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'S'
            a.laneV = a.laneV * 0.8 + ROAD_SIDE_V * 0.2
            a.x = cx + a.laneV
            a.z = cz
          },
        })
      if (vi < NUM_BLOCKS) {
        const lH = firstFreeH(occH, j)
        if (lH !== null)
          opts.push({
            w: 0.32,
            go: () => {
              claimH(j, lH)
              a.heading = 'E'
              a.laneH = ROAD_SIDE_H
              a.x = cx
              a.z = cz + a.laneH
            },
          })
      }
      if (vi > 0) {
        const lH = firstFreeH(occH, j)
        if (lH !== null)
          opts.push({
            w: 0.32,
            go: () => {
              claimH(j, lH)
              a.heading = 'W'
              a.laneH = ROAD_SIDE_H
              a.x = cx
              a.z = cz + a.laneH
            },
          })
      }
    }
  } else {
    const hj = jNode
    const vi = viNode
    const cz0 = roadStripCenterZ(hj)
    if (from === 'fromW') {
      if (vi < NUM_BLOCKS)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'E'
            a.laneH = a.laneH * 0.8 + ROAD_SIDE_H * 0.2
            a.x = cx
            a.z = cz0 + a.laneH
          },
        })
      if (hj < NUM_BLOCKS) {
        const lV = firstFreeV(occV, vi)
        if (lV !== null)
          opts.push({
            w: 0.32,
            go: () => {
              claimV(vi, lV)
              a.heading = 'N'
              a.laneV = ROAD_SIDE_V
              a.x = roadStripCenterX(vi) + a.laneV
              a.z = cz0
            },
          })
      }
      if (hj > 0) {
        const lV = firstFreeV(occV, vi)
        if (lV !== null)
          opts.push({
            w: 0.32,
            go: () => {
              claimV(vi, lV)
              a.heading = 'S'
              a.laneV = ROAD_SIDE_V
              a.x = roadStripCenterX(vi) + a.laneV
              a.z = cz0
            },
          })
      }
    } else {
      if (vi > 0)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'W'
            a.laneH = a.laneH * 0.8 + ROAD_SIDE_H * 0.2
            a.x = cx
            a.z = cz0 + a.laneH
          },
        })
      if (hj < NUM_BLOCKS) {
        const lV = firstFreeV(occV, vi)
        if (lV !== null)
          opts.push({
            w: 0.32,
            go: () => {
              claimV(vi, lV)
              a.heading = 'N'
              a.laneV = ROAD_SIDE_V
              a.x = roadStripCenterX(vi) + a.laneV
              a.z = cz0
            },
          })
      }
      if (hj > 0) {
        const lV = firstFreeV(occV, vi)
        if (lV !== null)
          opts.push({
            w: 0.32,
            go: () => {
              claimV(vi, lV)
              a.heading = 'S'
              a.laneV = ROAD_SIDE_V
              a.x = roadStripCenterX(vi) + a.laneV
              a.z = cz0
            },
          })
      }
    }
  }

  if (opts.length === 0) {
    const cxu = roadStripCenterX(viNode)
    const czu = roadStripCenterZ(jNode)
    if (a.mode === 'v') {
      a.heading = a.heading === 'N' ? 'S' : 'N'
      a.laneV = ROAD_SIDE_V
      a.x = cxu + a.laneV
      a.z = czu
    } else {
      const czh = roadStripCenterZ(jNode)
      a.heading = a.heading === 'E' ? 'W' : 'E'
      a.laneH = ROAD_SIDE_H
      a.x = cxu
      a.z = czh + a.laneH
    }
    return
  }
  let tw = 0
  for (const o of opts) tw += o.w
  let r = rng() * tw
  for (const o of opts) {
    r -= o.w
    if (r <= 0) {
      o.go()
      return
    }
  }
  opts[opts.length - 1].go()
}

const LANE_SPAWN_STAGGER = 3.1

function spawnVertical(vi: number, laneSlot: number, salt: number): Agent {
  const north = segmentRandom(vi, salt, 801) < 0.5
  const laneV = ROAD_SIDE_V
  const cx = roadStripCenterX(vi)
  const k = pickKind(vi * 97 + salt + laneSlot * 13)
  const zOff = laneSlot * LANE_SPAWN_STAGGER
  return {
    kind: k,
    speed: pickSpeed(k, vi + salt + laneSlot),
    mode: 'v',
    vi,
    hj: 0,
    laneV,
    laneH: 0,
    heading: north ? 'N' : 'S',
    x: cx + laneV,
    z: north
      ? Z0 - SPAWN_BEYOND + EDGE + zOff
      : Z1 + SPAWN_BEYOND - EDGE - zOff,
    slot: { t: 'v', idx: flatOccV(vi, laneSlot) },
  }
}

function spawnHorizontal(hj: number, laneSlot: number, salt: number): Agent {
  const east = segmentRandom(hj, salt, 811) < 0.5
  const laneH = ROAD_SIDE_H
  const cz = roadStripCenterZ(hj)
  const k = pickKind(hj * 89 + salt + laneSlot * 11)
  const xOff = laneSlot * LANE_SPAWN_STAGGER
  return {
    kind: k,
    speed: pickSpeed(k, hj + salt + laneSlot),
    mode: 'h',
    vi: 0,
    hj,
    laneV: 0,
    laneH,
    heading: east ? 'E' : 'W',
    x: east
      ? X0 - SPAWN_BEYOND + EDGE + xOff
      : X1 + SPAWN_BEYOND - EDGE - xOff,
    z: cz + laneH,
    slot: { t: 'h', idx: flatOccH(hj, laneSlot) },
  }
}

function velocityWithSpeed(a: Agent, speedNow: number): { vx: number; vz: number } {
  switch (a.heading) {
    case 'N':
      return { vx: 0, vz: speedNow }
    case 'S':
      return { vx: 0, vz: -speedNow }
    case 'E':
      return { vx: speedNow, vz: 0 }
    case 'W':
      return { vx: -speedNow, vz: 0 }
  }
}

function integrateAgent(
  a: Agent,
  dt: number,
  occV: boolean[],
  occH: boolean[],
  rng: () => number,
  speedNow: number,
): boolean {
  const d = Math.min(dt, 0.055)
  const { vx, vz } = velocityWithSpeed(a, speedNow)
  const px = a.x
  const pz = a.z
  a.x += vx * d
  a.z += vz * d

  if (a.mode === 'v') {
    const vi = a.vi
    const tx = roadStripCenterX(vi) + a.laneV
    a.x += (tx - a.x) * Math.min(1, d * 2.35)

    if (vz > 0) {
      for (let j = 0; j <= NUM_BLOCKS; j++) {
        const iz = roadStripCenterZ(j)
        if (pz < iz - IZ_EPS && a.z >= iz - IZ_EPS) {
          a.z = iz
          pickNextAtIntersection(a, vi, j, occV, occH, rng)
          break
        }
      }
    } else if (vz < 0) {
      for (let j = NUM_BLOCKS; j >= 0; j--) {
        const iz = roadStripCenterZ(j)
        if (pz > iz + IZ_EPS && a.z <= iz + IZ_EPS) {
          a.z = iz
          pickNextAtIntersection(a, vi, j, occV, occH, rng)
          break
        }
      }
    }
  } else {
    const hj = a.hj
    const tz = roadStripCenterZ(hj) + a.laneH
    a.z += (tz - a.z) * Math.min(1, d * 2.35)

    if (vx > 0) {
      for (let i = 0; i <= NUM_BLOCKS; i++) {
        const ix = roadStripCenterX(i)
        if (px < ix - IZ_EPS && a.x >= ix - IZ_EPS) {
          a.x = ix
          pickNextAtIntersection(a, i, hj, occV, occH, rng)
          break
        }
      }
    } else if (vx < 0) {
      for (let i = NUM_BLOCKS; i >= 0; i--) {
        const ix = roadStripCenterX(i)
        if (px > ix + IZ_EPS && a.x <= ix + IZ_EPS) {
          a.x = ix
          pickNextAtIntersection(a, i, hj, occV, occH, rng)
          break
        }
      }
    }
  }

  const margin = EDGE - 0.8
  if (a.mode === 'v') {
    if (a.heading === 'N' && a.z > Z1 - margin) {
      if (a.slot.t === 'v') occV[a.slot.idx] = false
      else occH[a.slot.idx] = false
      return false
    }
    if (a.heading === 'S' && a.z < Z0 + margin) {
      if (a.slot.t === 'v') occV[a.slot.idx] = false
      else occH[a.slot.idx] = false
      return false
    }
  } else {
    if (a.heading === 'E' && a.x > X1 - margin) {
      if (a.slot.t === 'v') occV[a.slot.idx] = false
      else occH[a.slot.idx] = false
      return false
    }
    if (a.heading === 'W' && a.x < X0 + margin) {
      if (a.slot.t === 'v') occV[a.slot.idx] = false
      else occH[a.slot.idx] = false
      return false
    }
  }

  return true
}

/** Rough cuboid half-extents + local center (Y) for solid traffic vs boda. */
function vehicleColliderForKind(kind: VehicleKind): {
  args: [number, number, number]
  pos: [number, number, number]
} {
  switch (kind) {
    case 'bus':
      return { args: [1.28, 0.72, 4.85], pos: [0, 0.78, 0] }
    case 'trailer':
      return { args: [1.15, 0.58, 5.15], pos: [0, 0.55, -0.45] }
    case 'pickup':
      return { args: [1.02, 0.48, 2.35], pos: [0, 0.45, -0.12] }
    case 'taxi':
      return { args: [0.9, 0.44, 2.08], pos: [0, 0.4, 0] }
    case 'bicycle':
      return { args: [0.5, 0.42, 0.52], pos: [0, 0.34, 0] }
    case 'motorbike':
      return { args: [0.32, 0.36, 0.95], pos: [0, 0.34, 0.06] }
    case 'sedan':
      return { args: [0.86, 0.42, 1.95], pos: [0, 0.38, 0] }
    case 'van':
      return { args: [0.98, 0.54, 2.22], pos: [0, 0.52, 0.08] }
    case 'suv':
      return { args: [1.02, 0.4, 2.12], pos: [0, 0.46, 0.02] }
    case 'matatu':
      return { args: [1.06, 0.56, 2.78], pos: [0, 0.58, 0] }
    default:
      return { args: [0.85, 0.42, 1.85], pos: [0, 0.38, 0] }
  }
}

function applyAgentToRigidBody(
  a: Agent,
  rb: RapierRigidBody,
  world: { getRigidBody(handle: number): unknown },
  yawRad: number,
) {
  if (world.getRigidBody(rb.handle) == null) return
  rb.setTranslation({ x: a.x, y: 0.09, z: a.z }, true)
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRad)
  rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
}

const tireMat = new THREE.MeshStandardMaterial({
  color: '#0c0c0c',
  roughness: 0.92,
  metalness: 0.02,
})

const glassMat = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.22,
  metalness: 0.45,
})

const glassRearMat = new THREE.MeshStandardMaterial({
  color: '#0c1929',
  roughness: 0.28,
  metalness: 0.5,
})

const rimMat = new THREE.MeshStandardMaterial({
  color: '#2a2a2a',
  roughness: 0.4,
  metalness: 0.55,
})

/** Tyre + rim, axle along local X (left/right of car). */
function WheelAxleX({
  x,
  y,
  z,
  radius,
  width,
}: {
  x: number
  y: number
  z: number
  radius: number
  width: number
}) {
  return (
    <group position={[x, y, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow material={tireMat}>
        <cylinderGeometry args={[radius, radius, width, 18]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow material={rimMat}>
        <cylinderGeometry args={[radius * 0.52, radius * 0.52, width + 0.04, 12]} />
      </mesh>
    </group>
  )
}

function WheelsFour({
  halfTrack,
  wheelY,
  frontZ,
  rearZ,
  radius,
  tireWidth,
}: {
  halfTrack: number
  wheelY: number
  frontZ: number
  rearZ: number
  radius: number
  tireWidth: number
}) {
  return (
    <group>
      <WheelAxleX x={halfTrack} y={wheelY} z={frontZ} radius={radius} width={tireWidth} />
      <WheelAxleX x={-halfTrack} y={wheelY} z={frontZ} radius={radius} width={tireWidth} />
      <WheelAxleX x={halfTrack} y={wheelY} z={rearZ} radius={radius} width={tireWidth} />
      <WheelAxleX x={-halfTrack} y={wheelY} z={rearZ} radius={radius} width={tireWidth} />
    </group>
  )
}

/** Extra axle for buses / long trucks (same track). */
function WheelsSix({
  halfTrack,
  wheelY,
  zPositions,
  radius,
  tireWidth,
}: {
  halfTrack: number
  wheelY: number
  zPositions: [number, number, number]
  radius: number
  tireWidth: number
}) {
  return (
    <group>
      {zPositions.flatMap((z) => [
        <WheelAxleX key={`l-${z}`} x={halfTrack} y={wheelY} z={z} radius={radius} width={tireWidth} />,
        <WheelAxleX key={`r-${z}`} x={-halfTrack} y={wheelY} z={z} radius={radius} width={tireWidth} />,
      ])}
    </group>
  )
}

function VehicleMesh({ kind }: { kind: VehicleKind }) {
  switch (kind) {
    case 'taxi':
      return (
        <group>
          <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.72, 0.5, 4.05]} />
            <meshStandardMaterial color="#facc15" roughness={0.52} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.62, 0.92]} castShadow material={glassMat}>
            <boxGeometry args={[1.52, 0.34, 0.95]} />
          </mesh>
          <mesh position={[0, 0.58, -0.95]} castShadow material={glassRearMat}>
            <boxGeometry args={[1.48, 0.28, 0.72]} />
          </mesh>
          <mesh position={[0.88, 0.52, 0.15]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.22, 1.85]} />
          </mesh>
          <mesh position={[-0.88, 0.52, 0.15]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.22, 1.85]} />
          </mesh>
          <mesh position={[0, 0.42, -0.35]} castShadow>
            <boxGeometry args={[1.74, 0.08, 1.6]} />
            <meshStandardMaterial color="#111827" roughness={0.75} />
          </mesh>
          <WheelsFour
            halfTrack={0.72}
            wheelY={0.31}
            frontZ={1.38}
            rearZ={-1.38}
            radius={0.31}
            tireWidth={0.2}
          />
        </group>
      )
    case 'pickup':
      return (
        <group>
          <mesh position={[0, 0.42, 0.55]} castShadow receiveShadow>
            <boxGeometry args={[1.95, 0.58, 2.35]} />
            <meshStandardMaterial color="#6b7280" roughness={0.62} metalness={0.18} />
          </mesh>
          <mesh position={[0, 0.4, -1.35]} castShadow receiveShadow>
            <boxGeometry args={[1.9, 0.45, 2.1]} />
            <meshStandardMaterial color="#9ca3af" roughness={0.7} metalness={0.08} />
          </mesh>
          <mesh position={[0, 0.6, 1.05]} castShadow material={glassMat}>
            <boxGeometry args={[1.76, 0.32, 0.88]} />
          </mesh>
          <mesh position={[0, 0.52, -0.35]} castShadow material={glassRearMat}>
            <boxGeometry args={[1.65, 0.22, 0.55]} />
          </mesh>
          <mesh position={[0.99, 0.48, 0.65]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.2, 1.05]} />
          </mesh>
          <mesh position={[-0.99, 0.48, 0.65]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.2, 1.05]} />
          </mesh>
          <WheelsFour
            halfTrack={0.78}
            wheelY={0.33}
            frontZ={1.52}
            rearZ={-0.15}
            radius={0.34}
            tireWidth={0.22}
          />
          <WheelsFour
            halfTrack={0.78}
            wheelY={0.3}
            frontZ={-0.85}
            rearZ={-2.15}
            radius={0.34}
            tireWidth={0.22}
          />
        </group>
      )
    case 'bus':
      return (
        <group>
          <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.45, 1.38, 9.6]} />
            <meshStandardMaterial color="#1d4ed8" roughness={0.48} metalness={0.12} />
          </mesh>
          <mesh position={[0, 0.95, 0]} castShadow>
            <boxGeometry args={[2.35, 0.55, 8.8]} />
            <meshStandardMaterial color="#93c5fd" roughness={0.25} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.98, 4.35]} castShadow material={glassMat}>
            <boxGeometry args={[2.28, 0.48, 0.75]} />
          </mesh>
          <mesh position={[0, 0.96, -4.35]} castShadow material={glassRearMat}>
            <boxGeometry args={[2.26, 0.45, 0.7]} />
          </mesh>
          <mesh position={[1.23, 0.5, 0]} castShadow>
            <boxGeometry args={[0.06, 0.85, 9.5]} />
            <meshStandardMaterial color="#e5e7eb" roughness={0.55} />
          </mesh>
          <WheelsSix
            halfTrack={0.95}
            wheelY={0.44}
            zPositions={[3.35, 0.15, -3.35]}
            radius={0.46}
            tireWidth={0.26}
          />
        </group>
      )
    case 'trailer':
      return (
        <group>
          <mesh position={[0, 0.52, 2.15]} castShadow receiveShadow>
            <boxGeometry args={[2.05, 1.12, 2.65]} />
            <meshStandardMaterial color="#b91c1c" roughness={0.55} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0.7, 2.62]} castShadow material={glassMat}>
            <boxGeometry args={[1.86, 0.4, 0.88]} />
          </mesh>
          <mesh position={[0.98, 0.55, 2.1]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.28, 1.35]} />
          </mesh>
          <mesh position={[-0.98, 0.55, 2.1]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.28, 1.35]} />
          </mesh>
          <WheelsFour
            halfTrack={0.82}
            wheelY={0.36}
            frontZ={3.05}
            rearZ={1.35}
            radius={0.38}
            tireWidth={0.24}
          />
          <mesh position={[0, 0.62, -2.9]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 1.05, 7.2]} />
            <meshStandardMaterial color="#57534e" roughness={0.72} metalness={0.06} />
          </mesh>
          <mesh position={[0, 0.95, -2.9]} castShadow>
            <boxGeometry args={[2.15, 0.08, 7.1]} />
            <meshStandardMaterial color="#fbbf24" roughness={0.5} emissive="#713f12" emissiveIntensity={0.15} />
          </mesh>
          <WheelsSix
            halfTrack={0.88}
            wheelY={0.38}
            zPositions={[-0.35, -2.85, -5.35]}
            radius={0.42}
            tireWidth={0.25}
          />
        </group>
      )
    case 'bicycle':
      return (
        <group scale={0.95}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <cylinderGeometry args={[0.38, 0.38, 0.04, 12]} />
            <meshStandardMaterial color="#374151" roughness={0.65} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.32, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 1.15, 6]} />
            <meshStandardMaterial color="#1f2937" roughness={0.6} />
          </mesh>
          <group position={[0, 0.22, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow receiveShadow material={tireMat}>
              <cylinderGeometry args={[0.34, 0.34, 0.075, 16]} />
            </mesh>
            <mesh material={rimMat}>
              <cylinderGeometry args={[0.2, 0.2, 0.09, 10]} />
            </mesh>
          </group>
          <group position={[0, 0.22, -0.42]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow receiveShadow material={tireMat}>
              <cylinderGeometry args={[0.34, 0.34, 0.075, 16]} />
            </mesh>
            <mesh material={rimMat}>
              <cylinderGeometry args={[0.2, 0.2, 0.09, 10]} />
            </mesh>
          </group>
        </group>
      )
    case 'motorbike':
      return (
        <group>
          <mesh position={[0, 0.38, 0.05]} castShadow receiveShadow>
            <boxGeometry args={[0.52, 0.42, 1.85]} />
            <meshStandardMaterial color="#dc2626" roughness={0.45} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.56, 0.58]} castShadow material={glassMat}>
            <boxGeometry args={[0.36, 0.24, 0.42]} />
          </mesh>
          <mesh position={[0, 0.48, -0.35]} castShadow material={glassRearMat}>
            <boxGeometry args={[0.28, 0.14, 0.22]} />
          </mesh>
          <group position={[0, 0.19, 0.66]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow receiveShadow material={tireMat}>
              <cylinderGeometry args={[0.3, 0.3, 0.1, 16]} />
            </mesh>
            <mesh material={rimMat}>
              <cylinderGeometry args={[0.17, 0.17, 0.12, 10]} />
            </mesh>
          </group>
          <group position={[0, 0.19, -0.64]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow receiveShadow material={tireMat}>
              <cylinderGeometry args={[0.31, 0.31, 0.1, 16]} />
            </mesh>
            <mesh material={rimMat}>
              <cylinderGeometry args={[0.18, 0.18, 0.12, 10]} />
            </mesh>
          </group>
        </group>
      )
    case 'sedan':
      return (
        <group>
          <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.68, 0.48, 3.85]} />
            <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.22} />
          </mesh>
          <mesh position={[0, 0.59, 0.82]} castShadow material={glassMat}>
            <boxGeometry args={[1.5, 0.3, 0.92]} />
          </mesh>
          <mesh position={[0, 0.56, -0.88]} castShadow material={glassRearMat}>
            <boxGeometry args={[1.46, 0.26, 0.68]} />
          </mesh>
          <mesh position={[0.85, 0.5, 0.05]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.2, 1.65]} />
          </mesh>
          <mesh position={[-0.85, 0.5, 0.05]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.2, 1.65]} />
          </mesh>
          <mesh position={[0, 0.4, -0.32]} castShadow>
            <boxGeometry args={[1.7, 0.07, 1.45]} />
            <meshStandardMaterial color="#0f172a" roughness={0.78} />
          </mesh>
          <WheelsFour
            halfTrack={0.7}
            wheelY={0.3}
            frontZ={1.28}
            rearZ={-1.28}
            radius={0.3}
            tireWidth={0.19}
          />
        </group>
      )
    case 'van':
      return (
        <group>
          <mesh position={[0, 0.52, 0.1]} castShadow receiveShadow>
            <boxGeometry args={[1.92, 1.05, 4.35]} />
            <meshStandardMaterial color="#e8e4dc" roughness={0.58} metalness={0.08} />
          </mesh>
          <mesh position={[0, 0.64, 1.42]} castShadow material={glassMat}>
            <boxGeometry args={[1.78, 0.44, 0.88]} />
          </mesh>
          <mesh position={[0, 0.62, -0.35]} castShadow material={glassRearMat}>
            <boxGeometry args={[1.72, 0.36, 0.62]} />
          </mesh>
          <mesh position={[0.97, 0.58, 0.2]} castShadow material={glassMat}>
            <boxGeometry args={[0.05, 0.38, 3.25]} />
          </mesh>
          <mesh position={[0.97, 0.45, 0]} castShadow>
            <boxGeometry args={[0.05, 0.55, 4.1]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
          </mesh>
          <WheelsFour
            halfTrack={0.8}
            wheelY={0.38}
            frontZ={1.62}
            rearZ={-1.52}
            radius={0.36}
            tireWidth={0.22}
          />
        </group>
      )
    case 'suv':
      return (
        <group>
          <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.98, 0.72, 4.2]} />
            <meshStandardMaterial color="#292524" roughness={0.55} metalness={0.18} />
          </mesh>
          <mesh position={[0, 0.74, 0.62]} castShadow material={glassMat}>
            <boxGeometry args={[1.82, 0.4, 1.05]} />
          </mesh>
          <mesh position={[0, 0.72, -0.95]} castShadow material={glassRearMat}>
            <boxGeometry args={[1.78, 0.32, 0.75]} />
          </mesh>
          <mesh position={[0.99, 0.62, 0.1]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.28, 1.85]} />
          </mesh>
          <mesh position={[-0.99, 0.62, 0.1]} castShadow material={glassMat}>
            <boxGeometry args={[0.06, 0.28, 1.85]} />
          </mesh>
          <mesh position={[0, 0.88, -0.35]} castShadow receiveShadow>
            <boxGeometry args={[1.88, 0.22, 1.5]} />
            <meshStandardMaterial color="#44403c" roughness={0.62} />
          </mesh>
          <WheelsFour
            halfTrack={0.82}
            wheelY={0.36}
            frontZ={1.42}
            rearZ={-1.42}
            radius={0.36}
            tireWidth={0.22}
          />
        </group>
      )
    case 'matatu':
      return (
        <group>
          <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.05, 1.05, 5.4]} />
            <meshStandardMaterial color="#ca8a04" roughness={0.52} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.78, 0.15]} castShadow>
            <boxGeometry args={[1.95, 0.42, 4.85]} />
            <meshStandardMaterial color="#fef08a" roughness={0.35} metalness={0.12} />
          </mesh>
          <mesh position={[0, 0.8, 2.42]} castShadow material={glassMat}>
            <boxGeometry args={[1.92, 0.38, 0.72]} />
          </mesh>
          <mesh position={[0, 0.78, -2.35]} castShadow material={glassRearMat}>
            <boxGeometry args={[1.9, 0.36, 0.65]} />
          </mesh>
          <mesh position={[1.03, 0.42, 0]} castShadow>
            <boxGeometry args={[0.05, 0.65, 5.2]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.58, 2.35]} castShadow>
            <boxGeometry args={[1.98, 0.12, 0.85]} />
            <meshStandardMaterial color="#15803d" roughness={0.55} />
          </mesh>
          <WheelsSix
            halfTrack={0.88}
            wheelY={0.4}
            zPositions={[1.85, -0.35, -2.55]}
            radius={0.4}
            tireWidth={0.24}
          />
        </group>
      )
    default:
      return (
        <group>
          <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.6, 0.5, 3.6]} />
            <meshStandardMaterial color="#64748b" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.54, 0.65]} castShadow material={glassMat}>
            <boxGeometry args={[1.45, 0.26, 0.85]} />
          </mesh>
          <mesh position={[0, 0.5, -0.7]} castShadow material={glassRearMat}>
            <boxGeometry args={[1.4, 0.22, 0.55]} />
          </mesh>
          <WheelsFour
            halfTrack={0.68}
            wheelY={0.29}
            frontZ={1.15}
            rearZ={-1.15}
            radius={0.29}
            tireWidth={0.18}
          />
        </group>
      )
  }
}

const NUM_STRIPS = NUM_BLOCKS + 1
const NUM_V_SLOTS = NUM_STRIPS * LANES_PER_STRIP

/**
 * Two vehicles per N–S strip and two per E–W strip, all on one side of the road (same offset from
 * center). They drive to the map edge (no mid-road looping) and pick random turns when a free slot
 * exists on the target road. Spawns sit beyond the city so traffic enters from outside the fog band;
 * stable RigidBody keys avoid remount-at-origin pops. Yaw and speed are smoothed toward targets.
 * Kinematic rigid bodies with cuboid colliders — boda can collide (speed bump + stun).
 */
export function RoadTraffic() {
  const { world } = useRapier()

  const initial = useMemo(() => {
    const ov = Array(NUM_V_SLOTS).fill(false) as boolean[]
    const oh = Array(NUM_V_SLOTS).fill(false) as boolean[]
    const agents: (Agent | null)[] = []
    for (let vi = 0; vi < NUM_STRIPS; vi++) {
      for (let lane = 0; lane < LANES_PER_STRIP; lane++) {
        const idx = flatOccV(vi, lane)
        ov[idx] = true
        agents.push(spawnVertical(vi, lane, vi * 17 + lane * 31))
      }
    }
    for (let hj = 0; hj < NUM_STRIPS; hj++) {
      for (let lane = 0; lane < LANES_PER_STRIP; lane++) {
        const idx = flatOccH(hj, lane)
        oh[idx] = true
        agents.push(spawnHorizontal(hj, lane, hj * 19 + lane * 29 + 3))
      }
    }
    return { ov, oh, agents }
  }, [])

  const occV = useRef(initial.ov)
  const occH = useRef(initial.oh)
  const agentsRef = useRef(initial.agents)
  /** Vehicle Rapier bodies (name kept `groupRefs` for older HMR chunks that still reference it). */
  const groupRefs = useRef<(RapierRigidBody | null)[]>([])
  const smoothYawRef = useRef<number[]>([])
  const smoothSpeedRef = useRef<number[]>([])
  const [, setRenderTick] = useState(0)

  const slotKeys = useMemo(() => {
    const k: string[] = []
    for (let vi = 0; vi < NUM_STRIPS; vi++) {
      for (let lane = 0; lane < LANES_PER_STRIP; lane++) k.push(`v-${vi}-L${lane}`)
    }
    for (let hj = 0; hj < NUM_STRIPS; hj++) {
      for (let lane = 0; lane < LANES_PER_STRIP; lane++) k.push(`h-${hj}-L${lane}`)
    }
    return k
  }, [])

  useFrame((_, dt) => {
    const rng = Math.random
    const agents = agentsRef.current
    const ov = occV.current
    const oh = occH.current
    const n = agents.length
    const yawBuf = smoothYawRef.current
    const spdBuf = smoothSpeedRef.current
    while (yawBuf.length < n) yawBuf.push(Number.NaN)
    while (spdBuf.length < n) spdBuf.push(Number.NaN)

    for (let i = 0; i < n; i++) {
      let a = agents[i]
      const rb = groupRefs.current[i]
      if (!rb || world.getRigidBody(rb.handle) == null) continue

      if (!a) {
        continue
      }

      const targetYaw = headingToYaw(a.heading)
      let sy = yawBuf[i]
      if (!Number.isFinite(sy)) sy = targetYaw
      const yawDiff = Math.atan2(
        Math.sin(targetYaw - sy),
        Math.cos(targetYaw - sy),
      )
      sy += yawDiff * (1 - Math.exp(-6.2 * dt))
      yawBuf[i] = sy

      const tgtSp = a.speed
      let sp = spdBuf[i]
      if (!Number.isFinite(sp)) sp = tgtSp
      const maxStep = 3.6 * dt
      sp += Math.sign(tgtSp - sp) * Math.min(Math.abs(tgtSp - sp), maxStep)
      spdBuf[i] = sp

      const alive = integrateAgent(a, dt, ov, oh, rng, sp)
      if (!alive) {
        const wasV = i < NUM_V_SLOTS
        const salt = Math.floor(performance.now() + i) % 997
        if (wasV) {
          const idx = i
          ov[idx] = false
          const vi = Math.floor(idx / LANES_PER_STRIP)
          const laneSlot = idx % LANES_PER_STRIP
          const na = spawnVertical(vi, laneSlot, salt)
          ov[idx] = true
          agents[i] = na
        } else {
          const hi = i - NUM_V_SLOTS
          oh[hi] = false
          const hj = Math.floor(hi / LANES_PER_STRIP)
          const laneSlot = hi % LANES_PER_STRIP
          const na = spawnHorizontal(hj, laneSlot, salt)
          oh[hi] = true
          agents[i] = na
        }
        a = agents[i]!
        yawBuf[i] = headingToYaw(a.heading)
        spdBuf[i] = a.speed
        setRenderTick((t) => t + 1)
      }

      if (agents[i])
        applyAgentToRigidBody(agents[i]!, rb, world, yawBuf[i])
    }
  })

  return (
    <group>
      {slotKeys.map((key, i) => {
        const ag = agentsRef.current[i]
        const col = ag ? vehicleColliderForKind(ag.kind) : null
        return (
          <RigidBody
            key={key}
            ref={(el) => {
              groupRefs.current[i] = el
            }}
            position={ag ? [ag.x, 0.09, ag.z] : [0, -999, 0]}
            type="kinematicPosition"
            colliders={false}
            userData={{ kind: 'vehicle' }}
            friction={0.35}
            restitution={0.06}
            canSleep={false}
          >
            {ag && col ? (
              <CuboidCollider args={col.args} position={col.pos} />
            ) : null}
            {ag ? <VehicleMesh kind={ag.kind} /> : null}
          </RigidBody>
        )
      })}
    </group>
  )
}
