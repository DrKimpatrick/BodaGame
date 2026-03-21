import { useFrame, useThree } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { setOppositeTravelDirHorizontal } from '../utils/bikeWakeDirection'

const MAX_FORWARD = 14
const OFFROAD_SPEED_CAP = 36

type Particle = {
  age: number
  life: number
  pos: THREE.Vector3
  vel: THREE.Vector3
  scale: number
}

/** Rear tire contact patches — local; forward is −Z. */
const DUST_EMITTERS_LOCAL = [
  new THREE.Vector3(-0.2, 0.04, 0.78),
  new THREE.Vector3(0.2, 0.04, 0.78),
  new THREE.Vector3(0, 0.035, 0.88),
]

const DUST_COUNT = 52

type Props = {
  rigidBodyRef: RefObject<RapierRigidBody | null>
  speedRef: RefObject<number>
  offroadRef: RefObject<boolean>
}

/**
 * Ground dust kicked up behind the bike while moving — stronger off-road.
 */
export function BikeDustTrail({
  rigidBodyRef,
  speedRef,
  offroadRef,
}: Props) {
  const camera = useThree((s) => s.camera)
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const particles = useRef<Particle[]>(
    Array.from({ length: DUST_COUNT }, () => ({
      age: 999,
      life: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      scale: 0.08,
    })),
  )
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const tmpForward = useMemo(() => new THREE.Vector3(), [])
  const tmpEmitter = useMemo(() => new THREE.Vector3(), [])
  const wakeDir = useMemo(() => new THREE.Vector3(), [])
  const sideDir = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const body = rigidBodyRef.current
    if (!body) return

    const signedSpeed = speedRef.current ?? 0
    const speed = Math.abs(signedSpeed)
    const moving = speed > 0.1
    const speedNorm = Math.min(
      1,
      speed / (offroadRef.current ? OFFROAD_SPEED_CAP : MAX_FORWARD),
    )
    const offroad = offroadRef.current
    const tr = body.translation()
    const rot = body.rotation()
    q.set(rot.x, rot.y, rot.z, rot.w)

    const hasWake = setOppositeTravelDirHorizontal(
      body,
      signedSpeed,
      q,
      tmpForward,
      wakeDir,
    )
    if (!hasWake || wakeDir.lengthSq() < 1e-8) {
      wakeDir.set(0, 0, 1).applyQuaternion(q)
      wakeDir.y = 0
      if (wakeDir.lengthSq() > 1e-8) wakeDir.normalize()
    }
    sideDir.set(-wakeDir.z, 0, wakeDir.x)

    const surfaceBoost = offroad ? 2.35 : 0.72
    const dustEmit =
      moving && speedNorm > 0.06
        ? Math.pow(speedNorm, 1.15) * 38 * surfaceBoost * dt
        : 0

    for (let i = 0; i < DUST_COUNT; i++) {
      const p = particles.current[i]!
      const g = groupRefs.current[i]
      const m = matRefs.current[i]
      if (!g || !m) continue

      if (p.age >= p.life) {
        if (moving && Math.random() < dustEmit) {
          p.age = 0
          const em = DUST_EMITTERS_LOCAL[i % DUST_EMITTERS_LOCAL.length]!
          tmpEmitter.copy(em).applyQuaternion(q)
          p.life = 0.28 + Math.random() * 0.38
          p.pos.set(tr.x + tmpEmitter.x, tr.y + tmpEmitter.y, tr.z + tmpEmitter.z)

          const kickBack = 0.12 + speed * 0.05
          const spread = (Math.random() - 0.5) * (offroad ? 0.22 : 0.12)
          // Invert shared wake vector so the dust puff travels the way that reads correct behind the bike.
          p.vel
            .copy(wakeDir)
            .multiplyScalar(-kickBack)
            .addScaledVector(sideDir, spread)
          p.vel.x += (Math.random() - 0.5) * 0.06
          p.vel.z += (Math.random() - 0.5) * 0.06
          p.vel.y = 0.35 + Math.random() * (offroad ? 0.55 : 0.35)

          p.scale = (offroad ? 0.09 : 0.055) + Math.random() * 0.06
        } else {
          m.opacity = 0
          g.visible = false
        }
        continue
      }

      p.age += dt
      p.vel.y += 0.25 * dt
      p.vel.multiplyScalar(Math.exp(-2.1 * dt))
      p.pos.addScaledVector(p.vel, dt)
      p.scale += dt * (offroad ? 0.42 : 0.28)

      const u = p.age / p.life
      const fade = Math.max(0, 1 - u * u * u)

      g.visible = true
      g.position.copy(p.pos)
      e.setFromQuaternion(camera.quaternion)
      g.rotation.copy(e)

      const dustR = 0.62 + u * 0.12
      const dustG = 0.52 + u * 0.1
      const dustB = 0.38 + u * 0.08
      m.color.setRGB(dustR, dustG, dustB)
      m.opacity = fade * (offroad ? 0.52 : 0.38)
      g.scale.setScalar(p.scale)
    }
  })

  return (
    <>
      {Array.from({ length: DUST_COUNT }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          visible={false}
        >
          <mesh rotation={[0, 0, 0]} renderOrder={0}>
            <circleGeometry args={[1, 9]} />
            <meshBasicMaterial
              ref={(el) => {
                matRefs.current[i] = el
              }}
              color="#bfa06a"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}
