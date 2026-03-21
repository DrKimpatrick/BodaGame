import { useFrame } from '@react-three/fiber'
import type { MutableRefObject, ReactNode, RefObject } from 'react'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  CapsuleCollider,
  type CollisionEnterPayload,
  type RapierRigidBody,
  RigidBody,
} from '@react-three/rapier'
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

function pedCollisionHandler(
  knockedRef: MutableRefObject<boolean>,
  knockBlendRef: MutableRefObject<number>,
  rbRef: RefObject<RapierRigidBody | null>,
  freezeRef: MutableRefObject<{
    x: number
    y: number
    z: number
    yaw: number
  } | null>,
  legsFrozenRef: MutableRefObject<boolean>,
) {
  return ({ other }: CollisionEnterPayload) => {
    const ud = other.rigidBodyObject?.userData as { kind?: string } | undefined
    if (ud?.kind !== 'bike' || knockedRef.current) return
    knockedRef.current = true
    legsFrozenRef.current = true
    knockBlendRef.current = 0
    const rb = rbRef.current
    if (!rb) return
    const t = rb.translation()
    const r = rb.rotation()
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w)
    const eq = new THREE.Euler().setFromQuaternion(q, 'YXZ')
    freezeRef.current = { x: t.x, y: t.y, z: t.z, yaw: eq.y }
  }
}

/** Low-poly walker; `seed` drives outfit colours. */
function SimpleWalker({
  seed,
  scale = 1,
  legsFrozenRef,
}: {
  seed: number
  scale?: number
  legsFrozenRef?: RefObject<boolean>
}) {
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
    if (legsFrozenRef?.current) return
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
  const rbRef = useRef<RapierRigidBody | null>(null)
  const knockedRef = useRef(false)
  const knockBlendRef = useRef(0)
  const freezeRef = useRef<{
    x: number
    y: number
    z: number
    yaw: number
  } | null>(null)
  const legsFrozenRef = useRef(false)
  const half = ROAD_W * 0.36
  const speed = 0.38 + segmentRandom(site.vi, idx, 860) * 0.55
  const zOff = (idx - 0.9) * 0.38 + (segmentRandom(site.vi, idx, 861) - 0.5) * 0.28
  const phase = segmentRandom(site.vi, idx, 862) * Math.PI * 2
  const seed = site.vi * 409 + site.j * 37 + idx * 19

  const onCollisionEnter = useMemo(
    () =>
      pedCollisionHandler(knockedRef, knockBlendRef, rbRef, freezeRef, legsFrozenRef),
    [],
  )

  useFrame(({ clock }, dt) => {
    const rb = rbRef.current
    if (!rb) return
    if (knockedRef.current && freezeRef.current) {
      knockBlendRef.current = Math.min(1, knockBlendRef.current + dt * 1.2)
      const e = 1 - (1 - knockBlendRef.current) ** 2
      const f = freezeRef.current
      const pitch = THREE.MathUtils.lerp(0, 1.42, e)
      const roll = Math.sin(f.yaw * 2.7 + idx) * 0.2 * e
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(pitch, f.yaw, roll, 'YXZ'),
      )
      rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
      rb.setTranslation(
        {
          x: f.x,
          y: THREE.MathUtils.lerp(f.y, 0.03, e),
          z: f.z,
        },
        true,
      )
      return
    }
    const t = clock.elapsedTime * speed + phase
    const x = site.cx + Math.sin(t) * half
    const z = site.z + zOff
    const vx = Math.cos(t) * half * speed
    const ry = vx >= 0 ? -Math.PI / 2 : Math.PI / 2
    rb.setTranslation({ x, y: 0.075, z }, true)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry)
    rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
  })

  return (
    <RigidBody
      ref={rbRef}
      type="kinematicPosition"
      colliders={false}
      mass={0.85}
      friction={0.9}
      restitution={0.02}
      userData={{ kind: 'pedestrian' }}
      canSleep={false}
      onCollisionEnter={onCollisionEnter}
    >
      <CapsuleCollider args={[0.44, 0.2]} position={[0, 0.66, 0]} />
      <SimpleWalker
        seed={seed}
        scale={0.88 + segmentRandom(site.vi, idx, 863) * 0.14}
        legsFrozenRef={legsFrozenRef}
      />
    </RigidBody>
  )
}

