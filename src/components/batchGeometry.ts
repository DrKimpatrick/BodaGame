import * as THREE from 'three'

/** Geometry and material helpers shared by the two batchers: `StaticBatch` and `TrafficInstances`. */

function colorKey(c: THREE.Color | undefined) {
  return c ? c.getHexString() : '-'
}

/** Materials that look the same share one key (the city creates many identical inline materials). */
export function materialKey(m: THREE.Material): string {
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

export type ColoredMaterial = THREE.Material & { color?: THREE.Color }

const q = (v: number, step: number) => (Math.round(v / step) * step).toFixed(2)

/**
 * Colour-collapse key: base colour moves into vertex colours, roughness / metalness are quantised, so
 * hundreds of slightly different flat-coloured materials become a handful of batches.
 */
export function collapseKey(m: THREE.Material): string | null {
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

export function collapsedMaterial(m: THREE.Material): THREE.Material {
  const c = m.clone() as THREE.MeshStandardMaterial
  c.vertexColors = true
  c.color?.set('#ffffff')
  if (c instanceof THREE.MeshStandardMaterial) {
    c.roughness = Number(q(c.roughness, 0.5))
    c.metalness = Number(q(c.metalness, 1))
  }
  return c
}

export function withColor(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
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

export function normalise(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, keepColor = false): THREE.BufferGeometry {
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
