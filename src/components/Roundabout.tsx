import { useMemo } from 'react'
import * as THREE from 'three'

const grass = {
  color: '#2d5a27',
  roughness: 0.9,
  metalness: 0,
} as const

type Props = {
  /** World XZ center (intersection of two road strips). */
  cx: number
  cz: number
  /** Outer radius of circulatory carriageway. */
  outerR?: number
  /** Inner island radius. */
  innerR?: number
}

/**
 * Kampala-style roundabout overlay: annulus tarmac, green island, simple clock tower.
 * Sits slightly above grid roads to reduce z-fighting; circulatory lane is visual guide.
 */
export function Roundabout({ cx, cz, outerR = 11, innerR = 3.8 }: Props) {
  const tarmacMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1c1c1c',
        roughness: 0.92,
        metalness: 0.03,
      }),
    [],
  )

  const ringGeo = useMemo(
    () => new THREE.RingGeometry(innerR, outerR, 48),
    [innerR, outerR],
  )

  return (
    <group position={[cx, 0.055, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={tarmacMat} geometry={ringGeo} />
      {/* White edge hint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[outerR - 0.12, outerR, 48]} />
        <meshBasicMaterial color="#e5e5e5" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[innerR, 32]} />
        <meshStandardMaterial {...grass} />
      </mesh>
      {/* Clock tower — low-poly landmark */}
      <group position={[0, 0.02, 0]}>
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.55, 0.65, 0.8, 10]} />
          <meshStandardMaterial color="#78716c" roughness={0.75} />
        </mesh>
        <mesh position={[0, 1.05, 0]} castShadow>
          <cylinderGeometry args={[0.42, 0.5, 0.9, 8]} />
          <meshStandardMaterial color="#a8a29e" roughness={0.65} />
        </mesh>
        <mesh position={[0, 1.75, 0]} castShadow>
          <coneGeometry args={[0.55, 0.5, 4]} />
          <meshStandardMaterial color="#44403c" roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.45, 0.46]} rotation={[0.2, 0, 0]}>
          <circleGeometry args={[0.22, 20]} />
          <meshStandardMaterial color="#fefce8" emissive="#fef08a" emissiveIntensity={0.15} />
        </mesh>
      </group>
    </group>
  )
}
