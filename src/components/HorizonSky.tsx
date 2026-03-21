import { Cloud, Clouds, Sky, calcPosFromAngles } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

/** Slightly hazy equatorial afternoon — clear horizon, readable cumulus. */
const INCLINATION = 0.52
const AZIMUTH = 0.42

export function HorizonSky() {
  const sunPosition = useMemo(
    () => calcPosFromAngles(INCLINATION, AZIMUTH),
    [],
  )

  return (
    <>
      <Sky
        distance={85000}
        sunPosition={sunPosition}
        inclination={INCLINATION}
        azimuth={AZIMUTH}
        mieCoefficient={0.0028}
        mieDirectionalG={0.88}
        rayleigh={1.35}
        turbidity={3.2}
      />

      <group position={[0, 480, 0]}>
        <Clouds
          material={THREE.MeshBasicMaterial}
          limit={200}
          frustumCulled={false}
        >
          <Cloud
            seed={11}
            position={[0, 220, -3200]}
            segments={44}
            bounds={[5200, 200, 1100]}
            volume={720}
            fade={2200}
            opacity={0.98}
            speed={0.06}
            color="#ffffff"
          />
          <Cloud
            seed={22}
            position={[2800, 160, 200]}
            segments={40}
            bounds={[3600, 240, 950]}
            volume={640}
            fade={1900}
            opacity={0.94}
            speed={0.08}
            color="#f4f8ff"
          />
          <Cloud
            seed={33}
            position={[-3000, 200, 600]}
            segments={42}
            bounds={[4000, 220, 1000]}
            volume={680}
            fade={2000}
            opacity={0.96}
            speed={0.055}
            color="#ffffff"
          />
          <Cloud
            seed={44}
            position={[800, 260, 2800]}
            segments={38}
            bounds={[3200, 180, 850]}
            volume={560}
            fade={1700}
            opacity={0.9}
            speed={0.07}
            color="#e8f0fc"
          />
          <Cloud
            seed={55}
            position={[-1200, 140, -1400]}
            segments={36}
            bounds={[2400, 160, 700]}
            volume={480}
            fade={1500}
            opacity={0.85}
            speed={0.09}
            color="#ffffff"
          />
        </Clouds>
      </group>
    </>
  )
}

/** Sun direction for matching directional lights to the sky dome. */
export function getSunDirection(out = new THREE.Vector3()) {
  return out.copy(calcPosFromAngles(INCLINATION, AZIMUTH)).normalize()
}
