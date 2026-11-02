import { useFrame } from '@react-three/fiber'
import { type RapierRigidBody, useRapier } from '@react-three/rapier'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { bikeTelemetry } from '../roadRules/world/telemetry'
import { useSettingsStore } from '../store/useSettingsStore'

type Props = {
  rigidBodyRef: RefObject<RapierRigidBody | null>
  roughRide?: boolean
}

const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const desired = new THREE.Vector3()
const look = new THREE.Vector3()
const fwd = new THREE.Vector3()
const Y = new THREE.Vector3(0, 1, 0)
const lagQuat = new THREE.Quaternion()

/**
 * Low, street-level chase camera with a little lag, speed pull-back and FOV kick (GTA-style), or a
 * helmet-cam first-person view. Toggle with V or the on-screen camera button.
 */
export function ThirdPersonCamera({ rigidBodyRef, roughRide = false }: Props) {
  const { world, rapier } = useRapier()
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null)
  const elapsed = useRef(0)
  const yawLag = useRef<number | null>(null)
  const fovRef = useRef(62)

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera
    const rb = rigidBodyRef.current
    if (!rb || world.getRigidBody(rb.handle) == null) return
    // Not clamped hard: on a slow frame the bike still moves its full distance, so the camera must keep up.
    const dt = Math.min(delta, 0.25)
    elapsed.current += dt
    const helmet = useSettingsStore.getState().camera === 'helmet'

    const t = rb.translation()
    tmpPos.set(t.x, t.y, t.z)
    const yaw = bikeTelemetry.yaw
    const speed = Math.abs(bikeTelemetry.speed)
    const sp01 = Math.min(1, speed / 19)

    // Yaw lags behind the bike so turns swing the view like a real follow cam.
    if (yawLag.current == null) yawLag.current = yaw
    let dy = yaw - yawLag.current
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    yawLag.current += dy * (1 - Math.exp((helmet ? -18 : -5.5) * dt))
    lagQuat.setFromAxisAngle(Y, yawLag.current)

    if (helmet) {
      tmpQuat.setFromAxisAngle(Y, yaw)
      desired.set(0, 1.42, 0.12).applyQuaternion(tmpQuat).add(tmpPos)
      camera.position.copy(desired)
      if (roughRide) camera.position.y += Math.sin(elapsed.current * 40) * 0.02
      fwd.set(0, 0, -1).applyQuaternion(lagQuat)
      look.copy(camera.position).addScaledVector(fwd, 10)
      look.y -= 0.7
    } else {
      // Portrait phones see less road sideways: sit a little further back and higher.
      const portrait = camera.aspect < 0.9 ? 1 : 0
      const back = 5.2 + sp01 * 1.4 + portrait * 1.6
      const up = 2.3 + sp01 * 0.25 + portrait * 0.55
      desired.set(0, up, back).applyQuaternion(lagQuat).add(tmpPos)
      // Pull in rather than sit inside a wall behind the bike. Only fixed scenery counts: traffic passes behind.
      const ray = (rayRef.current ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }))
      ray.origin.x = tmpPos.x
      ray.origin.y = tmpPos.y + 1.2
      ray.origin.z = tmpPos.z
      const rx = desired.x - tmpPos.x
      const ry = desired.y - ray.origin.y
      const rz = desired.z - tmpPos.z
      const rayLen = Math.hypot(rx, ry, rz)
      ray.dir.x = rx / rayLen
      ray.dir.y = ry / rayLen
      ray.dir.z = rz / rayLen
      const hit = world.castRay(ray, rayLen, true, rapier.QueryFilterFlags.EXCLUDE_KINEMATIC | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC)
      if (hit) {
        const d = Math.max(1.6, hit.timeOfImpact - 0.3)
        desired.set(ray.origin.x + ray.dir.x * d, ray.origin.y + ray.dir.y * d, ray.origin.z + ray.dir.z * d)
      }
      if (roughRide) {
        desired.x += Math.sin(elapsed.current * 35) * 0.06
        desired.y += Math.sin(elapsed.current * 53) * 0.05
      }
      // Critically damped follow; snaps if the bike teleports (reset / spawn).
      if (camera.position.distanceToSquared(desired) > 400) camera.position.copy(desired)
      else camera.position.lerp(desired, 1 - Math.exp(-9 * dt))
      fwd.set(0, 0, -1).applyQuaternion(lagQuat)
      look.copy(tmpPos)
      look.y += 1.05
      look.addScaledVector(fwd, 5 + sp01 * 3)
    }
    camera.lookAt(look)

    const targetFov = helmet ? 74 + sp01 * 6 : 62 + sp01 * 10
    fovRef.current += (targetFov - fovRef.current) * (1 - Math.exp(-4 * dt))
    if (Math.abs(camera.fov - fovRef.current) > 0.05) {
      camera.fov = fovRef.current
      camera.updateProjectionMatrix()
    }
  })

  return null
}
