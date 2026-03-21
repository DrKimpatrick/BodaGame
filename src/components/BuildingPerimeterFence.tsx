import { useMemo } from 'react'
import * as THREE from 'three'

function createWireGridTexture() {
  const w = 256
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (!g) return new THREE.Texture()
  g.clearRect(0, 0, w, h)
  g.strokeStyle = 'rgba(75, 82, 94, 0.96)'
  g.lineWidth = 2.2
  const step = 22
  for (let x = 0; x <= w; x += step) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, h)
    g.stroke()
  }
  for (let y = 0; y <= h; y += step) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(w, y)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

const PANEL_T = 0.045

export type BuildingFenceVariant = 'mesh' | 'solid'

/**
 * Rectangular fence around a building footprint (axis-aligned in local XZ).
 * Parent should set `position` + `rotation` at the building centroid.
 * `halfWidth` / `halfDepth` are building half-extents; `margin` is gap from building face to fence.
 */
export function BuildingPerimeterFence({
  halfWidth,
  halfDepth,
  margin = 1.15,
  height = 2,
  variant,
}: {
  halfWidth: number
  halfDepth: number
  margin?: number
  height?: number
  variant: BuildingFenceVariant
}) {
  const fx = halfWidth + margin
  const fz = halfDepth + margin
  const y = height / 2

  const mat = useMemo(() => {
    if (variant === 'mesh') {
      const map = createWireGridTexture()
      map.repeat.set(
        Math.max(1.2, (2 * fx) / 2.8),
        Math.max(0.9, height / 2.2),
      )
      map.needsUpdate = true
      return new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        alphaTest: 0.08,
        side: THREE.DoubleSide,
        metalness: 0.42,
        roughness: 0.48,
        depthWrite: true,
      })
    }
    return new THREE.MeshStandardMaterial({
      color: '#7d7872',
      roughness: 0.88,
      metalness: 0.05,
    })
  }, [variant, fx, fz, height])

  const postMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#5c636e',
        roughness: 0.55,
        metalness: 0.35,
      }),
    [],
  )

  const postR = 0.08
  const corners: [number, number][] = [
    [fx, fz],
    [-fx, fz],
    [fx, -fz],
    [-fx, -fz],
  ]

  return (
    <group>
      <mesh position={[0, y, fz]} castShadow receiveShadow material={mat}>
        <boxGeometry args={[2 * fx, height, PANEL_T]} />
      </mesh>
      <mesh position={[0, y, -fz]} castShadow receiveShadow material={mat}>
        <boxGeometry args={[2 * fx, height, PANEL_T]} />
      </mesh>
      <mesh position={[fx, y, 0]} castShadow receiveShadow material={mat}>
        <boxGeometry args={[PANEL_T, height, 2 * fz]} />
      </mesh>
      <mesh position={[-fx, y, 0]} castShadow receiveShadow material={mat}>
        <boxGeometry args={[PANEL_T, height, 2 * fz]} />
      </mesh>

      {variant === 'mesh' &&
        corners.map(([px, pz], i) => (
          <mesh key={i} position={[px, y, pz]} castShadow material={postMat}>
            <cylinderGeometry args={[postR, postR, height, 8]} />
          </mesh>
        ))}
    </group>
  )
}
