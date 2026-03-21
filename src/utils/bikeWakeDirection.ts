import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'

/**
 * Sets `out` to the horizontal **unit** vector pointing **opposite** to actual travel
 * (i.e. behind the bike along its path — where dust/exhaust should drift).
 *
 * Prefers **signed speed × body forward** (same as Boda’s `forward * speed`) so it
 * stays correct for reverse and doesn’t depend on noisy `linvel`.
 */
export function setOppositeTravelDirHorizontal(
  body: RapierRigidBody,
  signedSpeed: number,
  bodyRotation: THREE.Quaternion,
  tmpForward: THREE.Vector3,
  out: THREE.Vector3,
): boolean {
  tmpForward.set(0, 0, -1).applyQuaternion(bodyRotation)
  tmpForward.y = 0
  const fLen = tmpForward.length()
  if (fLen < 1e-6) return false
  tmpForward.multiplyScalar(1 / fLen)

  if (Math.abs(signedSpeed) > 0.02) {
    const s = Math.sign(signedSpeed)
    out.set(-tmpForward.x * s, 0, -tmpForward.z * s)
    return true
  }

  const lv = body.linvel()
  const h = Math.hypot(lv.x, lv.z)
  if (h > 0.04) {
    out.set(-lv.x / h, 0, -lv.z / h)
    return true
  }

  out.set(0, 0, 0)
  return false
}
