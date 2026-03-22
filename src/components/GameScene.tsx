import type { RapierRigidBody } from '@react-three/rapier'
import { Physics } from '@react-three/rapier'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CITY_TOTAL } from '@game/cityGrid'
import { useGameStore } from '../store/useGameStore'
import { Boda } from './Boda'
import { CityMap } from './CityMap'
import { CityMapErrorBoundary } from './CityMapErrorBoundary'
import { Pedestrians } from './Pedestrians'
import { RoadTraffic } from './RoadTraffic'
import { getSunDirection, HorizonSky } from './HorizonSky'
import { ThirdPersonCamera } from './ThirdPersonCamera'

export function GameScene() {
  const bodaRef = useRef<RapierRigidBody>(null)
  const setSpeedKmh = useGameStore((s) => s.setSpeedKmh)
  const [offroad, setOffroad] = useState(false)

  const sunLightPosition = useMemo(() => {
    return getSunDirection(new THREE.Vector3()).multiplyScalar(168)
  }, [])

  /** Tight ortho frustum around playable city → better shadow texel use than ±110 with a huge map. */
  const shadowHalf = CITY_TOTAL / 2 + 48

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
        shadow-mapSize={[512, 512]}
        shadow-normalBias={0.06}
        shadow-camera-near={0.5}
        shadow-camera-far={130}
        shadow-camera-left={-shadowHalf}
        shadow-camera-right={shadowHalf}
        shadow-camera-top={shadowHalf}
        shadow-camera-bottom={-shadowHalf}
      />

      <Physics gravity={[0, -16, 0]} interpolate={false}>
        <CityMapErrorBoundary>
          <CityMap />
        </CityMapErrorBoundary>
        <Boda
          ref={bodaRef}
          onSpeedKmhChange={setSpeedKmh}
          onOffroadChange={setOffroad}
        />
        <RoadTraffic />
        <Pedestrians />
        <ThirdPersonCamera rigidBodyRef={bodaRef} roughRide={offroad} />
      </Physics>
    </>
  )
}
