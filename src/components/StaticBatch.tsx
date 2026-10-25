import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Merges every static mesh under it into a few big meshes: one per (look-alike material × shadow flags ×
 * map chunk). The city was ~34,000 separate meshes (one draw call each, plus another per shadow caster);
 * after batching it is a few hundred, with per-chunk frustum culling kept.
 *
 * Skipped: instanced / skinned meshes, multi-material meshes, and anything under an object with
 * `userData.dynamic` (animated parts). Physics colliders are separate objects, so they are unaffected.
 */

/** Batch cell size (m): ~4×4 cells over the ~650 m city; smaller cells multiply draw calls (≈20 materials each). */
const CHUNK = 180

function colorKey(c: THREE.Color | undefined) {
  return c ? c.getHexString() : '-'
}

/** Materials that look the same share one key (the city creates many identical inline materials). */
function materialKey(m: THREE.Material): string {
  const base = [m.type, m.transparent ? 1 : 0, m.opacity.toFixed(3), m.side, m.alphaTest, m.depthWrite ? 1 : 0, m.polygonOffset ? m.polygonOffsetFactor : 'n', m.toneMapped ? 1 : 0]
  if (m instanceof THREE.MeshStandardMaterial) {
    base.push(
      colorKey(m.color),
      colorKey(m.emissive),
      m.emissiveIntensity.toFixed(3),
      m.roughness.toFixed(3),
      m.metalness.toFixed(3),
      m.map?.uuid ?? '-',
      m.normalMap?.uuid ?? '-',
      m.roughnessMap?.uuid ?? '-',
      m.flatShading ? 1 : 0,
      m.vertexColors ? 1 : 0,
      m.envMapIntensity.toFixed(2),
    )
    if (m instanceof THREE.MeshPhysicalMaterial) base.push(m.uuid)
    return base.join('|')
  }
  if (m instanceof THREE.MeshBasicMaterial) {
    base.push(colorKey(m.color), m.map?.uuid ?? '-', m.vertexColors ? 1 : 0)
    return base.join('|')
  }
  if (m instanceof THREE.MeshLambertMaterial) {
    base.push(colorKey(m.color), colorKey(m.emissive), m.map?.uuid ?? '-')
    return base.join('|')
  }
  return m.uuid
}

type ColoredMaterial = THREE.Material & { color?: THREE.Color }

const q = (v: number, step: number) => (Math.round(v / step) * step).toFixed(2)

/**
 * Colour-collapse key: base colour moves into vertex colours, roughness / metalness are quantised, so
 * hundreds of slightly different flat-coloured materials become a handful of batches.
 */
function collapseKey(m: THREE.Material): string | null {
  if (m instanceof THREE.MeshPhysicalMaterial || m.vertexColors) return null
  const base = [m.type, m.transparent ? 1 : 0, m.opacity.toFixed(2), m.side, m.alphaTest, m.depthWrite ? 1 : 0, m.polygonOffset ? m.polygonOffsetFactor : 'n', m.toneMapped ? 1 : 0]
  if (m instanceof THREE.MeshStandardMaterial) {
    const emissiveOn = m.emissiveIntensity > 0 && m.emissive.getHex() !== 0
    base.push(q(m.roughness, 0.5), q(m.metalness, 1), m.map?.uuid ?? '-', m.normalMap?.uuid ?? '-', m.flatShading ? 1 : 0, emissiveOn ? `${m.emissive.getHexString()}@${m.emissiveIntensity.toFixed(2)}` : '-')
    return base.join('|')
  }
  if (m instanceof THREE.MeshBasicMaterial || m instanceof THREE.MeshLambertMaterial) {
    base.push(m.map?.uuid ?? '-')
    return base.join('|')
  }
  return null
}

function collapsedMaterial(m: THREE.Material): THREE.Material {
  const c = m.clone() as THREE.MeshStandardMaterial
  c.vertexColors = true
  c.color?.set('#ffffff')
  if (c instanceof THREE.MeshStandardMaterial) {
    c.roughness = Number(q(c.roughness, 0.5))
    c.metalness = Number(q(c.metalness, 1))
  }
  return c
}

function withColor(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position!.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r
    arr[i * 3 + 1] = color.g
    arr[i * 3 + 2] = color.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

function normalise(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, keepColor = false): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone()
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(keepColor && name === 'color')) g.deleteAttribute(name)
  }
  if (keepColor && !g.attributes.color) withColor(g, new THREE.Color(1, 1, 1))
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2))
  }
  g.morphAttributes = {}
  g.clearGroups()
  g = g.applyMatrix4(matrix)
  return g
}

