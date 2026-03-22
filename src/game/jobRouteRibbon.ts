import * as THREE from 'three'

/**
 * Flat XZ ribbon along consecutive points (sharp corners). Good for thick “navigation” paint on tarmac.
 */
export function updateRouteRibbonXZ(
  geom: THREE.BufferGeometry,
  pts: readonly [number, number, number][],
  y: number,
  halfWidth: number,
): boolean {
  const positions: number[] = []
  const indices: number[] = []
  for (let s = 0; s < pts.length - 1; s++) {
    const ax = pts[s][0]
    const az = pts[s][2]
    const bx = pts[s + 1][0]
    const bz = pts[s + 1][2]
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    if (len < 1e-4) continue
    const px = (-dz / len) * halfWidth
    const pz = (dx / len) * halfWidth
    const b = positions.length / 3
    positions.push(
      ax + px,
      y,
      az + pz,
      ax - px,
      y,
      az - pz,
      bx - px,
      y,
      bz - pz,
      bx + px,
      y,
      bz + pz,
    )
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }
  if (positions.length < 9) {
    geom.setIndex(null)
    geom.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    return false
  }
  geom.setIndex(indices)
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.computeBoundingSphere()
  return true
}
