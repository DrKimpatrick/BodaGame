import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { trafficTelemetry } from '../roadRules/world/telemetry'
import { useSettingsStore } from '../store/useSettingsStore'
import { collapsedMaterial, collapseKey, materialKey, normalise, withColor, type ColoredMaterial } from './batchGeometry'
import { VehicleModel } from './realism/Vehicles'
import { vehiclePaint, type VehicleKind } from './realism/vehicleSpecs'

/**
 * All moving traffic as instanced meshes: one set of draw calls per vehicle type rather than per vehicle (it was
 * about 500 draw calls, doubled again by the shadow pass). Each type's model is rendered once, with a white body,
 * baked into merged geometry, then every vehicle of that type is an instance tinted to its own paint. Only vehicles
 * near the camera are written each frame.
 */

/** Road surface height: wheels sit on the tarmac. */
const ROAD_Y = 0.06
/** How far traffic is drawn (m), and how far behind the camera (its shadow can still fall into view). */
const DRAW_RADIUS = { low: 150, medium: 200, high: 260 } as const
const DRAW_BEHIND = 25

type KindSet = {
  meshes: THREE.InstancedMesh[]
  matrices: THREE.InstancedBufferAttribute
  colours: THREE.InstancedBufferAttribute
  count: number
}

function bake(proto: THREE.Object3D, capacity: number): KindSet {
  proto.updateWorldMatrix(true, true)
  const inverse = new THREE.Matrix4().copy(proto.matrixWorld).invert()
  const rel = new THREE.Matrix4()
  type Bucket = { material: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[]; collapsed: boolean }
  const buckets = new Map<string, Bucket>()
  proto.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.geometry?.attributes.position) return
    rel.multiplyMatrices(inverse, mesh.matrixWorld)
    const mat = mesh.material as ColoredMaterial
    const ck = mat.color ? collapseKey(mat) : null
    const key = ck ? `C:${ck}` : materialKey(mat)
    let b = buckets.get(key)
    if (!b) buckets.set(key, (b = { material: mat, cast: false, geos: [], collapsed: !!ck }))
    b.cast ||= mesh.castShadow
    const g = normalise(mesh.geometry, rel, mat.vertexColors)
    b.geos.push(ck ? withColor(g, mat.color!) : g)
  })
  const matrices = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 16), 16)
  const colours = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  matrices.setUsage(THREE.DynamicDrawUsage)
  colours.setUsage(THREE.DynamicDrawUsage)
  const meshes: THREE.InstancedMesh[] = []
  for (const b of buckets.values()) {
    const g = b.geos.length === 1 ? b.geos[0]! : mergeGeometries(b.geos, false)
    if (!g) continue
    const material = b.collapsed ? collapsedMaterial(b.material) : b.material
    const m = new THREE.InstancedMesh(g, material, capacity)
    m.instanceMatrix = matrices
    // Paint tints matt-and-satin surfaces only; chrome, lights and glass keep their colour.
    const std = material as THREE.MeshStandardMaterial
    if (!std.transparent && !std.map && (std.metalness ?? 0) < 0.5 && (std.emissiveIntensity ?? 0) === 0) m.instanceColor = colours
    m.frustumCulled = false
    m.castShadow = b.cast
    m.count = 0
    meshes.push(m)
  }
  return { meshes, matrices, colours, count: 0 }
}

export function TrafficInstances({ kinds }: { kinds: readonly VehicleKind[] }) {
  const distinct = useMemo(() => [...new Set(kinds)], [kinds])
  const protoRefs = useRef(new Map<VehicleKind, THREE.Group>())
  const [sets, setSets] = useState<Map<VehicleKind, KindSet> | null>(null)
  const quality = useSettingsStore((s) => s.quality)

  /** Per slot: paint, resolved once. */
  const paint = useMemo(() => {
    const out = new Float32Array(kinds.length * 3)
    const c = new THREE.Color()
    kinds.forEach((kind, i) => {
      c.set(vehiclePaint(kind, i))
      out.set([c.r, c.g, c.b], i * 3)
    })
    return out
  }, [kinds])

  useLayoutEffect(() => {
    if (sets) return
    const made = new Map<VehicleKind, KindSet>()
    for (const kind of distinct) {
      const proto = protoRefs.current.get(kind)
      if (proto) made.set(kind, bake(proto, kinds.filter((k) => k === kind).length))
    }
    // Baking is a one-off that must read the mounted prototypes; swapping them out straight after is the point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSets(made)
  }, [sets, distinct, kinds])

  const forward = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    if (!sets) return
    const radius = DRAW_RADIUS[quality]
    const r2 = radius * radius
    camera.getWorldDirection(forward)
    const cx = camera.position.x
    const cz = camera.position.z
    for (const set of sets.values()) set.count = 0
    const n = Math.min(kinds.length, trafficTelemetry.count)
    for (let i = 0; i < n; i++) {
      const x = trafficTelemetry.x[i]!
      const z = trafficTelemetry.z[i]!
      const dx = x - cx
      const dz = z - cz
      if (dx * dx + dz * dz > r2) continue
      if (dx * forward.x + dz * forward.z < -DRAW_BEHIND) continue
      const set = sets.get(kinds[i]!)
      if (!set) continue
      const yaw = trafficTelemetry.yaw[i]!
      const s = Math.sin(yaw)
      const c = Math.cos(yaw)
      const o = set.count * 16
      const e = set.matrices.array as Float32Array
      // Rotation about Y plus translation, written directly: no per-frame allocation.
      e[o] = c
      e[o + 1] = 0
      e[o + 2] = -s
      e[o + 3] = 0
      e[o + 4] = 0
      e[o + 5] = 1
      e[o + 6] = 0
      e[o + 7] = 0
      e[o + 8] = s
      e[o + 9] = 0
      e[o + 10] = c
      e[o + 11] = 0
      e[o + 12] = x
      e[o + 13] = ROAD_Y
      e[o + 14] = z
      e[o + 15] = 1
      const col = set.colours.array as Float32Array
      const p = set.count * 3
      col[p] = paint[i * 3]!
      col[p + 1] = paint[i * 3 + 1]!
      col[p + 2] = paint[i * 3 + 2]!
      set.count++
    }
    for (const set of sets.values()) {
      set.matrices.needsUpdate = true
      set.colours.needsUpdate = true
      for (const m of set.meshes) m.count = set.count
    }
  })

  if (!sets) {
    return (
      <group visible={false}>
        {distinct.map((kind) => (
          <group
            key={kind}
            ref={(el) => {
              if (el) protoRefs.current.set(kind, el)
            }}
          >
            <VehicleModel kind={kind} seed={0} color="#ffffff" />
          </group>
        ))}
      </group>
    )
  }
  return (
    <group>
      {[...sets.values()].flatMap((set) => set.meshes.map((m) => <primitive key={m.uuid} object={m} />))}
    </group>
  )
}
