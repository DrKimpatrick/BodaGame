import { useFrame } from '@react-three/fiber'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useKeyboard } from '../hooks/useKeyboard'

const MAX_FORWARD = 14
const MAX_REVERSE = 5
const ACCEL = 28
const FRICTION = 6.5
const TURN_SPEED = 2.4

/** Glossy commuter red (tank, fenders) */
const matRed = {
  color: '#d42429',
  metalness: 0.28,
  roughness: 0.16,
} as const

/** Frame, seat, rubber, plastics */
const matBlack = {
  color: '#141414',
  metalness: 0.06,
  roughness: 0.88,
} as const

/** Engine, exhaust, shocks, chain guard */
const matSilver = {
  color: '#9ca3af',
  metalness: 0.82,
  roughness: 0.32,
} as const

/** Rim + dark trim */
const matRim = {
  color: '#0a0a0a',
  metalness: 0.35,
  roughness: 0.45,
} as const

const matTire = {
  color: '#0d0d0d',
  metalness: 0.02,
  roughness: 0.94,
} as const

const matGlass = {
  color: '#fef3c7',
  metalness: 0.1,
  roughness: 0.15,
  emissive: '#2a2010',
  emissiveIntensity: 0.15,
} as const

function Wheel({ z }: { z: number }) {
  return (
    <group position={[0, 0, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.31, 0.31, 0.11, 20]} />
        <meshStandardMaterial {...matTire} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.12, 20]} />
        <meshStandardMaterial {...matRim} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[0, Math.cos(a) * 0.1, Math.sin(a) * 0.1]}
            rotation={[0, -a, 0]}
            castShadow
          >
            <boxGeometry args={[0.03, 0.18, 0.035]} />
            <meshStandardMaterial {...matRim} />
          </mesh>
        )
      })}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.2, 0.012, 8, 24]} />
        <meshStandardMaterial {...matRed} roughness={0.35} metalness={0.2} />
      </mesh>
    </group>
  )
}

