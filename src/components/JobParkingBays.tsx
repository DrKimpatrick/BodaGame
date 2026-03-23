import { useMemo } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../store/useGameStore'

const BAY_Y = 0.068
const LINE_Y = BAY_Y + 0.001
const BAY_LEN = 3.8
const BAY_W = 1.85
const SIDE_OFFSET = 0.28

const bayFillMat = new THREE.MeshBasicMaterial({
  color: '#f8fafc',
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -1.2,
  polygonOffsetUnits: -1,
})

const bayLineMat = new THREE.MeshBasicMaterial({
  color: '#f1f5f9',
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -1.6,
  polygonOffsetUnits: -1,
})

function Bay({
  x,
  z,
  rotY,
  sideSign,
}: {
  x: number
  z: number
  rotY: number
  sideSign: 1 | -1
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[sideSign * SIDE_OFFSET, BAY_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={bayFillMat}>
        <planeGeometry args={[BAY_W, BAY_LEN]} />
      </mesh>
      <mesh position={[sideSign * SIDE_OFFSET - BAY_W / 2, LINE_Y, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} material={bayLineMat}>
        <planeGeometry args={[0.08, BAY_LEN]} />
      </mesh>
      <mesh position={[sideSign * SIDE_OFFSET + BAY_W / 2, LINE_Y, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} material={bayLineMat}>
        <planeGeometry args={[0.08, BAY_LEN]} />
      </mesh>
      <mesh position={[sideSign * SIDE_OFFSET, LINE_Y, BAY_LEN / 2]} rotation={[-Math.PI / 2, 0, 0]} material={bayLineMat}>
        <planeGeometry args={[BAY_W, 0.08]} />
      </mesh>
      <mesh position={[sideSign * SIDE_OFFSET, LINE_Y, -BAY_LEN / 2]} rotation={[-Math.PI / 2, 0, 0]} material={bayLineMat}>
        <planeGeometry args={[BAY_W, 0.08]} />
      </mesh>
    </group>
  )
}

export function JobParkingBays() {
  const job = useGameStore((s) => s.rideJob)

  const bays = useMemo(() => {
    if (!job) return []
    return [job.pickup, job.dropoff].map((stop, i) => {
      const rotY = stop.roadAxis === 'vertical' ? 0 : Math.PI / 2
      return {
        key: `bay-${i}-${stop.name}`,
        x: stop.x,
        z: stop.z,
        rotY,
        sideSign: stop.sideSign,
      }
    })
  }, [job])

  if (!job) return null

  return (
    <group>
      {bays.map((b) => (
        <Bay
          key={b.key}
          x={b.x}
          z={b.z}
          rotY={b.rotY}
          sideSign={b.sideSign}
        />
      ))}
    </group>
  )
}
