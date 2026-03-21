import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CITY_START, CITY_TOTAL, NUM_BLOCKS, roadStripCenterX, roadStripCenterZ } from '@game/cityGrid'
import { segmentRandom } from '@game/roadDecorPlacements'

const X0 = CITY_START
const Z0 = CITY_START
const X1 = CITY_START + CITY_TOTAL
const Z1 = CITY_START + CITY_TOTAL
const EDGE = 3.5
const IZ_EPS = 0.2
const LANE = 0.58

let nextSpawnId = 1

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
  /** Strip this vehicle currently “owns” (one car per N–S or E–W road). */
  slot: { t: 'v' | 'h'; i: number }
  spawnId: number
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
  const laneV = rng() < 0.5 ? LANE : -LANE
  const laneH = rng() < 0.5 ? LANE : -LANE
  const cx = roadStripCenterX(viNode)
  const cz = roadStripCenterZ(jNode)

  type Opt = { w: number; go: () => void }
  const opts: Opt[] = []

  const releaseOld = () => {
    if (a.slot.t === 'v') occV[a.slot.i] = false
    else occH[a.slot.i] = false
  }
  const claimV = (idx: number) => {
    releaseOld()
    occV[idx] = true
    a.slot = { t: 'v', i: idx }
    a.mode = 'v'
    a.vi = idx
  }
  const claimH = (idx: number) => {
    releaseOld()
    occH[idx] = true
    a.slot = { t: 'h', i: idx }
    a.mode = 'h'
    a.hj = idx
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
            a.laneV = a.laneV * 0.8 + laneV * 0.2
            a.x = cx + a.laneV
            a.z = cz
          },
        })
      if (vi > 0 && !occH[j])
        opts.push({
          w: 0.32,
          go: () => {
            claimH(j)
            a.heading = 'W'
            a.laneH = laneH
            a.x = cx
            a.z = cz + a.laneH
          },
        })
      if (vi < NUM_BLOCKS && !occH[j])
        opts.push({
          w: 0.32,
          go: () => {
            claimH(j)
            a.heading = 'E'
            a.laneH = laneH
            a.x = cx
            a.z = cz + a.laneH
          },
        })
    } else {
      if (j > 0)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'S'
            a.laneV = a.laneV * 0.8 + laneV * 0.2
            a.x = cx + a.laneV
            a.z = cz
          },
        })
      if (vi < NUM_BLOCKS && !occH[j])
        opts.push({
          w: 0.32,
          go: () => {
            claimH(j)
            a.heading = 'E'
            a.laneH = laneH
            a.x = cx
            a.z = cz + a.laneH
          },
        })
      if (vi > 0 && !occH[j])
        opts.push({
          w: 0.32,
          go: () => {
            claimH(j)
            a.heading = 'W'
            a.laneH = laneH
            a.x = cx
            a.z = cz + a.laneH
          },
        })
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
            a.laneH = a.laneH * 0.8 + laneH * 0.2
            a.x = cx
            a.z = cz0 + a.laneH
          },
        })
      if (hj < NUM_BLOCKS && !occV[vi])
        opts.push({
          w: 0.32,
          go: () => {
            claimV(vi)
            a.heading = 'N'
            a.laneV = laneV
            a.x = roadStripCenterX(vi) + a.laneV
            a.z = cz0
          },
        })
      if (hj > 0 && !occV[vi])
        opts.push({
          w: 0.32,
          go: () => {
            claimV(vi)
            a.heading = 'S'
            a.laneV = laneV
            a.x = roadStripCenterX(vi) + a.laneV
            a.z = cz0
          },
        })
    } else {
      if (vi > 0)
        opts.push({
          w: 0.4,
          go: () => {
            a.heading = 'W'
            a.laneH = a.laneH * 0.8 + laneH * 0.2
            a.x = cx
            a.z = cz0 + a.laneH
          },
        })
      if (hj < NUM_BLOCKS && !occV[vi])
        opts.push({
          w: 0.32,
          go: () => {
            claimV(vi)
            a.heading = 'N'
            a.laneV = laneV
            a.x = roadStripCenterX(vi) + a.laneV
            a.z = cz0
          },
        })
      if (hj > 0 && !occV[vi])
        opts.push({
          w: 0.32,
          go: () => {
            claimV(vi)
            a.heading = 'S'
            a.laneV = laneV
            a.x = roadStripCenterX(vi) + a.laneV
            a.z = cz0
          },
        })
    }
  }

  if (opts.length === 0) {
    const cxu = roadStripCenterX(viNode)
    const czu = roadStripCenterZ(jNode)
    if (a.mode === 'v') {
      a.heading = a.heading === 'N' ? 'S' : 'N'
      a.x = cxu + a.laneV
      a.z = czu
    } else {
      const czh = roadStripCenterZ(jNode)
      a.heading = a.heading === 'E' ? 'W' : 'E'
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

function spawnVertical(vi: number, salt: number): Agent {
  const north = segmentRandom(vi, salt, 801) < 0.5
  const laneV = segmentRandom(vi, salt, 802) < 0.5 ? LANE : -LANE
  const cx = roadStripCenterX(vi)
  const k = pickKind(vi * 97 + salt)
  return {
    kind: k,
    speed: pickSpeed(k, vi + salt),
    mode: 'v',
    vi,
    hj: 0,
    laneV,
    laneH: 0,
    heading: north ? 'N' : 'S',
    x: cx + laneV,
    z: north ? Z0 + EDGE : Z1 - EDGE,
    slot: { t: 'v', i: vi },
    spawnId: nextSpawnId++,
  }
}

function spawnHorizontal(hj: number, salt: number): Agent {
  const east = segmentRandom(hj, salt, 811) < 0.5
  const laneH = segmentRandom(hj, salt, 812) < 0.5 ? LANE : -LANE
  const cz = roadStripCenterZ(hj)
  const k = pickKind(hj * 89 + salt)
  return {
    kind: k,
    speed: pickSpeed(k, hj + salt),
    mode: 'h',
    vi: 0,
    hj,
    laneV: 0,
    laneH,
    heading: east ? 'E' : 'W',
    x: east ? X0 + EDGE : X1 - EDGE,
    z: cz + laneH,
    slot: { t: 'h', i: hj },
    spawnId: nextSpawnId++,
  }
}

function velocity(a: Agent): { vx: number; vz: number } {
  switch (a.heading) {
    case 'N':
      return { vx: 0, vz: a.speed }
    case 'S':
      return { vx: 0, vz: -a.speed }
    case 'E':
      return { vx: a.speed, vz: 0 }
    case 'W':
      return { vx: -a.speed, vz: 0 }
  }
}

function integrateAgent(
  a: Agent,
  dt: number,
  occV: boolean[],
  occH: boolean[],
  rng: () => number,
): boolean {
  const d = Math.min(dt, 0.055)
  const { vx, vz } = velocity(a)
  const px = a.x
  const pz = a.z
  a.x += vx * d
  a.z += vz * d

  if (a.mode === 'v') {
    const vi = a.vi
    const tx = roadStripCenterX(vi) + a.laneV
    a.x += (tx - a.x) * Math.min(1, d * 4)

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
    a.z += (tz - a.z) * Math.min(1, d * 4)

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
      if (a.slot.t === 'v') occV[a.slot.i] = false
      else occH[a.slot.i] = false
      return false
    }
    if (a.heading === 'S' && a.z < Z0 + margin) {
      if (a.slot.t === 'v') occV[a.slot.i] = false
      else occH[a.slot.i] = false
      return false
    }
  } else {
    if (a.heading === 'E' && a.x > X1 - margin) {
      if (a.slot.t === 'v') occV[a.slot.i] = false
      else occH[a.slot.i] = false
      return false
    }
    if (a.heading === 'W' && a.x < X0 + margin) {
      if (a.slot.t === 'v') occV[a.slot.i] = false
      else occH[a.slot.i] = false
      return false
    }
  }

  return true
}

function applyAgentToGroup(a: Agent, g: THREE.Group) {
  g.position.set(a.x, 0.09, a.z)
  g.rotation.y = headingToYaw(a.heading)
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

function VehicleMesh({ kind }: { kind: VehicleKind }) {
  switch (kind) {
    case 'taxi':
      return (
        <group>
          <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.72, 0.5, 4.05]} />
            <meshStandardMaterial color="#facc15" roughness={0.52} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.62, 0.85]} castShadow material={glassMat}>
            <boxGeometry args={[1.55, 0.32, 1.1]} />
          </mesh>
          <mesh position={[0, 0.42, -0.35]} castShadow>
            <boxGeometry args={[1.74, 0.08, 1.6]} />
            <meshStandardMaterial color="#111827" roughness={0.75} />
          </mesh>
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
          <mesh position={[0, 0.58, 0.95]} castShadow material={glassMat}>
            <boxGeometry args={[1.75, 0.28, 0.95]} />
          </mesh>
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
          <mesh position={[1.23, 0.5, 0]} castShadow>
            <boxGeometry args={[0.06, 0.85, 9.5]} />
            <meshStandardMaterial color="#e5e7eb" roughness={0.55} />
          </mesh>
        </group>
      )
    case 'trailer':
      return (
        <group>
          <mesh position={[0, 0.52, 2.15]} castShadow receiveShadow>
            <boxGeometry args={[2.05, 1.12, 2.65]} />
            <meshStandardMaterial color="#b91c1c" roughness={0.55} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0.68, 2.5]} castShadow material={glassMat}>
            <boxGeometry args={[1.85, 0.38, 1]} />
          </mesh>
          <mesh position={[0, 0.62, -2.9]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 1.05, 7.2]} />
            <meshStandardMaterial color="#57534e" roughness={0.72} metalness={0.06} />
          </mesh>
          <mesh position={[0, 0.95, -2.9]} castShadow>
            <boxGeometry args={[2.15, 0.08, 7.1]} />
            <meshStandardMaterial color="#fbbf24" roughness={0.5} emissive="#713f12" emissiveIntensity={0.15} />
          </mesh>
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
          <mesh position={[0, 0.22, 0.42]} rotation={[Math.PI / 2, 0, 0]} castShadow material={tireMat}>
            <cylinderGeometry args={[0.32, 0.32, 0.06, 10]} />
          </mesh>
          <mesh position={[0, 0.22, -0.42]} rotation={[Math.PI / 2, 0, 0]} castShadow material={tireMat}>
            <cylinderGeometry args={[0.32, 0.32, 0.06, 10]} />
          </mesh>
        </group>
      )
    case 'motorbike':
      return (
        <group>
          <mesh position={[0, 0.38, 0.05]} castShadow receiveShadow>
            <boxGeometry args={[0.52, 0.42, 1.85]} />
            <meshStandardMaterial color="#dc2626" roughness={0.45} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.55, 0.55]} castShadow material={glassMat}>
            <boxGeometry args={[0.35, 0.22, 0.45]} />
          </mesh>
          <mesh position={[0, 0.18, 0.65]} rotation={[Math.PI / 2, 0, 0]} castShadow material={tireMat}>
            <cylinderGeometry args={[0.28, 0.28, 0.05, 10]} />
          </mesh>
          <mesh position={[0, 0.18, -0.62]} rotation={[Math.PI / 2, 0, 0]} castShadow material={tireMat}>
            <cylinderGeometry args={[0.3, 0.3, 0.05, 10]} />
          </mesh>
        </group>
      )
    case 'sedan':
      return (
        <group>
          <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.68, 0.48, 3.85]} />
            <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.22} />
          </mesh>
          <mesh position={[0, 0.58, 0.75]} castShadow material={glassMat}>
            <boxGeometry args={[1.5, 0.28, 1]} />
          </mesh>
          <mesh position={[0, 0.4, -0.32]} castShadow>
            <boxGeometry args={[1.7, 0.07, 1.45]} />
            <meshStandardMaterial color="#0f172a" roughness={0.78} />
          </mesh>
        </group>
      )
    case 'van':
      return (
        <group>
          <mesh position={[0, 0.52, 0.1]} castShadow receiveShadow>
            <boxGeometry args={[1.92, 1.05, 4.35]} />
            <meshStandardMaterial color="#e8e4dc" roughness={0.58} metalness={0.08} />
          </mesh>
          <mesh position={[0, 0.62, 1.35]} castShadow material={glassMat}>
            <boxGeometry args={[1.78, 0.42, 0.95]} />
          </mesh>
          <mesh position={[0.97, 0.45, 0]} castShadow>
            <boxGeometry args={[0.05, 0.55, 4.1]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
          </mesh>
        </group>
      )
    case 'suv':
      return (
        <group>
          <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.98, 0.72, 4.2]} />
            <meshStandardMaterial color="#292524" roughness={0.55} metalness={0.18} />
          </mesh>
          <mesh position={[0, 0.72, 0.55]} castShadow material={glassMat}>
            <boxGeometry args={[1.82, 0.38, 1.15]} />
          </mesh>
          <mesh position={[0, 0.88, -0.35]} castShadow receiveShadow>
            <boxGeometry args={[1.88, 0.22, 1.5]} />
            <meshStandardMaterial color="#44403c" roughness={0.62} />
          </mesh>
        </group>
      )
    case 'matatu':
      return (
        <group>
          <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.05, 1.05, 5.4]} />
            <meshStandardMaterial color="#ca8a04" roughness={0.52} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.78, 0.2]} castShadow>
            <boxGeometry args={[1.95, 0.42, 4.9]} />
            <meshStandardMaterial color="#fef08a" roughness={0.35} metalness={0.12} />
          </mesh>
          <mesh position={[1.03, 0.42, 0]} castShadow>
            <boxGeometry args={[0.05, 0.65, 5.2]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.58, 2.35]} castShadow>
            <boxGeometry args={[1.98, 0.12, 0.85]} />
            <meshStandardMaterial color="#15803d" roughness={0.55} />
          </mesh>
        </group>
      )
    default:
      return (
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[1.6, 0.5, 3.6]} />
          <meshStandardMaterial color="#64748b" roughness={0.65} />
        </mesh>
      )
  }
}

