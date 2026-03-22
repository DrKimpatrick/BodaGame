import { useFrame } from '@react-three/fiber'
import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import { Line2, LineGeometry, LineMaterial } from 'three-stdlib'
import {
  manhattanRoutePoints,
  stickyPickManhattanOrder,
  type RideManhattanOrder,
} from '@game/passengerJobs'
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
 * L-shaped route on the ground from bike to current job target (pickup or drop-off).
 * Leg order follows bike facing and switches when the other axis is a clearly better match (re-route).
 */
export function JobRouteGuide({
  rigidBodyRef,
}: {
  rigidBodyRef: RefObject<RapierRigidBody | null>
}) {
  const lineGeom = useMemo(() => new LineGeometry(), [])
  const matPickup = useMemo(
    () => routeLineMaterial(0xdc2626, 0.52, 0.26, 0.4),
    [],
  )
  const matDropoff = useMemo(
    () => routeLineMaterial(0x1d4ed8, 0.6, 0.48, 0.32),
    [],
  )

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

  const flatPos = useRef(new Float32Array(9))

  const orderRef = useRef<RideManhattanOrder>('xFirst')
  const navKeyRef = useRef('')
  const quatTmp = useMemo(() => new THREE.Quaternion(), [])
  const forwardTmp = useMemo(() => new THREE.Vector3(), [])

  useLayoutEffect(() => {
    return () => {
      lineGeom.dispose()
      matPickup.dispose()
      matDropoff.dispose()
    }
  }, [lineGeom, matPickup, matDropoff])

  useFrame(() => {
    const job = useGameStore.getState().rideJob
    const rb = rigidBodyRef.current
    if (!job || !rb) {
      linePickup.visible = false
      lineDropoff.visible = false
      return
    }
    const t = rb.translation()
    const tx = job.phase === 'pickup' ? job.pickup.x : job.dropoff.x
    const tz = job.phase === 'pickup' ? job.pickup.z : job.dropoff.z

    const navKey = `${job.phase}-${tx.toFixed(2)}-${tz.toFixed(2)}`
    if (navKey !== navKeyRef.current) {
      navKeyRef.current = navKey
      orderRef.current = 'xFirst'
    }

    const q = rb.rotation()
    quatTmp.set(q.x, q.y, q.z, q.w)
    forwardTmp.set(0, 0, -1).applyQuaternion(quatTmp)
    const hx = forwardTmp.x
    const hz = forwardTmp.z

    const nextOrder = stickyPickManhattanOrder(
      t.x,
      t.z,
      tx,
      tz,
      hx,
      hz,
      orderRef.current,
    )
    if (nextOrder !== orderRef.current) {
      orderRef.current = nextOrder
    }
    const st = useGameStore.getState()
    if (st.rideJobRouteOrder !== orderRef.current) {
      useGameStore.setState({ rideJobRouteOrder: orderRef.current })
    }

    const pts = manhattanRoutePoints(t.x, t.z, tx, tz, ROUTE_Y, orderRef.current)
    const fp = flatPos.current
    let i = 0
    for (const p of pts) {
      fp[i++] = p[0]
      fp[i++] = p[1]
      fp[i++] = p[2]
    }
    lineGeom.setPositions(fp.subarray(0, pts.length * 3))
    linePickup.computeLineDistances()

    if (job.phase === 'pickup') {
      linePickup.visible = true
      lineDropoff.visible = false
    } else {
      linePickup.visible = false
      lineDropoff.visible = true
    }
  })

  return (
    <group>
      <primitive object={linePickup} />
      <primitive object={lineDropoff} />
    </group>
  )
}
