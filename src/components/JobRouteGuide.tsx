import { useFrame } from '@react-three/fiber'
import { type RefObject, useMemo, useRef } from 'react'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { computeRoute } from '@game/roadRoute'
import { bikeTelemetry, routeTelemetry } from '../roadRules/world/telemetry'
import { useGameStore } from '../store/useGameStore'

/** Slightly above road top (~0.06) so the paint clears the tarmac without z-fighting. */
const ROUTE_Y = 0.085
const DASH = 0.9
const GAP = 0.7
const HALF_WIDTH = 0.17
/** Only this much of the route ahead is painted. */
const PAINT_AHEAD = 170
const MAX_DASHES = Math.ceil(PAINT_AHEAD / (DASH + GAP)) + 1

const COLOUR = { pickup: new THREE.Color(0xef4444), dropoff: new THREE.Color(0x3b82f6) }

/**
 * Writes dashes along the route into a fixed buffer. They are measured back from the stop, so they stay put on the
 * road as the rider moves instead of crawling along with her. Returns the number of dashes written.
 */
function paintDashes(points: readonly (readonly [number, number])[], length: number, out: Float32Array): number {
  let seg = points.length - 2
  // Distance along the route at the start of `seg`.
  let segStart = length - Math.hypot(points[seg + 1]![0] - points[seg]![0], points[seg + 1]![1] - points[seg]![1])
  const pointAt = (s: number, into: [number, number]) => {
    while (seg > 0 && s < segStart) {
      seg--
      segStart -= Math.hypot(points[seg + 1]![0] - points[seg]![0], points[seg + 1]![1] - points[seg]![1])
    }
    const [ax, az] = points[seg]!
    const [bx, bz] = points[seg + 1]!
    const len = Math.hypot(bx - ax, bz - az) || 1
    const t = (s - segStart) / len
    into[0] = ax + (bx - ax) * t
    into[1] = az + (bz - az) * t
  }
  const a: [number, number] = [0, 0]
  const b: [number, number] = [0, 0]
  const pitch = DASH + GAP
  let s = length
  if (length > PAINT_AHEAD) s -= Math.ceil((length - PAINT_AHEAD) / pitch) * pitch
  let n = 0
  for (; s >= DASH && n < MAX_DASHES; s -= pitch) {
    pointAt(s, a)
    pointAt(s - DASH, b)
    const dx = a[0] - b[0]
    const dz = a[1] - b[1]
    const l = Math.hypot(dx, dz) || 1
    const px = (-dz / l) * HALF_WIDTH
    const pz = (dx / l) * HALF_WIDTH
    const o = n * 12
    out[o] = b[0] + px
    out[o + 1] = ROUTE_Y
    out[o + 2] = b[1] + pz
    out[o + 3] = b[0] - px
    out[o + 4] = ROUTE_Y
    out[o + 5] = b[1] - pz
    out[o + 6] = a[0] - px
    out[o + 7] = ROUTE_Y
    out[o + 8] = a[1] - pz
    out[o + 9] = a[0] + px
    out[o + 10] = ROUTE_Y
    out[o + 11] = a[1] + pz
    n++
  }
  return n
}

/**
 * The way to the current job target, painted on the road: follows the streets in the left lane (see `roadRoute.ts`),
 * refreshed a few times a second into one fixed buffer. Publishes the next instruction for the HUD.
 */
export function JobRouteGuide({ rigidBodyRef }: { rigidBodyRef: RefObject<RapierRigidBody | null> }) {
  const geometry = useMemo(() => {
    const index = new Uint16Array(MAX_DASHES * 6)
    for (let k = 0; k < MAX_DASHES; k++) {
      const v = k * 4
      index.set([v, v + 2, v + 1, v, v + 3, v + 2], k * 6)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DASHES * 12), 3).setUsage(THREE.DynamicDrawUsage))
    g.setIndex(new THREE.BufferAttribute(index, 1))
    return g
  }, [])
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const refreshIn = useRef(0)

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m) return
    const job = useGameStore.getState().rideJob
    const rb = rigidBodyRef.current
    if (!job || !rb || routeTelemetry.hidden) {
      m.visible = false
      routeTelemetry.step = null
      return
    }
    refreshIn.current -= delta
    if (refreshIn.current > 0) return
    refreshIn.current = 0.15
    const t = rb.translation()
    const pickup = job.phase === 'pickup'
    const stop = pickup ? job.pickup : job.dropoff
    const route = computeRoute(t.x, t.z, bikeTelemetry.yaw, stop)
    routeTelemetry.step = route.next
    routeTelemetry.length = route.length
    routeTelemetry.stopName = stop.name
    const attr = m.geometry.attributes.position as THREE.BufferAttribute
    const dashes = paintDashes(route.points, route.length, attr.array as Float32Array)
    attr.needsUpdate = true
    m.geometry.setDrawRange(0, dashes * 6)
    material.current?.color.copy(pickup ? COLOUR.pickup : COLOUR.dropoff)
    m.visible = dashes > 0
  })

  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={18} visible={false}>
      <meshBasicMaterial ref={material} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} side={THREE.DoubleSide} />
    </mesh>
  )
}
