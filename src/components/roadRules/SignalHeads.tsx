import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  axisOf,
  faceOncomingYaw,
  approachHalf,
  crossHalf,
  headingVec,
  HEADINGS,
  JUNCTIONS,
  leftVec,
  signalAspect,
  STOP_LINE_GAP,
  type Aspect,
  type Heading,
  type Junction,
} from '../../roadRules/world/junctions'
import { worldClock } from '../../roadRules/world/telemetry'

/**
 * Every traffic signal in the city, drawn with instanced meshes (a handful of draw calls in total) and
 * driven from one frame loop. Each signalised approach gets a primary head on the near-left corner; the
 * same pole carries a second head facing the opposite approach (its far-side repeater), as on real
 * British-pattern junctions.
 */

type Head = { jn: Junction; serves: Heading; px: number; pz: number; yaw: number }

const POLE_H = 3.1
const HEAD_Y = 2.45
const LAMP_DY = 0.29
const LAMP_Z = 0.2
const HEAD_OFF = 0.11

function buildHeads(): { heads: Head[]; poles: { x: number; z: number }[] } {
  const heads: Head[] = []
  const poles: { x: number; z: number }[] = []
  const opposite: Record<Heading, Heading> = { N: 'S', S: 'N', E: 'W', W: 'E' }
  for (const jn of JUNCTIONS) {
    if (jn.control !== 'signal') continue
    for (const h of HEADINGS) {
      const hv = headingVec(h)
      const lv = leftVec(h)
      const back = crossHalf(jn, h) + STOP_LINE_GAP + 0.35
      const side = approachHalf(jn, h) + 0.5
      const px = jn.x - hv.x * back + lv.x * side
      const pz = jn.z - hv.z * back + lv.z * side
      poles.push({ x: px, z: pz })
      heads.push({ jn, serves: h, px, pz, yaw: faceOncomingYaw(h) })
      // Back-to-back repeater for traffic arriving from the other side (it is their far-right signal).
      heads.push({ jn, serves: opposite[h], px, pz, yaw: faceOncomingYaw(opposite[h]) })
    }
  }
  return { heads, poles }
}

const LAMP_ON: Record<Aspect, THREE.Color> = {
  red: new THREE.Color('#ff2a1a').multiplyScalar(2.2),
  amber: new THREE.Color('#ffae00').multiplyScalar(2.2),
  green: new THREE.Color('#19ff7a').multiplyScalar(2.0),
}
const LAMP_OFF: Record<Aspect, THREE.Color> = {
  red: new THREE.Color('#2a0806'),
  amber: new THREE.Color('#2a1c04'),
  green: new THREE.Color('#05200f'),
}
const ASPECT_CODE: Record<Aspect, number> = { green: 0, amber: 1, red: 2 }
const LAMPS: Aspect[] = ['red', 'amber', 'green']

const poleGeo = new THREE.CylinderGeometry(0.055, 0.07, POLE_H, 10)
poleGeo.translate(0, POLE_H / 2, 0)
const housingGeo = new THREE.BoxGeometry(0.32, 0.95, 0.24)
const backboardGeo = new THREE.BoxGeometry(0.56, 1.18, 0.03)
const lampGeo = new THREE.SphereGeometry(0.095, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)
lampGeo.rotateX(Math.PI / 2)
const visorGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.2, 12, 1, true, -Math.PI / 2, Math.PI)
visorGeo.rotateX(Math.PI / 2)
visorGeo.rotateZ(Math.PI)
const haloGeo = new THREE.CircleGeometry(0.34, 20)

const poleMat = new THREE.MeshStandardMaterial({ color: '#5b6168', roughness: 0.55, metalness: 0.6 })
const housingMat = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.7, metalness: 0.2 })
const backboardMat = new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.85 })
const lampMat = new THREE.MeshBasicMaterial({ toneMapped: false })
const haloMat = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
})

const tmpMatrix = new THREE.Matrix4()

