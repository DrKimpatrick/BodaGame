import { useFrame } from '@react-three/fiber'
import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import {
  manhattanRoutePoints,
  stickyPickManhattanOrder,
  type RideManhattanOrder,
} from '@game/passengerJobs'
import { useGameStore } from '../store/useGameStore'

const ROUTE_Y = 0.13

/** To passenger — solid red on tarmac. */
const routeMatPickup = new THREE.LineBasicMaterial({
  color: '#ef4444',
  transparent: true,
  opacity: 0.97,
  depthWrite: false,
})

/** To drop-off — solid blue after passenger is on board. */
const routeMatDropoff = new THREE.LineBasicMaterial({
  color: '#2563eb',
  transparent: true,
  opacity: 0.97,
  depthWrite: false,
})

/**
 * L-shaped route on the ground from bike to current job target (pickup or drop-off).
 * Leg order follows bike facing and switches when the other axis is a clearly better match (re-route).
 */
export function JobRouteGuide({
  rigidBodyRef,
}: {
  rigidBodyRef: RefObject<RapierRigidBody | null>
}) {
  const geom = useMemo(() => new THREE.BufferGeometry(), [])
  const linePickup = useMemo(() => {
    const ln = new THREE.Line(geom, routeMatPickup)
    ln.frustumCulled = false
    return ln
  }, [geom])
  const lineDropoff = useMemo(() => {
    const ln = new THREE.Line(geom, routeMatDropoff)
    ln.frustumCulled = false
    ln.visible = false
    return ln
  }, [geom])
  const pos = useRef<Float32Array>(new Float32Array(9))
  const posAttr = useMemo(
    () => new THREE.BufferAttribute(pos.current, 3),
    [],
  )

  const orderRef = useRef<RideManhattanOrder>('xFirst')
  const navKeyRef = useRef('')
  const quatTmp = useMemo(() => new THREE.Quaternion(), [])
  const forwardTmp = useMemo(() => new THREE.Vector3(), [])

  useLayoutEffect(() => {
    geom.setAttribute('position', posAttr)
    return () => {
      geom.dispose()
    }
  }, [geom, posAttr])

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
    const arr = pos.current
    let i = 0
    for (const p of pts) {
      arr[i++] = p[0]
      arr[i++] = p[1]
      arr[i++] = p[2]
    }
    posAttr.needsUpdate = true
    geom.setDrawRange(0, pts.length)

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