const NUM_STRIPS = NUM_BLOCKS + 1

/**
 * One vehicle per N–S strip and one per E–W strip. They drive to the map edge (no mid-road looping)
 * and pick random turns at intersections when the target strip is free.
 * No Rapier bodies — boda is never knocked.
 */
export function RoadTraffic() {
  const initial = useMemo(() => {
    const ov = Array(NUM_STRIPS).fill(false) as boolean[]
    const oh = Array(NUM_STRIPS).fill(false) as boolean[]
    const agents: (Agent | null)[] = []
    for (let vi = 0; vi < NUM_STRIPS; vi++) {
      if (segmentRandom(vi, 0, 900) > 0.82) {
        agents.push(null)
        continue
      }
      ov[vi] = true
      agents.push(spawnVertical(vi, vi * 17))
    }
    for (let hj = 0; hj < NUM_STRIPS; hj++) {
      if (segmentRandom(hj, 1, 901) > 0.82) {
        agents.push(null)
        continue
      }
      oh[hj] = true
      agents.push(spawnHorizontal(hj, hj * 19 + 3))
    }
    return { ov, oh, agents }
  }, [])

  const occV = useRef(initial.ov)
  const occH = useRef(initial.oh)
  const agentsRef = useRef(initial.agents)
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const [, setRenderTick] = useState(0)

  const slotKeys = useMemo(() => {
    const k: string[] = []
    for (let vi = 0; vi < NUM_STRIPS; vi++) k.push(`v-${vi}`)
    for (let hj = 0; hj < NUM_STRIPS; hj++) k.push(`h-${hj}`)
    return k
  }, [])

  useLayoutEffect(() => {
    agentsRef.current.forEach((a, i) => {
      const g = groupRefs.current[i]
      if (g && a) applyAgentToGroup(a, g)
    })
  }, [])

  useFrame((_, dt) => {
    const rng = Math.random
    const agents = agentsRef.current
    const ov = occV.current
    const oh = occH.current

    for (let i = 0; i < agents.length; i++) {
      let a = agents[i]
      const g = groupRefs.current[i]
      if (!g) continue

      if (!a) {
        g.scale.setScalar(0)
        continue
      }
      g.scale.setScalar(1)

      const alive = integrateAgent(a, dt, ov, oh, rng)
      if (!alive) {
        const wasV = i < NUM_STRIPS
        const idx = wasV ? i : i - NUM_STRIPS
        if (wasV) {
          ov[idx] = false
          const na = spawnVertical(idx, Math.floor(performance.now() + i) % 997)
          ov[idx] = true
          agents[i] = na
        } else {
          oh[idx] = false
          const na = spawnHorizontal(idx, Math.floor(performance.now() + i) % 997)
          oh[idx] = true
          agents[i] = na
        }
        a = agents[i]!
        setRenderTick((t) => t + 1)
      }

      if (agents[i]) applyAgentToGroup(agents[i]!, g)
    }
  })

  return (
    <group>
      {slotKeys.map((key, i) => {
        const ag = agentsRef.current[i]
        return (
          <group
            key={`${key}-${ag?.spawnId ?? 'x'}`}
            ref={(el) => {
              groupRefs.current[i] = el
            }}
          >
            {ag ? <VehicleMesh kind={ag.kind} /> : null}
          </group>
        )
      })}
    </group>
  )
}
