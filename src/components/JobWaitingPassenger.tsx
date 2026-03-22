import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import {
  jobPassengerBagMat,
  jobPassengerCoatBlueMat,
  jobPassengerCoatRedMat,
  jobPassengerPantsMat,
  jobPassengerSkinMat,
} from '@game/jobPassengerMaterials'
import { useGameStore } from '../store/useGameStore'

/**
 * Fare at pickup: red/blue coat, bag, waves toward the bike; faces rider using throttled bike XZ.
 */
export function JobWaitingPassenger() {
  const job = useGameStore((s) => s.rideJob)
  const rootRef = useRef<THREE.Group>(null)
  const waveArmRef = useRef<THREE.Group>(null)
  const legLRef = useRef<THREE.Group>(null)
  const legRRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const jobNow = useGameStore.getState().rideJob
    const g = rootRef.current
    if (!g || !jobNow || jobNow.phase !== 'pickup') return

    const bx = useGameStore.getState().bikeMapX
    const bz = useGameStore.getState().bikeMapZ
    const dx = bx - jobNow.pickup.x
    const dz = bz - jobNow.pickup.z
    if (Math.abs(dx) + Math.abs(dz) > 0.4) {
      g.rotation.y = Math.atan2(dx, dz)
    }

    g.position.set(
      jobNow.pickup.x,
      Math.sin(clock.elapsedTime * 2.2) * 0.028,
      jobNow.pickup.z,
    )

    const wt = clock.elapsedTime * 5.2
    if (waveArmRef.current) {
      waveArmRef.current.rotation.z = Math.sin(wt) * 0.95 - 0.15
      waveArmRef.current.rotation.x = 0.42 + Math.sin(wt * 1.03) * 0.12
    }

    const legW = Math.sin(clock.elapsedTime * 6.2) * 0.05
    if (legLRef.current) legLRef.current.rotation.x = legW
    if (legRRef.current) legRRef.current.rotation.x = -legW
  })

  if (!job || job.phase !== 'pickup') return null

  return (
    <group ref={rootRef} position={[job.pickup.x, 0, job.pickup.z]}>
      <group position={[0.44, 0, 0]}>
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

        <group position={[-0.17, 1.2, 0]} rotation={[0.2, 0, 0.38]}>
          <mesh position={[0, -0.1, 0]} castShadow material={jobPassengerCoatRedMat}>
            <boxGeometry args={[0.08, 0.22, 0.08]} />
          </mesh>
          <mesh
            position={[-0.1, -0.26, 0.05]}
            rotation={[0.08, 0, 0.15]}
            castShadow
            material={jobPassengerBagMat}
          >
            <boxGeometry args={[0.16, 0.2, 0.11]} />
          </mesh>
          <mesh
            position={[-0.02, -0.12, 0.09]}
            rotation={[1.2, 0, 0]}
            castShadow
            material={jobPassengerBagMat}
          >
            <torusGeometry args={[0.05, 0.014, 6, 10]} />
          </mesh>
        </group>

        <group ref={waveArmRef} position={[0.16, 1.25, 0]}>
          <mesh position={[0.06, -0.14, 0]} rotation={[0.25, 0, -0.55]} castShadow material={jobPassengerCoatBlueMat}>
            <boxGeometry args={[0.08, 0.28, 0.08]} />
          </mesh>
        </group>

        <group ref={legLRef} position={[-0.08, 0.68, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow material={jobPassengerPantsMat}>
            <boxGeometry args={[0.1, 0.36, 0.1]} />
          </mesh>
        </group>
        <group ref={legRRef} position={[0.08, 0.68, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow material={jobPassengerPantsMat}>
            <boxGeometry args={[0.1, 0.36, 0.1]} />
          </mesh>
        </group>
        </group>
      </group>
    </group>
  )
}
