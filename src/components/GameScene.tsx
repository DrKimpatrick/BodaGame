import type { RapierRigidBody } from '@react-three/rapier'
import { Physics } from '@react-three/rapier'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../store/useGameStore'
import { Boda } from './Boda'
import { CityMap } from './CityMap'
import { getSunDirection, HorizonSky } from './HorizonSky'
import { ThirdPersonCamera } from './ThirdPersonCamera'

export function GameScene() {
  const bodaRef = useRef<RapierRigidBody>(null)
  const setSpeedKmh = useGameStore((s) => s.setSpeedKmh)
  const [offroad, setOffroad] = useState(false)

  const sunLightPosition = useMemo(() => {
    return getSunDirection(new THREE.Vector3()).multiplyScalar(168)
  }, [])

  return (
    <>
      <HorizonSky />

      <color attach="background" args={['#6d8699']} />
      <fog attach="fog" args={['#8aa9bf', 50, 280]} />

      <ambientLight intensity={0.42} />
      <directionalLight
        castShadow
        intensity={1.12}
        position={sunLightPosition}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
      />

      <Physics gravity={[0, 0, 0]} interpolate>
        <CityMap />
        <Boda
          ref={bodaRef}
          onSpeedKmhChange={setSpeedKmh}
          onOffroadChange={setOffroad}
        />
        <ThirdPersonCamera rigidBodyRef={bodaRef} roughRide={offroad} />
      </Physics>
    </>
  )
}
