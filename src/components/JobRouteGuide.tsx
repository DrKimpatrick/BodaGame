import { useFrame } from '@react-three/fiber'
import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import { manhattanRoutePoints } from '@game/passengerJobs'
import { useGameStore } from '../store/useGameStore'

const ROUTE_Y = 0.13

/** To passenger — yellow dotted / dashed on tarmac. */
const routeMatPickup = new THREE.LineDashedMaterial({
  color: '#fde047',
  dashSize: 0.58,
  gapSize: 0.4,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
})

/** To drop-off — solid yellow after passenger is on board. */
const routeMatDropoff = new THREE.LineBasicMaterial({
  color: '#facc15',
  transparent: true,
  opacity: 0.94,
  depthWrite: false,
})

/**
 * L-shaped route on the ground from bike to current job target (pickup or drop-off).
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
    const pts = manhattanRoutePoints(t.x, t.z, tx, tz, ROUTE_Y)
    const arr = pos.current
    let i = 0
    for (const p of pts) {
      arr[i++] = p[0]
      arr[i++] = p[1]
      arr[i++] = p[2]
    }
    posAttr.needsUpdate = true
    if (job.phase === 'pickup') {
      linePickup.visible = true
      lineDropoff.visible = false
      linePickup.computeLineDistances()
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
