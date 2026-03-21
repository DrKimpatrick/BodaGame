import { useEffect, useMemo, useState } from 'react'

type Phase = 'red' | 'redYellow' | 'green' | 'yellow'

const ORDER: Phase[] = ['red', 'redYellow', 'green', 'yellow']

const DURATION_MS: Record<Phase, number> = {
  red: 10_000,
  redYellow: 2_000,
  green: 10_000,
  yellow: 3_000,
}

const C = {
  red: '#ef4444',
  redOff: '#3a1010',
  yellow: '#f59e0b',
  yellowOff: '#3d2808',
  green: '#22c55e',
  greenOff: '#0d2818',
} as const

function TrafficLightVisual({ phase }: { phase: Phase }) {
  const { redOn, yellowOn, greenOn } = useMemo(() => {
    const redOn = phase === 'red' || phase === 'redYellow'
    const yellowOn = phase === 'redYellow' || phase === 'yellow'
    const greenOn = phase === 'green'
    return { redOn, yellowOn, greenOn }
  }, [phase])

  return (
    <group>
      <mesh position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.045, 0.055, 2.9, 10]} />
        <meshStandardMaterial color="#334155" roughness={0.78} metalness={0.25} />
      </mesh>
      <mesh position={[0.1, 1.45, 0.04]}>
        <boxGeometry args={[0.22, 0.72, 0.16]} />
        <meshStandardMaterial color="#0f172a" roughness={0.88} />
      </mesh>

      <mesh position={[0.1, 1.78, 0.11]}>
        <sphereGeometry args={[0.052, 16, 12]} />
        <meshStandardMaterial
          color={redOn ? C.red : C.redOff}
          emissive={redOn ? C.red : C.redOff}
          emissiveIntensity={redOn ? 1.15 : 0.15}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0.1, 1.45, 0.11]}>
        <sphereGeometry args={[0.052, 16, 12]} />
        <meshStandardMaterial
          color={yellowOn ? C.yellow : C.yellowOff}
          emissive={yellowOn ? C.yellow : C.yellowOff}
          emissiveIntensity={yellowOn ? 1.1 : 0.14}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0.1, 1.12, 0.11]}>
        <sphereGeometry args={[0.052, 16, 12]} />
        <meshStandardMaterial
          color={greenOn ? C.green : C.greenOff}
          emissive={greenOn ? C.green : C.greenOff}
          emissiveIntensity={greenOn ? 1.15 : 0.14}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/**
 * Two roadside heads sharing one phase — avoids duplicate timers and keeps signals in sync.
 * No PointLights: ~160 point lights across the map overload the GPU.
 */
export function IntersectionTrafficPair({
  x,
  z,
  cornerOffset,
}: {
  x: number
  z: number
  cornerOffset: number
}) {
  const [phase, setPhase] = useState<Phase>('red')

  useEffect(() => {
    const id = window.setTimeout(() => {
      const i = ORDER.indexOf(phase)
      setPhase(ORDER[(i + 1) % ORDER.length]!)
    }, DURATION_MS[phase])
    return () => window.clearTimeout(id)
  }, [phase])

  const d = cornerOffset
  return (
    <group>
      <group position={[x + d, 0, z + d]}>
        <TrafficLightVisual phase={phase} />
      </group>
      <group position={[x - d, 0, z - d]} rotation={[0, Math.PI, 0]}>
        <TrafficLightVisual phase={phase} />
      </group>
    </group>
  )
}

/** Single pole (e.g. props / tests). Prefer `IntersectionTrafficPair` in the city. */
export function TrafficLight() {
  const [phase, setPhase] = useState<Phase>('red')

  useEffect(() => {
    const id = window.setTimeout(() => {
      const i = ORDER.indexOf(phase)
      setPhase(ORDER[(i + 1) % ORDER.length]!)
    }, DURATION_MS[phase])
    return () => window.clearTimeout(id)
  }, [phase])

  return <TrafficLightVisual phase={phase} />
}
