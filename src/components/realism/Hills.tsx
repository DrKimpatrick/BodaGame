import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HILLS } from '../../game/kampalaMap'
import { segmentRandom } from '../../game/roadDecorPlacements'
import { useSettingsStore } from '../../store/useSettingsStore'

/**
 * Kampala's hills on the horizon (it is "the city of seven hills"), seen through the haze: green slopes
 * with red-soil patches, thousands of houses, and the landmarks that crown them — Gaddafi Mosque's
 * minaret on Old Kampala, Rubaga's twin towers, Namirembe Cathedral, Kibuli Mosque, the Bahá'í dome,
 * the Kabaka's palace at Mengo and the masts on Kololo. Rendered as one merged mesh plus one instanced
 * mesh for houses, so it costs a few draw calls.
 */

const HILL_RADIUS = 150

type HillDef = (typeof HILLS)[number]

function hillCentre(h: HillDef) {
  const a = (h.azimuth * Math.PI) / 180
  return { x: Math.sin(a) * h.distance, z: Math.cos(a) * h.distance }
}

function hillHeight(h: HillDef, dx: number, dz: number) {
  const d = Math.hypot(dx, dz) / HILL_RADIUS
  if (d >= 1) return 0
  const c = Math.cos((d * Math.PI) / 2)
  return h.height * c * c
}

function buildTerrain(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const green = new THREE.Color('#4d7a35')
  const dark = new THREE.Color('#2f5726')
  const soil = new THREE.Color('#9a5a36')
  const tmp = new THREE.Color()
  HILLS.forEach((h, hi) => {
    // Polar grid for a smooth dome.
    const rings = 10
    const segs = 40
    const pos: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const c = hillCentre(h)
    for (let r = 0; r <= rings; r++) {
      for (let s = 0; s <= segs; s++) {
        const rr = (r / rings) * HILL_RADIUS
        const a = (s / segs) * Math.PI * 2
        const dx = Math.cos(a) * rr
        const dz = Math.sin(a) * rr
        const n = Math.sin(dx * 0.05 + hi) * Math.cos(dz * 0.06 + hi * 2) * 3
        const y = hillHeight(h, dx, dz) + (r > 0 && r < rings ? n : 0) - 0.6
        pos.push(c.x + dx, y, c.z + dz)
        const patch = segmentRandom(hi * 31 + r, s, 9101)
        tmp.copy(green).lerp(dark, segmentRandom(r, s + hi, 9102) * 0.6)
        if (patch > 0.82) tmp.lerp(soil, 0.7)
        col.push(tmp.r, tmp.g, tmp.b)
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s
        const b = a + segs + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    parts.push(geo.toNonIndexed())
  })
  // Rolling ground ring beyond the city fence so the hills sit on land, not in the void.
  const ring = new THREE.RingGeometry(330, 1500, 64, 6)
  ring.rotateX(-Math.PI / 2)
  ring.translate(0, -0.8, 0)
  const rp = ring.attributes.position!
  const rc: number[] = []
  for (let i = 0; i < rp.count; i++) {
    tmp.copy(green).lerp(dark, segmentRandom(i, 3, 9103) * 0.5)
    if (segmentRandom(i, 4, 9104) > 0.9) tmp.lerp(soil, 0.5)
    rc.push(tmp.r, tmp.g, tmp.b)
  }
  ring.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3))
  ring.deleteAttribute('uv')
  parts.push(ring.toNonIndexed())
  parts.forEach((p) => p.deleteAttribute('uv'))
  return mergeGeometries(parts)!
}

// The hills sit beyond the city fog: they skip scene fog and get their own haze instead (see KampalaHills).
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false })
const houseMat = new THREE.MeshStandardMaterial({ roughness: 0.8, fog: false })
const M: Record<string, THREE.MeshStandardMaterial> = {
  white: new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.7 }),
  cream: new THREE.MeshStandardMaterial({ color: '#e6d3ae', roughness: 0.8 }),
  brick: new THREE.MeshStandardMaterial({ color: '#a4532f', roughness: 0.8 }),
  green: new THREE.MeshStandardMaterial({ color: '#3f7f4f', roughness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.4, metalness: 0.6 }),
  roof: new THREE.MeshStandardMaterial({ color: '#7a2e1d', roughness: 0.8 }),
  mast: new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.6 }),
}

