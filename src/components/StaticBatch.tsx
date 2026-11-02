import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { collapsedMaterial, collapseKey, materialKey, normalise, withColor, type ColoredMaterial } from './batchGeometry'

/**
 * Merges every static mesh under it into a few big meshes: one per (look-alike material × shadow flags ×
 * map chunk). The city was ~34,000 separate meshes (one draw call each, plus another per shadow caster);
 * after batching it is a few hundred, with per-chunk frustum culling kept.
 *
 * Skipped: instanced / skinned meshes, multi-material meshes, and anything under an object with
 * `userData.dynamic` (animated parts). Physics colliders are separate objects, so they are unaffected.
 */

/** Batch cell size (m): ~3×3 cells over the ~650 m city; smaller cells multiply draw calls (≈40 materials each). */
const CHUNK = 260

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
    const buildStart = performance.now()
    root.updateMatrixWorld(true)
    const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
    type Bucket = { material: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; collapsed: boolean; meshes: THREE.Mesh[] }
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
      if (!b) buckets.set(key, (b = { material: mat, cast: false, receive: true, geos: [], collapsed: !!ck, meshes: [] }))
      b.cast ||= mesh.castShadow
      const g = normalise(geo, rel, mat.vertexColors)
      b.geos.push(ck ? withColor(g, mat.color!) : g)
      b.meshes.push(mesh)
    })

    const merged: THREE.Mesh[] = []
    for (const b of buckets.values()) {
      const g = b.geos.length === 1 ? b.geos[0]! : mergeGeometries(b.geos, false)
      // A failed merge keeps its original meshes showing, so a part of the city never silently vanishes.
      if (!g) {
        console.warn('[StaticBatch] merge failed; keeping', b.meshes.length, 'meshes')
        continue
      }
      hidden.push(...b.meshes)
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
    if (import.meta.env.DEV && hidden.length > 500) console.info(`[StaticBatch] merged in ${Math.round(performance.now() - buildStart)} ms`)
    // Only swap if merging worked; otherwise the originals keep rendering.
    if (merged.length === 0) return
    const holder = new THREE.Group()
    holder.name = 'static-batch'
    for (const m of merged) holder.add(m)
    root.add(holder)
    // Take the originals out of the scene altogether. Hidden meshes would still be walked every frame by the matrix
    // update and the renderer (tens of thousands of objects: several milliseconds a frame on a fast laptop).
    const removed: { object: THREE.Object3D; parent: THREE.Object3D }[] = []
    const gone = new Set<THREE.Object3D>(hidden)
    const parents = new Set<THREE.Object3D>()
    for (const mesh of hidden) {
      if (mesh.parent) {
        removed.push({ object: mesh, parent: mesh.parent })
        parents.add(mesh.parent)
      }
    }
    // One pass per parent: `remove()` per mesh is quadratic on the groups that hold thousands of children.
    for (const p of parents) p.children = p.children.filter((c) => !gone.has(c))
    for (const r of removed) r.object.parent = null
    // Then the groups left empty. Physics objects are `Object3D`s, not `Group`s, so those stay.
    for (let k = 0; k < removed.length; k++) {
      const parent = removed[k]!.parent
      if (parent !== root && parent.type === 'Group' && parent.children.length === 0 && parent.parent) {
        removed.push({ object: parent, parent: parent.parent })
        parent.parent.remove(parent)
      }
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
      for (let k = removed.length - 1; k >= 0; k--) removed[k]!.parent.add(removed[k]!.object)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseColors, chunked])

  return <group ref={ref}>{children}</group>
}