export function SignalHeads() {
  const { heads, poles } = useMemo(() => buildHeads(), [])
  const poleRef = useRef<THREE.InstancedMesh>(null)
  const housingRef = useRef<THREE.InstancedMesh>(null)
  const backboardRef = useRef<THREE.InstancedMesh>(null)
  const visorRef = useRef<THREE.InstancedMesh>(null)
  const redRef = useRef<THREE.InstancedMesh>(null)
  const amberRef = useRef<THREE.InstancedMesh>(null)
  const greenRef = useRef<THREE.InstancedMesh>(null)
  const lampRefs = useMemo(() => [redRef, amberRef, greenRef], [])
  const colorArrays = useMemo(
    () => [0, 1, 2, 3].map(() => new Float32Array(heads.length * 3)),
    [heads.length],
  )
  const haloRef = useRef<THREE.InstancedMesh>(null)
  const lastAspect = useRef(new Int8Array(0))
  /** Halo matrices per head for each aspect (index aspectCode*n + i). */
  const haloMatrices = useMemo(() => new Float32Array(heads.length * 3 * 16), [heads.length])

  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    poles.forEach((p, i) => {
      o.position.set(p.x, 0, p.z)
      o.rotation.set(0, 0, 0)
      o.updateMatrix()
      poleRef.current!.setMatrixAt(i, o.matrix)
    })
    const local = new THREE.Vector3()
    const place = (h: Head, ly: number, lz: number) => {
      q.setFromAxisAngle(up, h.yaw)
      local.set(0, ly, lz).applyQuaternion(q)
      o.position.set(h.px + local.x, local.y, h.pz + local.z)
      o.quaternion.copy(q)
      o.updateMatrix()
      return o.matrix
    }
    heads.forEach((h, i) => {
      housingRef.current!.setMatrixAt(i, place(h, HEAD_Y, HEAD_OFF + 0.12))
      backboardRef.current!.setMatrixAt(i, place(h, HEAD_Y, HEAD_OFF))
      LAMPS.forEach((_, li) => {
        const y = HEAD_Y + LAMP_DY * (1 - li)
        lampRefs[li]!.current!.setMatrixAt(i, place(h, y, HEAD_OFF + LAMP_Z + 0.04))
        visorRef.current!.setMatrixAt(i * 3 + li, place(h, y + 0.02, HEAD_OFF + LAMP_Z + 0.12))
        // Halo for this lamp, used when it is the lit one (aspect order red/amber/green → code 2/1/0).
        const code = ASPECT_CODE[LAMPS[li]!]
        place(h, y, HEAD_OFF + LAMP_Z + 0.16).toArray(haloMatrices, (code * heads.length + i) * 16)
      })
    })
    for (const r of [poleRef, housingRef, backboardRef, visorRef, ...lampRefs]) {
      r.current!.instanceMatrix.needsUpdate = true
      r.current!.computeBoundingSphere()
    }
    lastAspect.current = new Int8Array(heads.length).fill(-1)
  }, [heads, poles, haloMatrices, lampRefs])

  useFrame(() => {
    const t = worldClock.t
    const lamps = lampRefs.map((r) => r.current)
    const halo = haloRef.current
    if (!halo || lamps.some((l) => !l)) return
    let changed = false
    const m = tmpMatrix
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i]!
      const a = signalAspect(h.jn, axisOf(h.serves), t)
      const code = ASPECT_CODE[a]
      if (lastAspect.current[i] === code) continue
      lastAspect.current[i] = code
      changed = true
      for (let li = 0; li < 3; li++) {
        const lampAspect = LAMPS[li]!
        lamps[li]!.setColorAt(i, lampAspect === a ? LAMP_ON[lampAspect] : LAMP_OFF[lampAspect])
      }
      m.fromArray(haloMatrices, (code * heads.length + i) * 16)
      halo.setMatrixAt(i, m)
      halo.setColorAt(i, LAMP_ON[a])
    }
    if (changed) {
      for (const l of lamps) l!.instanceColor!.needsUpdate = true
      halo.instanceMatrix.needsUpdate = true
      halo.instanceColor!.needsUpdate = true
      halo.computeBoundingSphere()
    }
  })

  const n = heads.length
  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeo, poleMat, poles.length]} castShadow />
      <instancedMesh ref={backboardRef} args={[backboardGeo, backboardMat, n]} castShadow />
      <instancedMesh ref={housingRef} args={[housingGeo, housingMat, n]} castShadow />
      <instancedMesh ref={visorRef} args={[visorGeo, housingMat, n * 3]} />
      {LAMPS.map((a, li) => (
        <instancedMesh key={a} ref={lampRefs[li]} args={[lampGeo, lampMat, n]}>
          <instancedBufferAttribute attach="instanceColor" args={[colorArrays[li]!, 3]} />
        </instancedMesh>
      ))}
      <instancedMesh ref={haloRef} args={[haloGeo, haloMat, n]} frustumCulled={false}>
        <instancedBufferAttribute attach="instanceColor" args={[colorArrays[3]!, 3]} />
      </instancedMesh>
    </group>
  )
}
