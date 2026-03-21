import { useRef } from 'react'
import * as THREE from 'three'
import { Boda } from './Boda'
import { CityMap } from './CityMap'
import { ThirdPersonCamera } from './ThirdPersonCamera'

export function GameScene() {
  const bodaRef = useRef<THREE.Group>(null)

  return (
    <>
      <color attach="background" args={['#0f1014']} />
      <fog attach="fog" args={['#0f1014', 45, 240]} />

      <ambientLight intensity={0.35} />
      <directionalLight
        castShadow
        intensity={1.15}
        position={[18, 28, 12]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
      />

      <CityMap />
      <Boda ref={bodaRef} />
      <ThirdPersonCamera target={bodaRef} />
    </>
  )
}