function CrosserHorizontal({ site, idx }: { site: ZebraHorizontalSite; idx: number }) {
  const rbRef = useRef<RapierRigidBody | null>(null)
  const knockedRef = useRef(false)
  const knockBlendRef = useRef(0)
  const freezeRef = useRef<{
    x: number
    y: number
    z: number
    yaw: number
  } | null>(null)
  const legsFrozenRef = useRef(false)
  const half = ROAD_W * 0.36
  const speed = 0.38 + segmentRandom(site.i, idx, 870) * 0.55
  const xOff = (idx - 0.9) * 0.38 + (segmentRandom(site.i, idx, 871) - 0.5) * 0.28
  const phase = segmentRandom(site.i, idx, 872) * Math.PI * 2
  const seed = site.i * 311 + site.hj * 41 + idx * 23

  const onCollisionEnter = useMemo(
    () =>
      pedCollisionHandler(knockedRef, knockBlendRef, rbRef, freezeRef, legsFrozenRef),
    [],
  )

  useFrame(({ clock }, dt) => {
    const rb = rbRef.current
    if (!rb) return
    if (knockedRef.current && freezeRef.current) {
      knockBlendRef.current = Math.min(1, knockBlendRef.current + dt * 1.2)
      const e = 1 - (1 - knockBlendRef.current) ** 2
      const f = freezeRef.current
      const pitch = THREE.MathUtils.lerp(0, 1.42, e)
      const roll = Math.sin(f.yaw * 2.7 + idx) * 0.2 * e
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(pitch, f.yaw, roll, 'YXZ'),
      )
      rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
      rb.setTranslation(
        {
          x: f.x,
          y: THREE.MathUtils.lerp(f.y, 0.03, e),
          z: f.z,
        },
        true,
      )
      return
    }
    const t = clock.elapsedTime * speed + phase
    const z = site.cz + Math.sin(t) * half
    const vz = Math.cos(t) * half * speed
    const ry = vz >= 0 ? 0 : Math.PI
    rb.setTranslation({ x: site.x + xOff, y: 0.075, z }, true)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry)
    rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
  })

  return (
    <RigidBody
      ref={rbRef}
      type="kinematicPosition"
      colliders={false}
      mass={0.85}
      friction={0.9}
      restitution={0.02}
      userData={{ kind: 'pedestrian' }}
      canSleep={false}
      onCollisionEnter={onCollisionEnter}
    >
      <CapsuleCollider args={[0.44, 0.2]} position={[0, 0.66, 0]} />
      <SimpleWalker
        seed={seed}
        scale={0.88 + segmentRandom(site.i, idx, 873) * 0.14}
        legsFrozenRef={legsFrozenRef}
      />
    </RigidBody>
  )
}

/** Multiple walkers per sidewalk segment (staggered along + slight X spread). */
const SIDEWALK_WALKERS_PER_SEGMENT = 3

function SidewalkWalkerVertical({
  slot,
  pathIndex,
}: {
  slot: SidewalkAlongVertical
  pathIndex: number
}) {
  const rbRef = useRef<RapierRigidBody | null>(null)
  const knockedRef = useRef(false)
  const knockBlendRef = useRef(0)
  const freezeRef = useRef<{
    x: number
    y: number
    z: number
    yaw: number
  } | null>(null)
  const legsFrozenRef = useRef(false)
  const speed =
    (0.2 + segmentRandom(slot.vi, slot.j, 880 + pathIndex) * 0.34) *
    (1 + pathIndex * 0.04)
  const phase =
    segmentRandom(slot.vi, slot.j, 881 + pathIndex) * Math.PI * 2 +
    pathIndex * 1.85
  const xSpread = (pathIndex - (SIDEWALK_WALKERS_PER_SEGMENT - 1) / 2) * 0.36
  const seed = slot.vi * 227 + slot.j * 53 + pathIndex * 59

  const onCollisionEnter = useMemo(
    () =>
      pedCollisionHandler(knockedRef, knockBlendRef, rbRef, freezeRef, legsFrozenRef),
    [],
  )

  useFrame(({ clock }, dt) => {
    const rb = rbRef.current
    if (!rb) return
    if (knockedRef.current && freezeRef.current) {
      knockBlendRef.current = Math.min(1, knockBlendRef.current + dt * 1.2)
      const e = 1 - (1 - knockBlendRef.current) ** 2
      const f = freezeRef.current
      const pitch = THREE.MathUtils.lerp(0, 1.42, e)
      const roll = Math.sin(f.yaw * 2.7) * 0.2 * e
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(pitch, f.yaw, roll, 'YXZ'),
      )
      rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
      rb.setTranslation(
        {
          x: f.x,
          y: THREE.MathUtils.lerp(f.y, 0.03, e),
          z: f.z,
        },
        true,
      )
      return
    }
    const t = clock.elapsedTime * speed + phase
    const u = (Math.sin(t) + 1) / 2
    const z = slot.zMin + u * (slot.zMax - slot.zMin)
    const vz = Math.cos(t)
    const ry = vz >= 0 ? 0 : Math.PI
    rb.setTranslation({ x: slot.x + xSpread, y: 0.055, z }, true)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry)
    rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
  })

  return (
    <RigidBody
      ref={rbRef}
      type="kinematicPosition"
      colliders={false}
      mass={0.85}
      friction={0.9}
      restitution={0.02}
      userData={{ kind: 'pedestrian' }}
      canSleep={false}
      onCollisionEnter={onCollisionEnter}
    >
      <CapsuleCollider args={[0.44, 0.2]} position={[0, 0.64, 0]} />
      <SimpleWalker
        seed={seed}
        scale={0.86 + segmentRandom(slot.vi, slot.j, 882 + pathIndex) * 0.12}
        legsFrozenRef={legsFrozenRef}
      />
    </RigidBody>
  )
}

