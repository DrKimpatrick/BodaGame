import { useFrame, useThree } from '@react-three/fiber'
import { type RapierRigidBody, useRapier } from '@react-three/rapier'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'

type Props = {
  rigidBodyRef: RefObject<RapierRigidBody | null>
  /** Local-space offset: +Y up, +Z behind default forward (-Z) */
  offset?: THREE.Vector3
  lookAhead?: number
  roughRide?: boolean
}

const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()

export function ThirdPersonCamera({
  rigidBodyRef,
  offset,
  lookAhead = 4,
  roughRide = false,
}: Props) {
  const { world } = useRapier()
  const { camera } = useThree()
  const defaultOffset = useMemo(() => new THREE.Vector3(0, 5.5, 11), [])
  const o = offset ?? defaultOffset

  const worldOffset = useRef(new THREE.Vector3())
  const lookAtPoint = useRef(new THREE.Vector3())
  const forward = useRef(new THREE.Vector3())
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    const rb = rigidBodyRef.current
    if (!rb || world.getRigidBody(rb.handle) == null) return
    elapsed.current += delta

    const t = rb.translation()
    tmpPos.set(t.x, t.y, t.z)
    const r = rb.rotation()
    tmpQuat.set(r.x, r.y, r.z, r.w)

    const wo = worldOffset.current
    const look = lookAtPoint.current
    const fwd = forward.current

    wo.copy(o)
    if (roughRide) {
      const shake = 0.12
      wo.x += Math.sin(elapsed.current * 35) * shake
      wo.y += Math.sin(elapsed.current * 53) * shake * 0.8
      wo.z += Math.sin(elapsed.current * 41) * shake * 0.5
    }
    wo.applyQuaternion(tmpQuat)
    camera.position.copy(tmpPos).add(wo)

    fwd.set(0, 0, -1).applyQuaternion(tmpQuat)
    look.copy(tmpPos)
    look.y += 1.1
    look.addScaledVector(fwd, lookAhead)
    camera.lookAt(look)
  })

  return null
}