/** Landmark silhouettes at real-ish heights (they read at 500+ m through the haze). */
function Landmark({ kind }: { kind: NonNullable<HillDef['landmark']> }) {
  switch (kind) {
    case 'mosque':
      return (
        <group>
          <mesh position={[0, 6, 0]} material={M.white} castShadow>
            <boxGeometry args={[30, 12, 24]} />
          </mesh>
          <mesh position={[0, 15, 0]} material={M.white}>
            <sphereGeometry args={[9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[18, 24, 10]} material={M.white}>
            <cylinderGeometry args={[1.6, 2.2, 48, 12]} />
          </mesh>
          <mesh position={[18, 50, 10]} material={M.gold}>
            <coneGeometry args={[2.2, 5, 12]} />
          </mesh>
        </group>
      )
    case 'twinTowers':
      return (
        <group>
          <mesh position={[0, 8, -6]} material={M.brick} castShadow>
            <boxGeometry args={[16, 16, 34]} />
          </mesh>
          {[-5.5, 5.5].map((x) => (
            <group key={x} position={[x, 0, 12]}>
              <mesh position={[0, 14, 0]} material={M.brick}>
                <boxGeometry args={[5, 28, 5]} />
              </mesh>
              <mesh position={[0, 30, 0]} material={M.cream}>
                <coneGeometry args={[3.4, 5, 4]} />
              </mesh>
            </group>
          ))}
        </group>
      )
    case 'cathedral':
      return (
        <group>
          <mesh position={[0, 7, 0]} material={M.brick} castShadow>
            <boxGeometry args={[14, 14, 36]} />
          </mesh>
          <mesh position={[0, 16, 0]} rotation={[0, Math.PI / 4, 0]} material={M.roof}>
            <coneGeometry args={[11, 6, 4]} />
          </mesh>
          <mesh position={[0, 18, 4]} material={M.brick}>
            <cylinderGeometry args={[6, 6, 8, 16]} />
          </mesh>
          <mesh position={[0, 25, 4]} material={M.green}>
            <sphereGeometry args={[6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
      )
    case 'dome':
      return (
        <group>
          <mesh position={[0, 6, 0]} material={M.white} castShadow>
            <cylinderGeometry args={[12, 13, 12, 9]} />
          </mesh>
          <mesh position={[0, 12, 0]} material={M.green}>
            <sphereGeometry args={[11, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, 24, 0]} material={M.gold}>
            <coneGeometry args={[1.2, 4, 8]} />
          </mesh>
        </group>
      )
    case 'palace':
      return (
        <group>
          <mesh position={[0, 6, 0]} material={M.cream} castShadow>
            <boxGeometry args={[40, 12, 18]} />
          </mesh>
          <mesh position={[0, 13.5, 0]} rotation={[0, 0, 0]} material={M.roof}>
            <boxGeometry args={[42, 3, 20]} />
          </mesh>
        </group>
      )
    case 'masts':
      return (
        <group>
          {[-12, 4, 16].map((x, k) => (
            <mesh key={x} position={[x, 18 + k * 4, k * 6]} material={M.mast}>
              <cylinderGeometry args={[0.6, 1.2, 36 + k * 8, 6]} />
            </mesh>
          ))}
        </group>
      )
  }
}

/** Shared (not created per render: a new geometry would rebuild the mesh and drop the instance matrices). */
const houseGeo = new THREE.BoxGeometry(1, 1, 1)

const HOUSE_COLOURS = ['#e7dcc5', '#d9a679', '#f0ece2', '#c9a27c', '#b8c4a6', '#e8c9a0'].map((c) => new THREE.Color(c))

function Houses() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const perHill = useSettingsStore((st) => (st.quality === 'low' ? 60 : st.quality === 'medium' ? 100 : 140))
  const houses = useMemo(() => {
    const out: { x: number; y: number; z: number; s: number; r: number; c: THREE.Color }[] = []
    HILLS.forEach((h, hi) => {
      const c = hillCentre(h)
      for (let k = 0; k < perHill; k++) {
        const a = segmentRandom(hi, k, 9201) * Math.PI * 2
        const rr = Math.sqrt(segmentRandom(hi, k, 9202)) * HILL_RADIUS * 0.92
        const dx = Math.cos(a) * rr
        const dz = Math.sin(a) * rr
        if (h.landmark && rr < 40) continue // leave the summit to the landmark
        out.push({
          x: c.x + dx,
          y: hillHeight(h, dx, dz) - 0.6,
          z: c.z + dz,
          s: 4 + segmentRandom(hi, k, 9203) * 6,
          r: segmentRandom(hi, k, 9204) * Math.PI,
          c: HOUSE_COLOURS[k % HOUSE_COLOURS.length]!,
        })
      }
    })
    return out
  }, [perHill])
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    houses.forEach((h, i) => {
      o.position.set(h.x, h.y + h.s * 0.3, h.z)
      o.rotation.set(0, h.r, 0)
      o.scale.set(h.s, h.s * 0.6, h.s * 0.8)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, h.c)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [houses])
  return <instancedMesh ref={ref} args={[houseGeo, houseMat, houses.length]} frustumCulled={false} />
}

/** Haze per weather: how strongly distant colours fade into the sky, and to what colour. */
const HAZE = {
  clear: { color: '#a9bccb', amount: 0.55 },
  rain: { color: '#7a848f', amount: 0.85 },
  dusk: { color: '#4a4255', amount: 0.7 },
} as const

export function KampalaHills({ weather = 'clear' }: { weather?: keyof typeof HAZE }) {
  const terrain = useMemo(() => buildTerrain(), [])
  const haze = HAZE[weather]
  // Bake the haze into emissive + darkened albedo: cheap aerial perspective without scene fog.
  useLayoutEffect(() => {
    const hc = new THREE.Color(haze.color)
    for (const m of [terrainMat, houseMat, ...Object.values(M)]) {
      m.fog = false
      m.emissive.copy(hc)
      m.emissiveIntensity = haze.amount
      m.color.multiplyScalar(1) // keep base colour; emissive lifts it toward the haze
      m.needsUpdate = true
    }
  }, [haze])
  return (
    <group>
      <mesh geometry={terrain} material={terrainMat} receiveShadow />
      <Houses />
      {HILLS.filter((h) => h.landmark).map((h) => {
        const c = hillCentre(h)
        return (
          <group key={h.name} position={[c.x, h.height - 1.5, c.z]} rotation={[0, (h.azimuth * Math.PI) / 180 + Math.PI, 0]}>
            <Landmark kind={h.landmark!} />
          </group>
        )
      })}
    </group>
  )
}
