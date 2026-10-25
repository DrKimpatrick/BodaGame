import { Cloud, Clouds, Sky, calcPosFromAngles } from '@react-three/drei'
import { AZIMUTH, cloudTextureUrl, sunInclination, type SkyWeather } from './sky'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'


type BirdDatum = {
  r: number
  a0: number
  y: number
  spd: number
  flap: number
}

function SkyBirds({ count = 32 }: { count?: number }) {
  const root = useRef<THREE.Group>(null)
  const data = useMemo<BirdDatum[]>(() => {
    const out: BirdDatum[] = []
    for (let i = 0; i < count; i++) {
      const ring = Math.floor(i / 8)
      const t = Math.sin(i * 12.9898 + 78.233) * 43758.5453123
      const r01 = t - Math.floor(t)
      out.push({
        r: 580 + ring * 70 + r01 * 40,
        a0: (i / count) * Math.PI * 2 + r01 * 2.1,
        y: 88 + (i % 6) * 16 + ring * 10,
        spd: 0.35 + (i % 4) * 0.12,
        flap: i * 0.73,
      })
    }
    return out
  }, [count])

  useFrame(({ clock }) => {
    const g = root.current
    if (!g) return
    const t = clock.elapsedTime
    g.children.forEach((bird, i) => {
      const d = data[i]!
      const a = d.a0 + t * d.spd * 0.07
      const flap = Math.sin(t * 6 + d.flap) * 1.1
      bird.position.set(Math.cos(a) * d.r, d.y + flap, Math.sin(a) * d.r)
      bird.rotation.y = -a + Math.PI / 2
    })
  })

  return (
    <group ref={root}>
      {data.map((_, i) => (
        <group key={i}>
          <mesh position={[0.14, 0, 0]} rotation={[0, 0, -0.5]}>
            <boxGeometry args={[0.52, 0.07, 0.18]} />
            <meshBasicMaterial color="#0f172a" toneMapped={false} />
          </mesh>
          <mesh position={[-0.14, 0, 0]} rotation={[0, 0, 0.5]}>
            <boxGeometry args={[0.52, 0.07, 0.18]} />
            <meshBasicMaterial color="#0f172a" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

type SkyProps = { weather?: SkyWeather; quality?: 'low' | 'medium' | 'high' }

const CLOUDS = [
  { seed: 11, position: [0, 220, -3200], segments: 44, bounds: [5200, 200, 1100], volume: 720, fade: 2200, speed: 0.06 },
  { seed: 22, position: [2800, 160, 200], segments: 40, bounds: [3600, 240, 950], volume: 640, fade: 1900, speed: 0.08 },
  { seed: 33, position: [-3000, 200, 600], segments: 42, bounds: [4000, 220, 1000], volume: 680, fade: 2000, speed: 0.055 },
  { seed: 44, position: [800, 260, 2800], segments: 38, bounds: [3200, 180, 850], volume: 560, fade: 1700, speed: 0.07 },
  { seed: 55, position: [-1200, 140, -1400], segments: 36, bounds: [2400, 160, 700], volume: 480, fade: 1500, speed: 0.09 },
] as const

export function HorizonSky({ weather = 'clear', quality = 'high' }: SkyProps) {
  const sunPosition = useMemo(
    () => calcPosFromAngles(sunInclination(weather), AZIMUTH),
    [weather],
  )
  // Big transparent cloud sprites are fill-rate heavy: phones get fewer, lighter clouds.
  const cloudCount = quality === 'low' ? 2 : quality === 'medium' ? 3 : 5
  const segScale = quality === 'low' ? 0.45 : quality === 'medium' ? 0.7 : 1
  const cloudColor = weather === 'rain' ? '#7d8590' : weather === 'dusk' ? '#f2b38a' : '#ffffff'

  return (
    <>
      <Sky
        distance={85000}
        sunPosition={sunPosition}
        mieCoefficient={weather === 'rain' ? 0.02 : 0.0028}
        mieDirectionalG={0.88}
        rayleigh={weather === 'rain' ? 0.6 : weather === 'dusk' ? 2.6 : 1.35}
        turbidity={weather === 'rain' ? 14 : weather === 'dusk' ? 6 : 3.2}
      />

      {weather === 'clear' && quality !== 'low' ? <SkyBirds count={36} /> : null}

      <group position={[0, 480, 0]}>
        <Clouds material={THREE.MeshBasicMaterial} limit={quality === 'low' ? 60 : 200} frustumCulled={false} texture={cloudTextureUrl()}>
          {CLOUDS.slice(0, cloudCount).map((c) => (
            <Cloud
              key={c.seed}
              seed={c.seed}
              position={c.position as unknown as [number, number, number]}
              segments={Math.round(c.segments * segScale)}
              bounds={c.bounds as unknown as [number, number, number]}
              volume={c.volume}
              fade={c.fade}
              opacity={weather === 'rain' ? 1 : 0.94}
              speed={c.speed}
              color={cloudColor}
            />
          ))}
        </Clouds>
      </group>
    </>
  )
}
