import * as THREE from 'three'
import { svgDataUrl } from '../../roadRules/signs'

const cache = new Map<string, THREE.CanvasTexture>()

/**
 * Rasterise an SVG once into a cached CanvasTexture (mipmapped, anisotropic). The texture is usable
 * immediately (transparent) and fills in when the image decodes.
 */
export function svgTexture(
  svg: string,
  width = 256,
  height = width,
  /** Fill the shape's silhouette with this colour (sign backs). */
  silhouette?: string,
): THREE.CanvasTexture {
  const key = `${width}x${height}:${silhouette ?? ''}:${svg}`
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    const g = canvas.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, width, height)
    g.drawImage(img, 0, 0, width, height)
    if (silhouette) {
      g.globalCompositeOperation = 'source-in'
      g.fillStyle = silhouette
      g.fillRect(0, 0, width, height)
      g.globalCompositeOperation = 'source-over'
    }
    tex.needsUpdate = true
  }
  img.src = svgDataUrl(svg)
  cache.set(key, tex)
  return tex
}
