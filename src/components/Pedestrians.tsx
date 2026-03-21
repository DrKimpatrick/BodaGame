import { useFrame } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ROAD_W } from '@game/cityGrid'
import {
  segmentRandom,
  ZEBRA_HORIZONTAL_SITES,
  ZEBRA_VERTICAL_SITES,
  SIDEWALK_HORIZONTAL_SLOTS,
  SIDEWALK_VERTICAL_SLOTS,
  type ZebraHorizontalSite,
  type ZebraVerticalSite,
  type SidewalkAlongHorizontal,
  type SidewalkAlongVertical,
} from '@game/roadDecorPlacements'

const SHIRTS = ['#c2410c', '#1d4ed8', '#047857', '#7c3aed', '#b45309', '#0f766e', '#be185d', '#4f46e5']
const PANTS = ['#1e293b', '#292524', '#334155', '#44403c', '#27272a']
const SKINS = ['#c4a574', '#8d5524', '#e0ac69', '#5c3a21', '#b8936a', '#6b4423']

function pick<T>(arr: T[], seed: number, salt: number): T {
  const i = Math.min(arr.length - 1, Math.floor(segmentRandom(seed, salt, 77) * arr.length))
  return arr[Math.max(0, i)]
}

/** Low-poly walker; `seed` drives outfit colours. */
function SimpleWalker({ seed, scale = 1 }: { seed: number; scale?: number }) {
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)

  const skinMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: pick(SKINS, seed, 1),
        roughness: 0.66,
        metalness: 0.02,
      }),
    [seed],
  )
  const shirtMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: pick(SHIRTS, seed, 2),
        roughness: 0.78,
        metalness: 0.04,
      }),
    [seed],
  )
  const pantsMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: pick(PANTS, seed, 3),
        roughness: 0.82,
        metalness: 0.03,
      }),
    [seed],
  )

  useFrame(({ clock }) => {
    const w = Math.sin(clock.elapsedTime * 6.2 + seed * 0.3) * 0.42
    if (legL.current) legL.current.rotation.x = w
    if (legR.current) legR.current.rotation.x = -w
  })

  return (
    <group scale={scale} position={[0, -0.33, 0]}>
      <mesh position={[0, 1.38, 0]} castShadow material={skinMat}>
        <sphereGeometry args={[0.12, 10, 10]} />
      </mesh>
      <mesh position={[0, 0.98, 0]} castShadow material={shirtMat}>
        <boxGeometry args={[0.3, 0.48, 0.18]} />
      </mesh>
      <group ref={legL} position={[-0.08, 0.68, 0]}>
        <mesh position={[0, -0.16, 0]} castShadow material={pantsMat}>
          <boxGeometry args={[0.1, 0.36, 0.1]} />
        </mesh>
      </group>
      <group ref={legR} position={[0.08, 0.68, 0]}>
        <mesh position={[0, -0.16, 0]} castShadow material={pantsMat}>
          <boxGeometry args={[0.1, 0.36, 0.1]} />
        </mesh>
      </group>
    </group>
  )
}

function CrosserVertical({ site, idx }: { site: ZebraVerticalSite; idx: number }) {
  const ref = useRef<THREE.Group>(null)
  const half = ROAD_W * 0.36
  const speed = 0.38 + segmentRandom(site.vi, idx, 860) * 0.55
  const zOff = (idx - 0.9) * 0.38 + (segmentRandom(site.vi, idx, 861) - 0.5) * 0.28
  const phase = segmentRandom(site.vi, idx, 862) * Math.PI * 2
  const seed = site.vi * 409 + site.j * 37 + idx * 19

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * speed + phase
    const x = site.cx + Math.sin(t) * half
    ref.current.position.set(x, 0.075, site.z + zOff)
    const vx = Math.cos(t) * half * speed
    ref.current.rotation.y = vx >= 0 ? -Math.PI / 2 : Math.PI / 2
  })

  return (
    <group ref={ref}>
      <SimpleWalker seed={seed} scale={0.88 + segmentRandom(site.vi, idx, 863) * 0.14} />
    </group>
  )
}

