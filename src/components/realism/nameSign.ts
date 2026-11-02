import * as THREE from 'three'

const cache = new Map<string, THREE.MeshStandardMaterial>()

/** Painted name board (cached per text and colour, one material each). */
export function nameSign(text: string, bg = '#14532d', fg = '#f8fafc') {
  const key = text + bg
  let m = cache.get(key)
  if (!m) {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const g = c.getContext('2d')!
    g.fillStyle = bg
    g.fillRect(0, 0, 512, 96)
    g.fillStyle = fg
    g.font = 'bold 40px Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 256, 50)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })
    cache.set(key, m)
  }
  return m
}
