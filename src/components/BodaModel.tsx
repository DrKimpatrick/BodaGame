import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bikeTelemetry } from '../roadRules/world/telemetry'

/**
 * Bajaj Boxer-style boda boda, the most common bike on Kampala's stages. Bike space: forward is −Z,
 * wheels touch y = 0. Wheels spin with the bike's speed.
 */

const WHEEL_R = 0.31
const WHEELBASE = 1.28

const M = {
  paint: new THREE.MeshStandardMaterial({ color: '#b3121b', roughness: 0.28, metalness: 0.35 }),
  paintDark: new THREE.MeshStandardMaterial({ color: '#5e0a0f', roughness: 0.4, metalness: 0.3 }),
  black: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.7, metalness: 0.2 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.92 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.12, metalness: 1 }),
  alloy: new THREE.MeshStandardMaterial({ color: '#8d939a', roughness: 0.35, metalness: 0.85 }),
  engine: new THREE.MeshStandardMaterial({ color: '#4b4f55', roughness: 0.45, metalness: 0.7 }),
  seat: new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.6 }),
  lens: new THREE.MeshStandardMaterial({ color: '#f3f6fa', roughness: 0.05, metalness: 0.2, emissive: '#fff4d6', emissiveIntensity: 0.15 }),
  tail: new THREE.MeshStandardMaterial({ color: '#c81e1e', roughness: 0.2, emissive: '#5a0000', emissiveIntensity: 0.6 }),
  amber: new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.3, emissive: '#6b3a00', emissiveIntensity: 0.4 }),
}

function plateTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#f5f5f0'
  g.fillRect(0, 0, 256, 128)
  g.strokeStyle = '#111'
  g.lineWidth = 6
  g.strokeRect(4, 4, 248, 120)
  g.fillStyle = '#111'
  g.font = 'bold 54px "Arial Narrow", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('UFB 512K', 128, 68)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Tube({ a, b, r, m, low }: { a: [number, number, number]; b: [number, number, number]; r: number; m: THREE.Material; low?: boolean }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const d = vb.clone().sub(va)
    return {
      pos: va.clone().add(vb).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
      len: d.length(),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.join(), b.join()])
  return (
    <mesh position={pos} quaternion={quat} material={m} castShadow>
      <cylinderGeometry args={[r, r, len, low ? 5 : 10]} />
    </mesh>
  )
}

const spokeGeo = new THREE.CylinderGeometry(0.004, 0.004, WHEEL_R * 1.55, 4)

function Wheel({ z, spinRef, low }: { z: number; spinRef: React.RefObject<THREE.Group | null>; low?: boolean }) {
  return (
    <group position={[0, WHEEL_R, z]}>
      <group ref={spinRef}>
        <mesh rotation={[0, Math.PI / 2, 0]} material={M.rubber} castShadow>
          <torusGeometry args={[WHEEL_R - 0.05, 0.052, low ? 6 : 12, low ? 14 : 32]} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]} material={M.chrome}>
          <torusGeometry args={[WHEEL_R - 0.1, 0.012, low ? 3 : 6, low ? 14 : 32]} />
        </mesh>
        {Array.from({ length: low ? 0 : 12 }, (_, k) => (
          <mesh key={k} geometry={spokeGeo} material={M.alloy} rotation={[(k / 12) * Math.PI, 0, 0]} position={[k % 2 ? 0.015 : -0.015, 0, 0]} />
        ))}
        <mesh rotation={[0, 0, Math.PI / 2]} material={M.alloy}>
          <cylinderGeometry args={[0.055, 0.055, 0.11, 14]} />
        </mesh>
      </group>
      {/* Drum brake plate (doesn't spin) */}
      <mesh position={[0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={M.engine}>
        <cylinderGeometry args={[0.09, 0.09, 0.02, 16]} />
      </mesh>
    </group>
  )
}

