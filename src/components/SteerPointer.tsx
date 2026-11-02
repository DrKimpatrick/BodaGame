import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bikeTelemetry } from '../roadRules/world/telemetry'
import { useSettingsStore } from '../store/useSettingsStore'

/**
 * Chevrons on the road ahead of the bike, along the curve it will follow if the steering stays as it is. They reach
 * further ahead at speed, and the far ones are larger so they still read. One draw call; can be switched off in Settings.
 */

const CHEVRONS = 5
/** Road surface plus enough to clear markings. */
const Y = 0.1
/** The rider hides the road for a few metres ahead of the bike in the chase view. */
const FIRST_M = 6
/** Spacing between chevrons at walking pace, and how much it grows with speed. */
const MIN_GAP_M = 3
const GAP_PER_MS = 0.2
/** Below this speed the curve is drawn as for a slow roll, so it doesn't spin on the spot. */
const MIN_SPEED = 3
/** Tightest curve drawn (rad per metre). A full-lock turn at walking pace is tighter than this, but the arrows would only circle the rider. */
const MAX_TURN_PER_M = 0.1

function chevronGeometry() {
  // Points along −Z, the bike's forward.
  const s = new THREE.Shape()
  s.moveTo(-0.62, 0.3)
  s.lineTo(0, -0.3)
  s.lineTo(0.62, 0.3)
  s.lineTo(0.36, 0.3)
  s.lineTo(0, -0.05)
  s.lineTo(-0.36, 0.3)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(Math.PI / 2)
  return g
}

const dummy = new THREE.Object3D()

export function SteerPointer() {
  const on = useSettingsStore((s) => s.pointer)
  const ref = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => chevronGeometry(), [])

  useFrame(() => {
    const m = ref.current
    if (!m) return
    const b = bikeTelemetry
    const speed = Math.max(MIN_SPEED, Math.abs(b.speed))
    const gap = MIN_GAP_M + speed * GAP_PER_MS
    const turnPerM = Math.max(-MAX_TURN_PER_M, Math.min(MAX_TURN_PER_M, b.yawRate / speed))
    let x = b.x
    let z = b.z
    let yaw = b.yaw
    let step = FIRST_M
    for (let k = 0; k < CHEVRONS; k++) {
      // Walk along the curve in small steps, turning as the bike would.
      const pieces = 3
      for (let p = 0; p < pieces; p++) {
        const ds = step / pieces
        yaw += turnPerM * ds
        x -= Math.sin(yaw) * ds
        z -= Math.cos(yaw) * ds
      }
      step = gap
      dummy.position.set(x, Y, z)
      dummy.rotation.set(0, yaw, 0)
      const size = 1 + k * 0.25
      dummy.scale.set(size, 1, size)
      dummy.updateMatrix()
      m.setMatrixAt(k, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  if (!on) return null
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, CHEVRONS]} frustumCulled={false} renderOrder={6}>
      <meshBasicMaterial color="#fff1b8" transparent opacity={0.9} depthWrite={false} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} toneMapped={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}
