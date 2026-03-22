import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  jobPassengerCoatBlueMat,
  jobPassengerCoatRedMat,
  jobPassengerPantsMat,
  jobPassengerSkinMat,
} from '@game/jobPassengerMaterials'
import { segmentRandom } from '@game/roadDecorPlacements'
import { useGameStore } from '../store/useGameStore'

/**
 * Static fare waiting at the job pickup: red / blue split coat so they read clearly vs walking peds.
 */
export function JobWaitingPassenger() {
  const job = useGameStore((s) => s.rideJob)
  const rootRef = useRef<THREE.Group>(null)

  const yaw = useMemo(() => {
    if (!job || job.phase !== 'pickup') return 0
    return (
      segmentRandom(
        Math.floor(job.pickup.x * 1000),
        Math.floor(job.pickup.z * 1000),
        991,
      ) * Math.PI *
      2
    )
  }, [job])

  useFrame(({ clock }) => {
    const g = rootRef.current
    if (!g) return
    const w = Math.sin(clock.elapsedTime * 2.2) * 0.035
    g.position.y = w
  })

  if (!job || job.phase !== 'pickup') return null

  return (
    <group
      ref={rootRef}
      position={[job.pickup.x, 0, job.pickup.z]}
      rotation={[0, yaw, 0]}
    >
      <group position={[0, -0.33, 0]}>
        <mesh position={[0, 1.38, 0]} castShadow material={jobPassengerSkinMat}>
          <sphereGeometry args={[0.12, 10, 10]} />
        </mesh>
        <mesh position={[-0.075, 0.98, 0]} castShadow material={jobPassengerCoatRedMat}>
          <boxGeometry args={[0.15, 0.52, 0.19]} />
        </mesh>
        <mesh position={[0.075, 0.98, 0]} castShadow material={jobPassengerCoatBlueMat}>
          <boxGeometry args={[0.15, 0.52, 0.19]} />
        </mesh>
        <mesh position={[-0.08, 0.68, 0]} castShadow material={jobPassengerPantsMat}>
          <boxGeometry args={[0.1, 0.36, 0.1]} />
        </mesh>
        <mesh position={[0.08, 0.68, 0]} castShadow material={jobPassengerPantsMat}>
          <boxGeometry args={[0.1, 0.36, 0.1]} />
        </mesh>
      </group>
      <mesh position={[0, 0.072, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.55, 28]} />
        <meshStandardMaterial
          color="#facc15"
          emissive="#a16207"
          emissiveIntensity={0.25}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