/** `low`: fewer segments and no spokes, for parked and traffic bodas seen at a distance. */
export function BodaModel({ spin = true, low = false }: { spin?: boolean; low?: boolean }) {
  const front = useRef<THREE.Group>(null)
  const rear = useRef<THREE.Group>(null)
  const plate = useMemo(() => new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5 }), [])
  const fz = -WHEELBASE / 2
  const rz = WHEELBASE / 2

  useFrame((_, dt) => {
    if (!spin) return
    // Forward is −Z, so a positive speed rolls the wheels about −X.
    const a = (bikeTelemetry.speed / WHEEL_R) * Math.min(dt, 0.05)
    if (front.current) front.current.rotation.x -= a
    if (rear.current) rear.current.rotation.x -= a
  })

  return (
    <group>
      <Wheel z={fz} spinRef={front} low={low} />
      <Wheel z={rz} spinRef={rear} low={low} />

      {/* Front forks, triple clamp, mudguard */}
      <Tube a={[0.09, WHEEL_R, fz]} b={[0.07, 0.88, fz + 0.24]} r={0.024} m={M.chrome} low={low} />
      <Tube a={[-0.09, WHEEL_R, fz]} b={[-0.07, 0.88, fz + 0.24]} r={0.024} m={M.chrome} low={low} />
      <mesh position={[0, WHEEL_R + 0.14, fz + 0.02]} rotation={[-0.15, 0, 0]} material={M.paint} castShadow>
        <cylinderGeometry args={[WHEEL_R + 0.02, WHEEL_R + 0.02, 0.12, 20, 1, true, -Math.PI * 0.55, Math.PI * 0.75]} />
      </mesh>

      {/* Headlight, indicators, handlebar, mirrors */}
      <group position={[0, 0.86, fz + 0.16]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={M.black} castShadow>
          <cylinderGeometry args={[0.1, 0.11, 0.12, 18]} />
        </mesh>
        <mesh position={[0, 0, -0.062]} rotation={[Math.PI / 2, 0, 0]} material={M.chrome}>
          <torusGeometry args={[0.096, 0.012, 6, 20]} />
        </mesh>
        <mesh position={[0, 0, -0.066]} material={M.lens}>
          <circleGeometry args={[0.088, 20]} />
        </mesh>
        {[-0.17, 0.17].map((x) => (
          <mesh key={x} position={[x, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.amber}>
            <cylinderGeometry args={[0.025, 0.03, 0.07, 10]} />
          </mesh>
        ))}
      </group>
      <Tube a={[-0.36, 0.98, fz + 0.2]} b={[0.36, 0.98, fz + 0.2]} r={0.014} m={M.chrome} low={low} />
      {[-0.33, 0.33].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.98, fz + 0.2]} rotation={[0, 0, Math.PI / 2]} material={M.rubber}>
            <cylinderGeometry args={[0.022, 0.022, 0.11, 10]} />
          </mesh>
          <Tube a={[x * 0.75, 0.98, fz + 0.2]} b={[x * 0.95, 1.2, fz + 0.17]} r={0.006} m={M.chrome} low={low} />
          <mesh position={[x * 0.97, 1.23, fz + 0.17]} rotation={[0.2, x > 0 ? -0.3 : 0.3, 0]} material={M.chrome}>
            <cylinderGeometry args={[0.045, 0.045, 0.012, 14]} />
          </mesh>
        </group>
      ))}

      {/* Frame backbone, teardrop tank, side covers */}
      <Tube a={[0, 0.88, fz + 0.26]} b={[0, 0.52, 0.05]} r={0.03} m={M.black} low={low} />
      <Tube a={[0, 0.52, 0.05]} b={[0, 0.6, rz - 0.15]} r={0.026} m={M.black} low={low} />
      <mesh position={[0, 0.8, -0.18]} rotation={[0.18, 0, 0]} scale={[0.6, 0.42, 1]} material={M.paint} castShadow>
        <sphereGeometry args={[0.34, 20, 14]} />
      </mesh>
      <mesh position={[0, 0.94, -0.24]} material={M.chrome}>
        <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
      </mesh>
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 0.6, 0.3]} scale={[0.12, 0.6, 1]} material={M.paintDark} castShadow>
          <sphereGeometry args={[0.2, 12, 10]} />
        </mesh>
      ))}

      {/* Long padded seat (room for a pillion) */}
      <mesh position={[0, 0.78, 0.33]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.45]} material={M.seat} castShadow>
        <capsuleGeometry args={[0.13, 0.62, 6, 14]} />
      </mesh>

      {/* Engine with cooling fins, crankcase, kick-start */}
      <group position={[0, 0.36, -0.02]}>
        <mesh material={M.engine} castShadow>
          <boxGeometry args={[0.24, 0.26, 0.3]} />
        </mesh>
        {[0, 1, 2, 3, 4].map((k) => (
          <mesh key={k} position={[0, 0.16 + k * 0.035, -0.08]} material={M.alloy}>
            <boxGeometry args={[0.28, 0.012, 0.22]} />
          </mesh>
        ))}
        <mesh position={[0, -0.06, 0.12]} rotation={[0, 0, Math.PI / 2]} material={M.alloy}>
          <cylinderGeometry args={[0.13, 0.13, 0.26, 18]} />
        </mesh>
      </group>
      {/* Crash bars (very common on bodas) */}
      <Tube a={[-0.22, 0.25, -0.24]} b={[-0.22, 0.62, -0.32]} r={0.016} m={M.chrome} low={low} />
      <Tube a={[0.22, 0.25, -0.24]} b={[0.22, 0.62, -0.32]} r={0.016} m={M.chrome} low={low} />
      <Tube a={[-0.22, 0.62, -0.32]} b={[0.22, 0.62, -0.32]} r={0.016} m={M.chrome} low={low} />

      {/* Exhaust: header pipe to muffler on the right */}
      <Tube a={[0.06, 0.34, -0.17]} b={[0.17, 0.22, 0.15]} r={0.022} m={M.chrome} low={low} />
      <mesh position={[0.18, 0.27, 0.48]} rotation={[Math.PI / 2 - 0.12, 0, 0]} material={M.chrome} castShadow>
        <cylinderGeometry args={[0.05, 0.042, 0.55, 14]} />
      </mesh>

      {/* Rear suspension, chain guard, swingarm */}
      <Tube a={[0.12, WHEEL_R, rz]} b={[0.12, 0.72, rz - 0.22]} r={0.02} m={M.chrome} low={low} />
      <Tube a={[-0.12, WHEEL_R, rz]} b={[-0.12, 0.72, rz - 0.22]} r={0.02} m={M.chrome} low={low} />
      <Tube a={[-0.1, 0.3, 0.08]} b={[-0.1, WHEEL_R, rz]} r={0.022} m={M.black} low={low} />
      <Tube a={[0.1, 0.3, 0.08]} b={[0.1, WHEEL_R, rz]} r={0.022} m={M.black} low={low} />
      <mesh position={[-0.13, 0.33, 0.36]} rotation={[0.04, 0, 0]} material={M.black}>
        <boxGeometry args={[0.02, 0.09, 0.62]} />
      </mesh>

      {/* Footpegs (rider and pillion) */}
      {[-0.22, 0.22].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.24, -0.04]} rotation={[0, 0, Math.PI / 2]} material={M.rubber}>
            <cylinderGeometry args={[0.018, 0.018, 0.1, 8]} />
          </mesh>
          <mesh position={[x * 1.05, 0.3, 0.42]} rotation={[0, 0, Math.PI / 2]} material={M.rubber}>
            <cylinderGeometry args={[0.016, 0.016, 0.1, 8]} />
          </mesh>
        </group>
      ))}

      {/* Carrier rack, rear mudguard, tail light, number plate */}
      <mesh position={[0, 0.82, rz - 0.02]} material={M.black} castShadow>
        <boxGeometry args={[0.3, 0.025, 0.36]} />
      </mesh>
      <Tube a={[-0.14, 0.82, rz - 0.18]} b={[-0.14, 0.62, rz - 0.3]} r={0.012} m={M.black} low={low} />
      <Tube a={[0.14, 0.82, rz - 0.18]} b={[0.14, 0.62, rz - 0.3]} r={0.012} m={M.black} low={low} />
      <mesh position={[0, WHEEL_R + 0.16, rz + 0.02]} rotation={[0.25, 0, 0]} material={M.paint} castShadow>
        <cylinderGeometry args={[WHEEL_R + 0.03, WHEEL_R + 0.03, 0.13, 20, 1, true, Math.PI * 0.1, Math.PI * 0.7]} />
      </mesh>
      <mesh position={[0, 0.72, rz + 0.2]} material={M.tail}>
        <boxGeometry args={[0.12, 0.06, 0.04]} />
      </mesh>
      <mesh position={[0, 0.6, rz + 0.25]} rotation={[0.2, 0, 0]} material={plate}>
        <planeGeometry args={[0.2, 0.1]} />
      </mesh>
    </group>
  )
}
