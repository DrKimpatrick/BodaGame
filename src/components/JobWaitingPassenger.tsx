import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import {
  jobPassengerBagMat,
  jobPassengerCoatBlueMat,
  jobPassengerCoatRedMat,
  jobPassengerPantsMat,
} from '@game/jobPassengerMaterials'
import { useGameStore } from '../store/useGameStore'
import { armGeometry, faceAtlas, faceCell, headGeometry, legGeometry, shoeGeometry, SKIN_TONES, skirtGeometry, torsoGeometry, wrapGeometry } from './realism/people'

const TONE = 1
const parts = {
  torso: torsoGeometry(true),
  skirt: skirtGeometry(),
  leg: legGeometry(),
  arm: armGeometry(),
  shoe: shoeGeometry(),
  wrap: wrapGeometry(),
  head: (() => {
    const g = headGeometry()
    const [u, v] = faceCell(TONE, 0)
    const uv = g.attributes.uv!
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + u, uv.getY(i) + v)
    return g
  })(),
}
const faceMaterial = new THREE.MeshStandardMaterial({ map: faceAtlas(), roughness: 0.6 })
const skinMaterial = new THREE.MeshStandardMaterial({ color: SKIN_TONES[TONE], roughness: 0.6 })

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
      // Arm up, hand waving from side to side.
      waveArmRef.current.rotation.z = 2.55 + Math.sin(wt) * 0.32
      waveArmRef.current.rotation.x = 0.12
    }

    const legW = Math.sin(clock.elapsedTime * 6.2) * 0.05
    if (legLRef.current) legLRef.current.rotation.x = legW
    if (legRRef.current) legRRef.current.rotation.x = -legW
  })

  if (!job || job.phase !== 'pickup') return null

  return (
    <group ref={rootRef} position={[job.pickup.x, 0, job.pickup.z]}>
      {/* A body like everyone else's, waving so she's easy to spot, with a bag on the other arm */}
      <mesh geometry={parts.torso} position={[0, 1.17, 0]} material={jobPassengerCoatRedMat} castShadow />
      <mesh geometry={parts.skirt} position={[0, 0.98, 0]} material={jobPassengerCoatBlueMat} castShadow />
      <mesh geometry={parts.head} position={[0, 1.57, 0.005]} material={faceMaterial} castShadow />
      <mesh geometry={parts.wrap} position={[0, 1.6, 0]} material={jobPassengerCoatBlueMat} />
      <group ref={legLRef} position={[0.085, 0.84, 0]}>
        <mesh geometry={parts.leg} material={skinMaterial} castShadow />
        <mesh geometry={parts.shoe} position={[0, -0.79, 0.02]} material={jobPassengerPantsMat} />
      </group>
      <group ref={legRRef} position={[-0.085, 0.84, 0]}>
        <mesh geometry={parts.leg} material={skinMaterial} castShadow />
        <mesh geometry={parts.shoe} position={[0, -0.79, 0.02]} material={jobPassengerPantsMat} />
      </group>
      <group position={[-0.18, 1.34, 0]} rotation={[0, 0, -0.09]}>
        <mesh geometry={parts.arm} material={skinMaterial} castShadow />
        <mesh position={[-0.02, -0.72, 0.02]} castShadow material={jobPassengerBagMat}>
          <boxGeometry args={[0.1, 0.22, 0.28]} />
        </mesh>
      </group>
      <group ref={waveArmRef} position={[0.18, 1.34, 0]}>
        <mesh geometry={parts.arm} material={skinMaterial} castShadow />
      </group>
    </group>
  )
}
