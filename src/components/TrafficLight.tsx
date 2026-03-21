import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/** Red (5s) → Red+Yellow (1s) → Green (5s) → Yellow (2s) → repeat */
const PHASES = [
  { id: 'red' as const, dur: 5 },
  { id: 'red_yellow' as const, dur: 1 },
  { id: 'green' as const, dur: 5 },
  { id: 'yellow' as const, dur: 2 },
] as const
const CYCLE = PHASES.reduce((a, p) => a + p.dur, 0)

type PhaseId = (typeof PHASES)[number]['id']

function phaseAtTime(t: number): PhaseId {
  let u = t % CYCLE
  for (const p of PHASES) {
    if (u < p.dur) return p.id
    u -= p.dur
  }
  return 'red'
}

export function TrafficLight() {
  const start = useRef(typeof performance !== 'undefined' ? performance.now() : 0)

  useEffect(() => {
    start.current = performance.now()
  }, [])

  const redMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1a0505',
        emissive: '#000000',
        emissiveIntensity: 0,
        toneMapped: false,
        roughness: 0.35,
        metalness: 0.05,
      }),
    [],
  )
  const yellowMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1a1403',
        emissive: '#000000',
        emissiveIntensity: 0,
        toneMapped: false,
        roughness: 0.35,
        metalness: 0.05,
      }),
    [],
  )
  const greenMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#031a0a',
        emissive: '#000000',
        emissiveIntensity: 0,
        toneMapped: false,
        roughness: 0.35,
        metalness: 0.05,
      }),
    [],
  )

  const redPt = useRef<THREE.PointLight>(null)
  const yellowPt = useRef<THREE.PointLight>(null)
  const greenPt = useRef<THREE.PointLight>(null)

  useEffect(
    () => () => {
      redMat.dispose()
      yellowMat.dispose()
      greenMat.dispose()
    },
    [redMat, yellowMat, greenMat],
  )

  useFrame(() => {
    const t = (performance.now() - start.current) / 1000
    const phase = phaseAtTime(t)

    const setBulb = (
      mat: THREE.MeshStandardMaterial,
      on: boolean,
      color: string,
      em: string,
      intensity: number,
    ) => {
      mat.color.set(on ? color : '#0d0d0d')
      mat.emissive.set(on ? em : '#000000')
      mat.emissiveIntensity = on ? intensity : 0
    }

    const r = phase === 'red' || phase === 'red_yellow'
    const y = phase === 'red_yellow' || phase === 'yellow'
    const g = phase === 'green'

    setBulb(redMat, r, '#ff2b2b', '#ff1a1a', r ? 3.2 : 0)
    setBulb(yellowMat, y, '#ffd54a', '#ffc107', y ? 3 : 0)
    setBulb(greenMat, g, '#4ade80', '#22c55e', g ? 3.2 : 0)

    if (redPt.current) redPt.current.intensity = r ? 2.8 : 0
    if (yellowPt.current) yellowPt.current.intensity = y ? 2.2 : 0
    if (greenPt.current) greenPt.current.intensity = g ? 2.6 : 0
  })

  const lensR = 0.065
  const lx = 0.24
  const lz = 0.05

  return (
    <group scale={2.35}>
      <mesh position={[0, 1.75, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.065, 3.5, 8]} />
        <meshStandardMaterial color="#171717" roughness={0.82} metalness={0.15} />
      </mesh>
      <mesh position={[0.14, 3.05, 0]} castShadow>
        <boxGeometry args={[0.3, 0.58, 0.22]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
      </mesh>

      <mesh position={[lx, 3.22, 0]} castShadow material={redMat}>
        <sphereGeometry args={[lensR, 16, 12]} />
      </mesh>
      <pointLight
        ref={redPt}
        position={[lx, 3.22, lz]}
        color="#ff3333"
        distance={18}
        decay={2}
        intensity={0}
      />

      <mesh position={[lx, 3.05, 0]} castShadow material={yellowMat}>
        <sphereGeometry args={[lensR, 16, 12]} />
      </mesh>
      <pointLight
        ref={yellowPt}
        position={[lx, 3.05, lz]}
        color="#ffcc00"
        distance={14}
        decay={2}
        intensity={0}
      />

      <mesh position={[lx, 2.88, 0]} castShadow material={greenMat}>
        <sphereGeometry args={[lensR, 16, 12]} />
      </mesh>
      <pointLight
        ref={greenPt}
        position={[lx, 2.88, lz]}
        color="#4ade80"
        distance={18}
        decay={2}
        intensity={0}
      />
    </group>
  )
}
