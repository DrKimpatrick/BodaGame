import { useFrame } from '@react-three/fiber'
import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import type { RapierRigidBody } from '@react-three/rapier'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { computeRoute } from '@game/roadRoute'
import { bikeTelemetry, routeTelemetry } from '../roadRules/world/telemetry'
import { useGameStore } from '../store/useGameStore'

/** Slightly above road top (~0.06) so the stroke clears tarmac without z-fighting. */
const ROUTE_Y = 0.085

/**
 * Wide dashed “paint” on the ground. Plain THREE.Line is ~1px in WebGL and reads as invisible
 * from the chase cam; Line2 + LineMaterial uses mesh quads with world-space width.
 */
function routeLineMaterial(
  color: number,
  linewidth: number,
  dashSize: number,
  gapSize: number,
): LineMaterial {
  return new LineMaterial({
    color,
    linewidth,
    worldUnits: true,
    dashed: true,
    dashScale: 1,
    dashSize,
    gapSize,
    transparent: false,
    opacity: 1,
    depthWrite: false,
    depthTest: true,
  })
}

/**
 * The way to the current job target, drawn on the road: follows the streets in the left lane (see `roadRoute.ts`),
 * refreshed a few times a second. Publishes the next instruction for the HUD.
 */
export function JobRouteGuide({
  rigidBodyRef,
}: {
  rigidBodyRef: RefObject<RapierRigidBody | null>
}) {
  const lineGeom = useMemo(() => new LineGeometry(), [])
  const matPickup = useMemo(() => routeLineMaterial(0xef4444, 0.34, 0.9, 0.7), [])
  const matDropoff = useMemo(() => routeLineMaterial(0x3b82f6, 0.34, 0.9, 0.7), [])

  const linePickup = useMemo(() => {
    const ln = new Line2(lineGeom, matPickup)
    ln.frustumCulled = false
    ln.renderOrder = 18
    return ln
  }, [lineGeom, matPickup])

  const lineDropoff = useMemo(() => {
    const ln = new Line2(lineGeom, matDropoff)
    ln.frustumCulled = false
    ln.renderOrder = 18
    ln.visible = false
    return ln
  }, [lineGeom, matDropoff])

  const refreshIn = useRef(0)

  useLayoutEffect(() => {
    return () => {
      lineGeom.dispose()
      matPickup.dispose()
      matDropoff.dispose()
    }
  }, [lineGeom, matPickup, matDropoff])

  useFrame((_, delta) => {
    const job = useGameStore.getState().rideJob
    const rb = rigidBodyRef.current
    if (!job || !rb || routeTelemetry.hidden) {
      linePickup.visible = false
      lineDropoff.visible = false
      routeTelemetry.step = null
      return
    }
    linePickup.visible = job.phase === 'pickup'
    lineDropoff.visible = job.phase !== 'pickup'
    refreshIn.current -= delta
    if (refreshIn.current > 0) return
    refreshIn.current = 0.12
    const t = rb.translation()
    const stop = job.phase === 'pickup' ? job.pickup : job.dropoff
    const route = computeRoute(t.x, t.z, bikeTelemetry.yaw, stop)
    routeTelemetry.step = route.next
    routeTelemetry.length = route.length
    routeTelemetry.stopName = stop.name
    const fp = new Float32Array(route.points.length * 3)
    route.points.forEach(([x, z], i) => {
      fp[i * 3] = x
      fp[i * 3 + 1] = ROUTE_Y
      fp[i * 3 + 2] = z
    })
    lineGeom.setPositions(fp)
    ;(job.phase === 'pickup' ? linePickup : lineDropoff).computeLineDistances()
  })

  return (
    <group>
      <primitive object={linePickup} />
      <primitive object={lineDropoff} />
    </group>
  )
}
