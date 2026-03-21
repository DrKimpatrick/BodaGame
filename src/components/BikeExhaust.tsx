import { useFrame, useThree } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { setOppositeTravelDirHorizontal } from '../utils/bikeWakeDirection'

const MAX_FORWARD = 14

type Particle = {
  age: number
  life: number
  pos: THREE.Vector3
  vel: THREE.Vector3
  scale: number
}

/** Rear wheel z ≈ +0.78; forward is local −Z. */
const EMITTER_EXHAUST_LOCAL = new THREE.Vector3(0, 0.06, 0.84)

/** Front fairing / helmet — air sliced aside as the bike moves. */
const AIR_EMITTERS_LOCAL = [
  new THREE.Vector3(-0.22, 0.38, -0.7),
  new THREE.Vector3(0.22, 0.38, -0.7),
  new THREE.Vector3(-0.32, 0.22, -0.55),
  new THREE.Vector3(0.32, 0.22, -0.55),
]

const EXHAUST_COUNT = 26
const AIR_COUNT = 40
const TOTAL = EXHAUST_COUNT + AIR_COUNT

type Props = {
  rigidBodyRef: RefObject<RapierRigidBody | null>
  speedRef: RefObject<number>
}

/**
 * Rear exhaust smoke + front/side air-wake streaks (trail opposite to velocity).
 */
export function BikeExhaust({ rigidBodyRef, speedRef }: Props) {
  const camera = useThree((s) => s.camera)
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const particles = useRef<Particle[]>(
    Array.from({ length: TOTAL }, () => ({
      age: 999,
      life: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      scale: 0.12,
    })),
  )
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const tmpForward = useMemo(() => new THREE.Vector3(), [])
  /** Horizontal unit vector **opposite** to travel (wake blows behind the path). */
  const wakeDir = useMemo(() => new THREE.Vector3(), [])
  /** Horizontal perpendicular to wakeDir (sideways wisp). */
  const sideDir = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const body = rigidBodyRef.current
    if (!body) return

    const signedSpeed = speedRef.current ?? 0
    const speed = Math.abs(signedSpeed)
    const moving = speed > 0.08
    const speedNorm = Math.min(1, speed / MAX_FORWARD)
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

    const exhaustEmit = moving ? speedNorm * 22 * dt : 0
    const airEmit = moving ? Math.pow(speedNorm, 1.2) * 48 * dt : 0

    for (let i = 0; i < TOTAL; i++) {
      const p = particles.current[i]!
      const g = groupRefs.current[i]
      const m = matRefs.current[i]
      if (!g || !m) continue

      const isAir = i >= EXHAUST_COUNT

      if (p.age >= p.life) {
        const chance = isAir ? airEmit : exhaustEmit
        if (moving && Math.random() < chance) {
          p.age = 0
          if (isAir) {
            const em = AIR_EMITTERS_LOCAL[i % AIR_EMITTERS_LOCAL.length]!
            tmp.copy(em).applyQuaternion(q)
            p.life = 0.04 + Math.random() * 0.05
            p.pos.set(tr.x + tmp.x, tr.y + tmp.y, tr.z + tmp.z)
            const along = 0.38 + speed * 0.045
            p.vel
              .copy(wakeDir)
              .multiplyScalar(along)
              .addScaledVector(sideDir, (Math.random() - 0.5) * 0.06)
            p.vel.y = (Math.random() - 0.35) * 0.05
            p.scale = 0.028 + Math.random() * 0.022
          } else {
            tmp.copy(EMITTER_EXHAUST_LOCAL).applyQuaternion(q)
            p.life = 0.11 + Math.random() * 0.09
            p.pos.set(tr.x + tmp.x, tr.y + tmp.y, tr.z + tmp.z)
            const along = 0.22 + speed * 0.028
            p.vel
              .copy(wakeDir)
              .multiplyScalar(along)
              .addScaledVector(sideDir, (Math.random() - 0.5) * 0.045)
            p.vel.y = 0.02 + Math.random() * 0.05
            p.scale = 0.07 + Math.random() * 0.04
          }
        } else {
          m.opacity = 0
          g.visible = false
        }
        continue
      }

      p.age += dt
      if (isAir) {
        p.vel.y += 0.05 * dt
        p.vel.multiplyScalar(Math.exp(-5 * dt))
        p.pos.addScaledVector(p.vel, dt)
        p.scale += dt * 0.35
      } else {
        p.vel.y += 0.14 * dt
        p.vel.multiplyScalar(Math.exp(-3.2 * dt))
        p.pos.addScaledVector(p.vel, dt)
        p.scale += dt * 0.16
      }

      const u = p.age / p.life
      const fade = Math.max(0, 1 - u * u)

      g.visible = true
      g.position.copy(p.pos)
      e.setFromQuaternion(camera.quaternion)
      g.rotation.copy(e)

      if (isAir) {
        m.opacity = fade * 0.28
        m.color.setRGB(0.82 + u * 0.1, 0.86 + u * 0.08, 0.94)
        const sx = p.scale * 2.6
        const sy = p.scale * 0.38
        g.scale.set(sx, sy, 1)
      } else {
        m.opacity = fade * 0.58
        m.color.setRGB(0.52 + u * 0.14, 0.54 + u * 0.12, 0.56 + u * 0.1)
        g.scale.setScalar(p.scale)
      }
    }
  })

  return (
    <>
      {Array.from({ length: TOTAL }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          visible={false}
        >
          <mesh rotation={[0, 0, 0]} renderOrder={1}>
            <circleGeometry args={[1, i >= EXHAUST_COUNT ? 8 : 10]} />
            <meshBasicMaterial
              ref={(el) => {
                matRefs.current[i] = el
              }}
              color={i >= EXHAUST_COUNT ? '#dbeafe' : '#8a8f98'}
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