function isDynamic(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) {
    if (p.userData?.dynamic) return true
  }
  return false
}

export function StaticBatch({
  children,
  collapseColors = true,
  chunked = true,
  onBuilt,
  cullDistance,
}: {
  children: ReactNode
  /** Move base colours into vertex colours so look-alike materials share a batch (default on). */
  collapseColors?: boolean
  /** Split into map cells for frustum culling (off for small objects like a single vehicle). */
  chunked?: boolean
  /** Called once merging is done (the city uses it to end the loading screen). */
  onBuilt?: () => void
  /** Hide batch cells whose nearest point is farther than this from the camera (inside the fog). */
  cullDistance?: number
}) {
  const ref = useRef<THREE.Group>(null)
  const mergedRef = useRef<THREE.Mesh[]>([])
  const frame = useRef(0)

  useFrame(({ camera }) => {
    if (!cullDistance || mergedRef.current.length === 0) return
    // A few cells per frame is plenty: the camera moves slowly relative to 100 m cells.
    if (++frame.current % 6 !== 0) return
    const cp = camera.position
    for (const m of mergedRef.current) {
      const bs = m.geometry.boundingSphere
      if (!bs) continue
      m.visible = bs.center.distanceTo(cp) - bs.radius < cullDistance
    }
  })

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    root.updateMatrixWorld(true)
    const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
    type Bucket = { material: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; collapsed: boolean }
    const buckets = new Map<string, Bucket>()
    const hidden: THREE.Mesh[] = []
    const rel = new THREE.Matrix4()
    const centre = new THREE.Vector3()

    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return
      if (!mesh.visible || Array.isArray(mesh.material) || isDynamic(mesh, root)) return
      const geo = mesh.geometry
      if (!geo?.attributes.position) return
      rel.multiplyMatrices(inverseRoot, mesh.matrixWorld)
      if (!geo.boundingSphere) geo.computeBoundingSphere()
      centre.copy(geo.boundingSphere!.center).applyMatrix4(rel)
      const cx = chunked ? Math.floor(centre.x / CHUNK) : 0
      const cz = chunked ? Math.floor(centre.z / CHUNK) : 0
      const mat = mesh.material as ColoredMaterial
      const ck = collapseColors && mat.color ? collapseKey(mat) : null
      // Shadow flags don't split batches (a batch casts if any part casts); that halves the batch count.
      const key = `${ck ? `C:${ck}` : materialKey(mat)}#${cx},${cz}#${mesh.renderOrder}`
      let b = buckets.get(key)
      if (!b) buckets.set(key, (b = { material: mat, cast: false, receive: true, geos: [], collapsed: !!ck }))
      b.cast ||= mesh.castShadow
      const g = normalise(geo, rel, mat.vertexColors)
      b.geos.push(ck ? withColor(g, mat.color!) : g)
      hidden.push(mesh)
    })

    const merged: THREE.Mesh[] = []
    for (const b of buckets.values()) {
      const g = b.geos.length === 1 ? b.geos[0]! : mergeGeometries(b.geos, false)
      if (!g) continue
      g.computeBoundingSphere()
      g.computeBoundingBox()
      const m = new THREE.Mesh(g, b.collapsed ? collapsedMaterial(b.material) : b.material)
      m.castShadow = b.cast
      m.receiveShadow = b.receive
      m.matrixAutoUpdate = false
      m.updateMatrix()
      merged.push(m)
      for (const sg of b.geos) if (sg !== g) sg.dispose()
    }
    onBuilt?.()
    // Only swap if merging worked; otherwise the originals keep rendering.
    if (merged.length === 0) return
    const holder = new THREE.Group()
    holder.name = 'static-batch'
    for (const m of merged) holder.add(m)
    root.add(holder)
    for (const mesh of hidden) {
      mesh.visible = false
      mesh.matrixAutoUpdate = false
      mesh.matrixWorldAutoUpdate = false
    }
    mergedRef.current = merged
    if (import.meta.env.DEV && hidden.length > 500) console.info(`[StaticBatch] ${hidden.length} meshes → ${merged.length} batches`)
    return () => {
      root.remove(holder)
      mergedRef.current = []
      for (const m of merged) {
        m.geometry.dispose()
        if (m.material !== undefined && (m.material as THREE.Material).vertexColors) (m.material as THREE.Material).dispose()
      }
      for (const mesh of hidden) {
        mesh.visible = true
        mesh.matrixAutoUpdate = true
        mesh.matrixWorldAutoUpdate = true
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseColors, chunked])

  return <group ref={ref}>{children}</group>
}