function BodaBikeModel() {
  return (
    <group>
      <Wheel z={-0.78} />
      <Wheel z={0.78} />

      {/* Main spine / downtube */}
      <mesh
        position={[0, 0.22, -0.05]}
        rotation={[0.55, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.035, 0.035, 0.95, 8]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.38, 0.35]} rotation={[-0.35, 0, 0]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.75, 8]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      {/* Crash bar around engine */}
      <mesh position={[0, 0.12, 0.02]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.22, 0.022, 8, 20]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      {/* Engine block */}
      <mesh position={[0, 0.08, 0.06]} castShadow receiveShadow>
        <boxGeometry args={[0.38, 0.28, 0.36]} />
        <meshStandardMaterial {...matSilver} />
      </mesh>
      <mesh position={[0, 0.06, 0.22]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.12, 12]} />
        <meshStandardMaterial {...matSilver} />
      </mesh>

      {/* Chain guard */}
      <mesh position={[-0.12, 0.04, 0.52]} rotation={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, 0.42]} />
        <meshStandardMaterial {...matSilver} metalness={0.75} roughness={0.4} />
      </mesh>

      {/* Exhaust */}
      <mesh
        position={[-0.22, 0.1, 0.35]}
        rotation={[0, 0, Math.PI / 2.3]}
        castShadow
      >
        <cylinderGeometry args={[0.045, 0.055, 0.55, 10]} />
        <meshStandardMaterial {...matSilver} />
      </mesh>

      {/* Fuel tank */}
      <mesh position={[0, 0.48, -0.18]} castShadow receiveShadow>
        <sphereGeometry args={[0.26, 16, 12]} />
        <meshStandardMaterial {...matRed} />
      </mesh>
      <mesh position={[0, 0.5, -0.28]} castShadow>
        <boxGeometry args={[0.36, 0.08, 0.14]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} metalness={0.1} />
      </mesh>

      {/* Side panel */}
      <mesh position={[0.22, 0.28, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 0.22, 0.38]} />
        <meshStandardMaterial {...matRed} />
      </mesh>
      <mesh position={[-0.22, 0.28, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 0.22, 0.38]} />
        <meshStandardMaterial {...matRed} />
      </mesh>

      {/* Long bench seat + luggage rack */}
      <mesh position={[0, 0.52, 0.32]} castShadow receiveShadow>
        <boxGeometry args={[0.36, 0.1, 0.62]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.62, 0.28]} castShadow>
        <boxGeometry args={[0.34, 0.04, 0.5]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.72, 0.5]} castShadow>
        <boxGeometry args={[0.28, 0.03, 0.2]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0.12, 0.66, 0.52]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.28, 6]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[-0.12, 0.66, 0.52]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.28, 6]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      {/* Rear shocks */}
      {[-0.13, 0.13].map((x) => (
        <group key={x} position={[x, 0.32, 0.48]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.028, 0.028, 0.22, 8]} />
            <meshStandardMaterial {...matSilver} />
          </mesh>
          <mesh position={[0, -0.06, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.08, 10]} />
            <meshStandardMaterial {...matSilver} metalness={0.85} roughness={0.25} />
          </mesh>
        </group>
      ))}

      {/* Front fork legs */}
      {[-0.1, 0.1].map((x) => (
        <mesh
          key={x}
          position={[x, 0.28, -0.62]}
          castShadow
        >
          <cylinderGeometry args={[0.03, 0.028, 0.62, 8]} />
          <meshStandardMaterial {...matBlack} />
        </mesh>
      ))}

      {/* Fork gaiters (slightly wider) */}
      {[-0.1, 0.1].map((x) => (
        <mesh key={`g-${x}`} position={[x, 0.08, -0.58]} castShadow>
          <cylinderGeometry args={[0.038, 0.034, 0.22, 8]} />
          <meshStandardMaterial {...matBlack} roughness={0.92} />
        </mesh>
      ))}

      {/* Triple clamp / bars stem */}
      <mesh position={[0, 0.56, -0.48]} castShadow>
        <boxGeometry args={[0.24, 0.05, 0.08]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      {/* Handlebar */}
      <mesh position={[0, 0.58, -0.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.72, 8]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      {/* Fairing + headlight */}
      <mesh position={[0, 0.52, -0.78]} castShadow>
        <boxGeometry args={[0.32, 0.12, 0.1]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.48, -0.82]} castShadow receiveShadow>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshStandardMaterial {...matGlass} />
      </mesh>
      <mesh position={[0, 0.42, -0.76]} castShadow>
        <boxGeometry args={[0.34, 0.06, 0.12]} />
        <meshStandardMaterial {...matRed} />
      </mesh>

      {/* Front fender */}
      <mesh
        position={[0, 0.12, -0.82]}
        rotation={[0.35, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.28, 0.04, 0.22]} />
        <meshStandardMaterial {...matRed} />
      </mesh>

      {/* Turn signals (orange) */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={`s-${x}`} position={[x, 0.46, -0.8]} castShadow>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshStandardMaterial
            color="#ea580c"
            emissive="#7c2d12"
            emissiveIntensity={0.25}
            roughness={0.5}
            metalness={0.1}
          />
        </mesh>
      ))}

      {/* Rear mudguard + tail */}
      <mesh
        position={[0, 0.22, 0.88]}
        rotation={[-0.4, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.26, 0.04, 0.28]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.38, 0.92]} castShadow>
        <boxGeometry args={[0.12, 0.08, 0.06]} />
        <meshStandardMaterial color="#7f1d1d" emissive="#450a0a" emissiveIntensity={0.2} />
      </mesh>
    </group>
  )
}

export const Boda = forwardRef<THREE.Group>(function Boda(_, ref) {
  const group = useRef<THREE.Group>(null)
  useImperativeHandle(ref, () => group.current!)

  const keys = useKeyboard()
  const speed = useRef(0)

  const forward = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return

    const dt = Math.min(delta, 0.05)

    const steer =
      (keys.current.left ? 1 : 0) - (keys.current.right ? 1 : 0)
    const throttle =
      (keys.current.forward ? 1 : 0) - (keys.current.back ? 1 : 0)

    const moving = Math.abs(speed.current) > 0.08
    if (moving || steer !== 0) {
      const turnScale = THREE.MathUtils.clamp(
        Math.abs(speed.current) / MAX_FORWARD,
        0.35,
        1,
      )
      g.rotation.y += steer * TURN_SPEED * turnScale * dt
    }

    speed.current += throttle * ACCEL * dt

    const drag = Math.exp(-FRICTION * dt)
    if (throttle === 0) {
      speed.current *= drag
    } else {
      speed.current *= Math.exp(-(FRICTION * 0.15) * dt)
    }

    if (Math.abs(speed.current) < 0.02 && throttle === 0) {
      speed.current = 0
    }

    speed.current = THREE.MathUtils.clamp(
      speed.current,
      -MAX_REVERSE,
      MAX_FORWARD,
    )

    forward.set(0, 0, -1).applyQuaternion(g.quaternion)
    g.position.addScaledVector(forward, speed.current * dt)
  })

  return (
    <group ref={group} position={[0, 0.32, 0]}>
      <BodaBikeModel />
    </group>
  )
})
