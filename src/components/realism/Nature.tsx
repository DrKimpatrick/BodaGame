import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { segmentRandom } from '../../game/roadDecorPlacements'

/**
 * Trees and static people built from shared, pre-merged geometry with vertex colours (cheap to batch).
 * Canopies are clusters of noise-displaced blobs, lighter on top and darker underneath, instead of
 * single flat-shaded icosahedrons.
 */

function displacedBlob(radius: number, seed: number, top: THREE.Color, bottom: THREE.Color) {
  const g = new THREE.IcosahedronGeometry(radius, 1)
  const pos = g.attributes.position!
  const colors = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.z * 2.7 + seed * 1.3) * Math.sin(v.y * 3.7 + seed * 0.7)
    v.multiplyScalar(1 + n * 0.22)
    v.y *= 0.78
    pos.setXYZ(i, v.x, v.y, v.z)
    const t = THREE.MathUtils.clamp(v.y / radius * 0.5 + 0.5, 0, 1)
    c.copy(bottom).lerp(top, t)
    // Speckle so the canopy doesn't read as one flat colour.
    const sp = (Math.sin(i * 12.9898 + seed) * 43758.5453) % 1
    c.multiplyScalar(0.88 + Math.abs(sp) * 0.24)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

/** Non-indexed copy (Icosahedron is already non-indexed; calling toNonIndexed on it only warns). */
const ni = (g: THREE.BufferGeometry): THREE.BufferGeometry => (g.index ? g.toNonIndexed() : g)

function colored(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color)
  const n = g.attributes.position!.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

function branch(len: number, r0: number, r1: number, tilt: number, yaw: number, y: number, color: string) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 7)
  g.translate(0, len / 2, 0)
  g.rotateZ(tilt)
  g.rotateY(yaw)
  g.translate(0, y, 0)
  return colored(ni(g), color)
}

const CANOPY_TONES: [string, string][] = [
  ['#4f7d2c', '#1f3d16'],
  ['#5d8a35', '#24461b'],
  ['#3f6e2a', '#183214'],
]

/** Broadleaf tree (mango / fig-like) variants, merged into one geometry each. */
function buildBroadleaf(variant: number) {
  const [topC, botC] = CANOPY_TONES[variant % CANOPY_TONES.length]!
  const top = new THREE.Color(topC)
  const bot = new THREE.Color(botC)
  const parts: THREE.BufferGeometry[] = []
  const trunkH = 2.4 + variant * 0.3
  parts.push(branch(trunkH, 0.24, 0.16, 0, 0, 0, '#4a3b2c'))
  parts.push(branch(1.5, 0.11, 0.06, 0.7, variant, trunkH - 0.5, '#4a3b2c'))
  parts.push(branch(1.4, 0.1, 0.05, -0.65, variant + 2, trunkH - 0.3, '#4a3b2c'))
  const blobs = 5 + variant
  for (let b = 0; b < blobs; b++) {
    const a = (b / blobs) * Math.PI * 2 + variant
    const rad = b === 0 ? 0 : 1.05 + segmentRandom(variant, b, 1) * 0.4
    const r = b === 0 ? 1.7 : 1.05 + segmentRandom(variant, b, 2) * 0.5
    const g = ni(displacedBlob(r, variant * 10 + b, top, bot))
    g.translate(Math.cos(a) * rad, trunkH + 1.0 + segmentRandom(variant, b, 3) * 0.7, Math.sin(a) * rad)
    parts.push(g)
  }
  return mergeGeometries(parts.map(ni))!
}

/** Palm with a slightly curved ringed trunk and drooping fronds. */
function buildPalm(variant: number) {
  const parts: THREE.BufferGeometry[] = []
  const segs = 5
  let x = 0
  let y = 0
  const lean = 0.06 + variant * 0.03
  for (let s = 0; s < segs; s++) {
    const len = 1.15
    const g = new THREE.CylinderGeometry(0.15 - s * 0.012, 0.17 - s * 0.012, len, 8)
    g.translate(0, len / 2, 0)
    g.rotateZ(-lean * (s + 1) * 0.5)
    g.translate(x, y, 0)
    parts.push(colored(ni(g), s % 2 ? '#6b5a45' : '#5a4a38'))
    x += Math.sin(lean * (s + 1) * 0.5) * len
    y += Math.cos(lean * (s + 1) * 0.5) * len
  }
  const fronds = 9
  for (let f = 0; f < fronds; f++) {
    const len = 2.6 + segmentRandom(variant, f, 9) * 0.6
    const g = new THREE.PlaneGeometry(0.55, len, 1, 6)
    const p = g.attributes.position!
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + len / 2) / len // 0 at base → 1 at tip
      p.setX(i, p.getX(i) * (1 - t * 0.85))
      p.setZ(i, -t * t * 1.4) // droop
      p.setY(i, t * len)
    }
    g.rotateX(-Math.PI / 2 + 0.5)
    g.rotateY((f / fronds) * Math.PI * 2 + variant)
    g.translate(x, y, 0)
    parts.push(colored(ni(g), f % 2 ? '#3f7a2a' : '#4f8f33'))
  }
  return mergeGeometries(parts)!
}