function CrosserHorizontal({ site, idx }: { site: ZebraHorizontalSite; idx: number }) {
  const ref = useRef<THREE.Group>(null)
  const half = ROAD_W * 0.36
  const speed = 0.38 + segmentRandom(site.i, idx, 870) * 0.55
  const xOff = (idx - 0.9) * 0.38 + (segmentRandom(site.i, idx, 871) - 0.5) * 0.28
  const phase = segmentRandom(site.i, idx, 872) * Math.PI * 2
  const seed = site.i * 311 + site.hj * 41 + idx * 23

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * speed + phase
    const z = site.cz + Math.sin(t) * half
    ref.current.position.set(site.x + xOff, 0.075, z)
    const vz = Math.cos(t) * half * speed
    ref.current.rotation.y = vz >= 0 ? 0 : Math.PI
  })

  return (
    <group ref={ref}>
      <SimpleWalker seed={seed} scale={0.88 + segmentRandom(site.i, idx, 873) * 0.14} />
    </group>
  )
}

function SidewalkWalkerVertical({ slot }: { slot: SidewalkAlongVertical }) {
  const ref = useRef<THREE.Group>(null)
  const speed = 0.22 + segmentRandom(slot.vi, slot.j, 880) * 0.32
  const phase = segmentRandom(slot.vi, slot.j, 881) * Math.PI * 2
  const seed = slot.vi * 227 + slot.j * 53

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * speed + phase
    const u = (Math.sin(t) + 1) / 2
    const z = slot.zMin + u * (slot.zMax - slot.zMin)
    ref.current.position.set(slot.x, 0.055, z)
    const vz = Math.cos(t)
    ref.current.rotation.y = vz >= 0 ? 0 : Math.PI
  })

  return (
    <group ref={ref}>
      <SimpleWalker seed={seed} scale={0.86 + segmentRandom(slot.vi, slot.j, 882) * 0.12} />
    </group>
  )
}

function SidewalkWalkerHorizontal({ slot }: { slot: SidewalkAlongHorizontal }) {
  const ref = useRef<THREE.Group>(null)
  const speed = 0.22 + segmentRandom(slot.i, slot.hj, 890) * 0.32
  const phase = segmentRandom(slot.i, slot.hj, 891) * Math.PI * 2
  const seed = slot.i * 199 + slot.hj * 61

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * speed + phase
    const u = (Math.sin(t) + 1) / 2
    const x = slot.xMin + u * (slot.xMax - slot.xMin)
    ref.current.position.set(x, 0.055, slot.z)
    const vx = Math.cos(t)
    ref.current.rotation.y = vx >= 0 ? -Math.PI / 2 : Math.PI / 2
  })

  return (
    <group ref={ref}>
      <SimpleWalker seed={seed} scale={0.86 + segmentRandom(slot.i, slot.hj, 892) * 0.12} />
    </group>
  )
}

/** Animated figures at zebra crossings and on murram strips beside roads. */
export function Pedestrians() {
  const zebraNodes = useMemo(() => {
    const out: ReactNode[] = []
    for (const s of ZEBRA_VERTICAL_SITES) {
      if (segmentRandom(s.vi, s.j, 848) > 0.78) continue
      const n = 1 + Math.floor(segmentRandom(s.vi, s.j, 849) * 3)
      for (let p = 0; p < n; p++) {
        out.push(<CrosserVertical key={`${s.key}-p${p}`} site={s} idx={p} />)
      }
    }
    for (const s of ZEBRA_HORIZONTAL_SITES) {
      if (segmentRandom(s.i, s.hj, 858) > 0.78) continue
      const n = 1 + Math.floor(segmentRandom(s.i, s.hj, 859) * 3)
      for (let p = 0; p < n; p++) {
        out.push(<CrosserHorizontal key={`${s.key}-p${p}`} site={s} idx={p} />)
      }
    }
    return out
  }, [])

  const sidewalkNodes = useMemo(() => {
    const out: ReactNode[] = []
    for (const s of SIDEWALK_VERTICAL_SLOTS) {
      out.push(<SidewalkWalkerVertical key={s.key} slot={s} />)
    }
    for (const s of SIDEWALK_HORIZONTAL_SLOTS) {
      out.push(<SidewalkWalkerHorizontal key={s.key} slot={s} />)
    }
    return out
  }, [])

  return (
    <group>
      {zebraNodes}
      {sidewalkNodes}
    </group>
  )
}
