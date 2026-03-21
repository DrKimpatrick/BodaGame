import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'

type Props = {
  target: RefObject<THREE.Group | null>
  /** Local-space offset: +Y up, +Z behind default forward (-Z) */
  offset?: THREE.Vector3
  lookAhead?: number
}

export function ThirdPersonCamera({
  target,
  offset,
  lookAhead = 4,
}: Props) {
  const { camera } = useThree()
  const defaultOffset = useMemo(() => new THREE.Vector3(0, 5.5, 11), [])
  const o = offset ?? defaultOffset

  const worldOffset = useRef(new THREE.Vector3())
  const lookAtPoint = useRef(new THREE.Vector3())
  const forward = useRef(new THREE.Vector3())

  useFrame(() => {
    const t = target.current
    if (!t) return

    const wo = worldOffset.current
    const look = lookAtPoint.current
    const fwd = forward.current

    wo.copy(o)
    wo.applyQuaternion(t.quaternion)
    camera.position.copy(t.position).add(wo)

    fwd.set(0, 0, -1).applyQuaternion(t.quaternion)
    look.copy(t.position)
    look.y += 1.1
    look.addScaledVector(fwd, lookAhead)
    camera.lookAt(look)
  })

  return null
}
