import * as THREE from 'three'

/** Soft dark patch under a vehicle, for the setting with no real shadows, so nothing looks like it floats. */
export const contactShadowMaterial = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 6, 32, 32, 32)
  r.addColorStop(0, 'rgba(0,0,0,0.62)')
  r.addColorStop(0.6, 'rgba(0,0,0,0.42)')
  r.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  return new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  })
})()
