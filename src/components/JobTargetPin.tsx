import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../store/useGameStore'

/**
 * Map-style location pin at the active job target (pickup or drop-off), with a gentle float.
 * Rose at pickup, teal at drop-off.
 */
export function JobTargetPin() {
  const job = useGameStore((s) => s.rideJob)
  const groupRef = useRef<THREE.Group>(null)
  const isPickup = job?.phase === 'pickup'

  const { matBody, matInner, matGlow } = useMemo(() => {
    const pickup = isPickup
    const body = new THREE.MeshStandardMaterial({
      color: pickup ? '#e11d48' : '#0d9488',
      emissive: pickup ? '#881337' : '#134e4a',
      emissiveIntensity: 0.38,
      roughness: 0.4,
      metalness: 0.2,
    })
    const inner = new THREE.MeshStandardMaterial({
      color: pickup ? '#fecdd3' : '#ccfbf1',
      roughness: 0.52,
      metalness: 0.05,
      emissive: pickup ? '#fda4af' : '#5eead4',
      emissiveIntensity: 0.14,
    })
    const glow = new THREE.MeshStandardMaterial({
      color: pickup ? '#e11d48' : '#14b8a6',
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    })
    return { matBody: body, matInner: inner, matGlow: glow }
  }, [isPickup])

  const target = job
    ? job.phase === 'pickup'
      ? job.pickup
      : job.dropoff
    : null

  useFrame(({ clock }) => {
    const g = groupRef.current
    const j = useGameStore.getState().rideJob
    if (!g || !j) return
    const t = j.phase === 'pickup' ? j.pickup : j.dropoff
    const bob = Math.sin(clock.elapsedTime * 2.8) * 0.09
    g.position.set(t.x, 0.02 + bob, t.z)
  })

  if (!job || !target) return null

  return (
    <group ref={groupRef} position={[target.x, 0.02, target.z]}>
      <mesh position={[0, 0.52, 0]} castShadow material={matBody}>
        <sphereGeometry args={[0.2, 18, 14]} />
      </mesh>
      <mesh position={[0, 0.22, 0]} rotation={[Math.PI, 0, 0]} castShadow material={matBody}>
        <coneGeometry args={[0.17, 0.48, 12]} />
      </mesh>
      <mesh position={[0, 0.52, 0.06]} scale={[0.55, 0.55, 0.35]} material={matInner}>
        <sphereGeometry args={[0.2, 12, 10]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} material={matGlow}>
        <circleGeometry args={[0.28, 20]} />
      </mesh>
    </group>
  )
}