function SidewalkWalkerHorizontal({
  slot,
  pathIndex,
}: {
  slot: SidewalkAlongHorizontal
  pathIndex: number
}) {
  const rbRef = useRef<RapierRigidBody | null>(null)
  const knockedRef = useRef(false)
  const knockBlendRef = useRef(0)
  const freezeRef = useRef<{
    x: number
    y: number
    z: number
    yaw: number
  } | null>(null)
  const legsFrozenRef = useRef(false)
  const speed =
    (0.2 + segmentRandom(slot.i, slot.hj, 890 + pathIndex) * 0.34) *
    (1 + pathIndex * 0.04)
  const phase =
    segmentRandom(slot.i, slot.hj, 891 + pathIndex) * Math.PI * 2 +
    pathIndex * 1.85
  const zSpread = (pathIndex - (SIDEWALK_WALKERS_PER_SEGMENT - 1) / 2) * 0.36
  const seed = slot.i * 199 + slot.hj * 61 + pathIndex * 59

  const onCollisionEnter = useMemo(
    () =>
      pedCollisionHandler(knockedRef, knockBlendRef, rbRef, freezeRef, legsFrozenRef),
    [],
  )

  useFrame(({ clock }, dt) => {
    const rb = rbRef.current
    if (!rb) return
    if (knockedRef.current && freezeRef.current) {
      knockBlendRef.current = Math.min(1, knockBlendRef.current + dt * 1.2)
      const e = 1 - (1 - knockBlendRef.current) ** 2
      const f = freezeRef.current
      const pitch = THREE.MathUtils.lerp(0, 1.42, e)
      const roll = Math.sin(f.yaw * 2.7) * 0.2 * e
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(pitch, f.yaw, roll, 'YXZ'),
      )
      rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
      rb.setTranslation(
        {
          x: f.x,
          y: THREE.MathUtils.lerp(f.y, 0.03, e),
          z: f.z,
        },
        true,
      )
      return
    }
    const t = clock.elapsedTime * speed + phase
    const u = (Math.sin(t) + 1) / 2
    const x = slot.xMin + u * (slot.xMax - slot.xMin)
    const vx = Math.cos(t)
    const ry = vx >= 0 ? -Math.PI / 2 : Math.PI / 2
    rb.setTranslation({ x, y: 0.055, z: slot.z + zSpread }, true)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry)
    rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
  })

  return (
    <RigidBody
      ref={rbRef}
      type="kinematicPosition"
      colliders={false}
      mass={0.85}
      friction={0.9}
      restitution={0.02}
      userData={{ kind: 'pedestrian' }}
      canSleep={false}
      onCollisionEnter={onCollisionEnter}
    >
      <CapsuleCollider args={[0.44, 0.2]} position={[0, 0.64, 0]} />
      <SimpleWalker
        seed={seed}
        scale={0.86 + segmentRandom(slot.i, slot.hj, 892 + pathIndex) * 0.12}
        legsFrozenRef={legsFrozenRef}
      />
    </RigidBody>
  )
}

/** Animated figures at zebra crossings and on murram strips — solid vs boda, knockdown on hit. */
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
      for (let w = 0; w < SIDEWALK_WALKERS_PER_SEGMENT; w++) {
        out.push(
          <SidewalkWalkerVertical key={`${s.key}-w${w}`} slot={s} pathIndex={w} />,
        )
      }
    }
    for (const s of SIDEWALK_HORIZONTAL_SLOTS) {
      for (let w = 0; w < SIDEWALK_WALKERS_PER_SEGMENT; w++) {
        out.push(
          <SidewalkWalkerHorizontal key={`${s.key}-w${w}`} slot={s} pathIndex={w} />,
        )
      }
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
