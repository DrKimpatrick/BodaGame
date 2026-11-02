import * as THREE from 'three'
import { CITY_TOTAL, ewHalf, NUM_BLOCKS, nsHalf, roadStripCenterX, roadStripCenterZ } from './cityGrid'
import { SIDEWALK_WIDTH } from './roadSpatial'
import { ROUNDABOUTS } from './kampalaMap'

/**
 * Where grass may grow: a top-down map of the city. White is open ground; roads, pavements, buildings and paved
 * plots are black. City code registers what it builds with `excludeGrass`, and the mask is drawn once it's finished.
 */

export const GRASS_MASK_SPAN = CITY_TOTAL + 120
const PX = 1024

type Rect = { x: number; z: number; w: number; d: number }
const rects: Rect[] = []

/** Keep grass off a rectangle (centre x, z; full width and depth). */
export function excludeGrass(x: number, z: number, w: number, d: number): void {
  rects.push({ x, z, w, d })
}

export function buildGrassMask(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = PX
  const g = c.getContext('2d')!
  const k = PX / GRASS_MASK_SPAN
  const half = GRASS_MASK_SPAN / 2
  g.fillStyle = '#000'
  g.fillRect(0, 0, PX, PX)
  // Open ground inside the city only.
  g.fillStyle = '#fff'
  g.fillRect((half - CITY_TOTAL / 2) * k, (half - CITY_TOTAL / 2) * k, CITY_TOTAL * k, CITY_TOTAL * k)
  g.fillStyle = '#000'
  const rect = (x: number, z: number, w: number, d: number) => g.fillRect((x - w / 2 + half) * k, (z - d / 2 + half) * k, w * k, d * k)
  // Road, pavement and the drain beyond it, plus a little trampled margin.
  const verge = SIDEWALK_WIDTH + 1.2
  for (let s = 0; s <= NUM_BLOCKS; s++) {
    rect(roadStripCenterX(s), 0, (nsHalf(s) + verge) * 2, CITY_TOTAL)
    rect(0, roadStripCenterZ(s), CITY_TOTAL, (ewHalf(s) + verge) * 2)
  }
  for (const r of ROUNDABOUTS) {
    const cx = roadStripCenterX(r.i)
    const cz = roadStripCenterZ(r.j)
    g.beginPath()
    g.arc((cx + half) * k, (cz + half) * k, 15 * k, 0, Math.PI * 2)
    g.fill()
  }
  for (const r of rects) rect(r.x, r.z, r.w, r.d)
  const t = new THREE.CanvasTexture(c)
  t.flipY = false
  t.generateMipmaps = false
  t.minFilter = THREE.NearestFilter
  t.magFilter = THREE.NearestFilter
  return t
}