const broadleaf = [0, 1, 2].map(buildBroadleaf)
const palms = [0, 1].map(buildPalm)
const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })

export function RealTree({ x, z, scale = 1, seed = 0 }: { x: number; z: number; scale?: number; seed?: number }) {
  const palm = segmentRandom(seed, 3, 41) < 0.25
  const geo = palm ? palms[seed % palms.length]! : broadleaf[seed % broadleaf.length]!
  const rot = segmentRandom(seed, 5, 43) * Math.PI * 2
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      <mesh geometry={geo} material={treeMat} scale={scale} rotation={[0, rot, 0]} castShadow receiveShadow />
      <CylinderCollider args={[1.4 * scale, 0.3 * scale]} position={[0, 1.4 * scale, 0]} />
    </RigidBody>
  )
}

/* ---------- Standing person (static) ---------- */

const SKINS = ['#5b3a26', '#6b4423', '#7a4b2a', '#4a2f1f', '#8d5524']
const DRESSES = ['#b91c1c', '#7c3aed', '#0e7490', '#ca8a04', '#be185d', '#15803d', '#ea580c']
const SHIRTS = ['#f8fafc', '#1d4ed8', '#047857', '#b45309', '#334155', '#7f1d1d']
const TROUSERS = ['#1e293b', '#292524', '#3f3f46', '#57534e']

function buildPerson(female: boolean, skin: string, top: string, bottom: string, hair: string) {
  const parts: THREE.BufferGeometry[] = []
  const cap = (r: number, len: number, x: number, y: number, z: number, color: string, rz = 0) => {
    const g = new THREE.CapsuleGeometry(r, len, 3, 8)
    g.rotateZ(rz)
    g.translate(x, y, z)
    parts.push(colored(ni(g), color))
  }
  cap(0.068, 0.66, 0.09, 0.46, 0, female ? skin : bottom)
  cap(0.068, 0.66, -0.09, 0.46, 0, female ? skin : bottom)
  const torso = new THREE.CapsuleGeometry(0.15, 0.32, 4, 10).scale(1.08, 1, 0.72).translate(0, 1.17, 0)
  parts.push(colored(ni(torso), top))
  if (female) {
    const dress = new THREE.CylinderGeometry(0.17, 0.32, 0.86, 14, 1, true).translate(0, 0.55, 0)
    parts.push(colored(ni(dress), bottom))
  }
  cap(0.05, 0.5, 0.21, 1.06, 0, female ? skin : top, 0.08)
  cap(0.05, 0.5, -0.21, 1.06, 0, female ? skin : top, -0.08)
  const head = new THREE.SphereGeometry(0.105, 14, 12).scale(0.92, 1.05, 1).translate(0, 1.57, 0.01)
  parts.push(colored(ni(head), skin))
  const hairG = new THREE.SphereGeometry(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.9, 1).translate(0, 1.6, 0)
  parts.push(colored(ni(hairG), hair))
  return mergeGeometries(parts)!
}

const people = Array.from({ length: 8 }, (_, k) => {
  const female = k % 2 === 0
  return buildPerson(
    female,
    SKINS[k % SKINS.length]!,
    female ? DRESSES[k % DRESSES.length]! : SHIRTS[k % SHIRTS.length]!,
    female ? DRESSES[(k + 3) % DRESSES.length]! : TROUSERS[k % TROUSERS.length]!,
    female && k % 4 === 0 ? '#facc15' : '#15100c',
  )
})
const personMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide })

export function StandingHuman({ x, z, rotationY = 0, seed = 0 }: { x: number; z: number; rotationY?: number; seed?: number }) {
  const geo = people[Math.abs(seed) % people.length]!
  const s = 0.92 + (Math.abs(seed) % 7) * 0.02
  return <mesh geometry={geo} material={personMat} position={[x, 0.02, z]} rotation={[0, rotationY, 0]} scale={s} castShadow />
}
