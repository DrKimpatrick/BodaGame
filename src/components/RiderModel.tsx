import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Procedural seated rider: helmet with visor, hi-vis vest with reflective bands, long sleeves, trousers,
 * gloves and boots. Bike space: forward is −Z, seat around y 0.62.
 * Replaces the old placeholder robot that was loaded from threejs.org at runtime.
 */

type V3 = [number, number, number]

const UP = new THREE.Vector3(0, 1, 0)

function Limb({ a, b, r, mat }: { a: V3; b: V3; r: number; mat: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const dir = vb.clone().sub(va)
    const length = dir.length()
    return {
      pos: va.add(vb).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
      len: length,
    }
  }, [a, b])
  return (
    <mesh position={pos} quaternion={quat} castShadow material={mat}>
      <capsuleGeometry args={[r, Math.max(0.01, len - r * 2), 4, 10]} />
    </mesh>
  )
}

const mats = {
  skin: new THREE.MeshStandardMaterial({ color: '#5b3a26', roughness: 0.6 }),
  vest: new THREE.MeshStandardMaterial({ color: '#c6f000', roughness: 0.55, emissive: '#3a4a00', emissiveIntensity: 0.25 }),
  reflect: new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.2, metalness: 0.8 }),
  sleeve: new THREE.MeshStandardMaterial({ color: '#1f2a44', roughness: 0.8 }),
  trousers: new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.85 }),
  boot: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6 }),
  glove: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.7 }),
  helmet: new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.25, metalness: 0.3 }),
  helmetPassenger: new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.3, metalness: 0.2 }),
  visor: new THREE.MeshStandardMaterial({ color: '#0b1220', roughness: 0.05, metalness: 0.9 }),
  passengerTop: new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.75 }),
  passengerSkirt: new THREE.MeshStandardMaterial({ color: '#0e7490', roughness: 0.8 }),
}

export function RiderModel({ hideHead = false }: { hideHead?: boolean }) {
  return (
    <group>
      {/* Torso leaning forward into the bars */}
      <group position={[0, 0.98, 0.2]} rotation={[-0.38, 0, 0]}>
        <mesh castShadow material={mats.vest} scale={[1.05, 1, 0.78]}>
          <capsuleGeometry args={[0.16, 0.26, 4, 12]} />
        </mesh>
        {[-0.06, 0.08].map((y) => (
          <mesh key={y} position={[0, y, 0]} scale={[1.07, 1, 0.8]} material={mats.reflect}>
            <cylinderGeometry args={[0.165, 0.165, 0.035, 16, 1, true]} />
          </mesh>
        ))}
      </group>
      {/* Hips on the seat */}
      <mesh position={[0, 0.74, 0.27]} castShadow material={mats.trousers} scale={[1.15, 0.7, 1]}>
        <sphereGeometry args={[0.16, 14, 10]} />
      </mesh>
      {!hideHead && (
        <group position={[0, 1.36, 0.02]}>
          <mesh position={[0, -0.12, 0.03]} material={mats.skin}>
            <cylinderGeometry args={[0.05, 0.06, 0.1, 10]} />
          </mesh>
          <mesh castShadow material={mats.helmet} scale={[1, 1.04, 1.12]}>
            <sphereGeometry args={[0.145, 20, 16]} />
          </mesh>
          <mesh position={[0, -0.01, -0.06]} rotation={[0.25, 0, 0]} material={mats.visor} scale={[1, 0.75, 1]}>
            <sphereGeometry args={[0.142, 18, 10, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.3, Math.PI * 0.32]} />
          </mesh>
        </group>
      )}
      {/* Arms to the handlebar grips (bars at y≈0.58, z≈-0.5, half-width 0.34) */}
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <Limb a={[s * 0.18, 1.15, 0.1]} b={[s * 0.25, 0.92, -0.18]} r={0.055} mat={mats.sleeve} />
          <Limb a={[s * 0.25, 0.92, -0.18]} b={[s * 0.33, 0.64, -0.47]} r={0.046} mat={mats.sleeve} />
          <mesh position={[s * 0.335, 0.61, -0.5]} castShadow material={mats.glove}>
            <sphereGeometry args={[0.048, 10, 8]} />
          </mesh>
          <Limb a={[s * 0.11, 0.74, 0.25]} b={[s * 0.21, 0.66, -0.12]} r={0.075} mat={mats.trousers} />
          <Limb a={[s * 0.21, 0.66, -0.12]} b={[s * 0.2, 0.26, 0.0]} r={0.06} mat={mats.trousers} />
          <mesh position={[s * 0.2, 0.2, -0.04]} castShadow material={mats.boot}>
            <boxGeometry args={[0.1, 0.1, 0.24]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Pillion passenger sitting astride behind the rider, helmet on, hands on the rider's waist. */
export function PassengerModel() {
  return (
    <group position={[0, 0.06, 0.42]}>
      <group position={[0, 0.98, 0.2]} rotation={[-0.18, 0, 0]}>
        <mesh castShadow material={mats.passengerTop} scale={[1, 1, 0.8]}>
          <capsuleGeometry args={[0.15, 0.24, 4, 12]} />
        </mesh>
      </group>
      <mesh position={[0, 0.72, 0.24]} castShadow material={mats.passengerSkirt} scale={[1.2, 0.7, 1.05]}>
        <sphereGeometry args={[0.16, 14, 10]} />
      </mesh>
      <group position={[0, 1.33, 0.12]}>
        <mesh castShadow material={mats.helmetPassenger} scale={[1, 1.04, 1.1]}>
          <sphereGeometry args={[0.14, 18, 14]} />
        </mesh>
        <mesh position={[0, -0.01, -0.06]} rotation={[0.25, 0, 0]} material={mats.visor} scale={[1, 0.75, 1]}>
          <sphereGeometry args={[0.137, 16, 10, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.3, Math.PI * 0.32]} />
        </mesh>
      </group>
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <Limb a={[s * 0.17, 1.12, 0.18]} b={[s * 0.22, 0.95, 0.0]} r={0.05} mat={mats.passengerTop} />
          <Limb a={[s * 0.22, 0.95, 0.0]} b={[s * 0.15, 0.9, -0.12]} r={0.042} mat={mats.skin} />
          <Limb a={[s * 0.1, 0.72, 0.24]} b={[s * 0.22, 0.64, -0.02]} r={0.07} mat={mats.passengerSkirt} />
          <Limb a={[s * 0.22, 0.64, -0.02]} b={[s * 0.22, 0.28, 0.1]} r={0.055} mat={mats.skin} />
          <mesh position={[s * 0.22, 0.22, 0.06]} castShadow material={mats.boot}>
            <boxGeometry args={[0.09, 0.08, 0.2]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
