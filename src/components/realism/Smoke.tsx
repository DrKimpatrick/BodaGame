import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { useSettingsStore } from '../../store/useSettingsStore'
import { age, colour, growth, life, look, MAX, POOL, pos, setPoolSize, startAlpha, startSize, vel } from './smokePool'

/**
 * Every puff in the game (bike exhaust, dust, vehicle fumes): one draw call, one fixed pool of soft points in world
 * space, and no allocation per frame. Faint on purpose. Anything can add a puff with `emitSmoke` (`smokePool.ts`).
 */

const VERT = `
attribute vec2 aLook;
attribute vec3 aColour;
uniform float uScale;
varying float vAlpha;
varying vec3 vColour;
void main() {
  vAlpha = aLook.y;
  vColour = aColour;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Dead puffs have zero opacity and zero size, so they cost nothing to draw.
  gl_PointSize = aLook.y > 0.001 ? aLook.x * uScale / max(0.5, -mv.z) : 0.0;
}`

const FRAG = `
varying float vAlpha;
varying vec3 vColour;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float soft = smoothstep(1.0, 0.15, d);
  if (soft * vAlpha < 0.004) discard;
  gl_FragColor = vec4(vColour, soft * vAlpha);
}`

export function SmokeField() {
  const quality = useSettingsStore((s) => s.quality)
  const gl = useThree((s) => s.gl)
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aLook', new THREE.BufferAttribute(look, 2).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aColour', new THREE.BufferAttribute(colour, 3).setUsage(THREE.DynamicDrawUsage))
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 1 } },
      transparent: true,
      depthWrite: false,
    })
    return { geometry: g, material: m }
  }, [])

  useFrame(({ camera }, delta) => {
    setPoolSize(POOL[quality])
    const dt = Math.min(delta, 0.05)
    // Slows quickly: the smoke hangs in the air rather than flying along behind what made it.
    const drag = Math.exp(-3.2 * dt)
    for (let i = 0; i < MAX; i++) {
      if (age[i]! >= life[i]!) {
        look[i * 2 + 1] = 0
        continue
      }
      age[i]! += dt
      const j = i * 3
      vel[j]! *= drag
      vel[j + 2]! *= drag
      pos[j]! += vel[j]! * dt
      pos[j + 1]! += vel[j + 1]! * dt
      pos[j + 2]! += vel[j + 2]! * dt
      const u = Math.min(1, age[i]! / life[i]!)
      look[i * 2] = startSize[i]! + growth[i]! * u
      // Fades in over the first moment and thins away, so a puff never appears or vanishes abruptly.
      look[i * 2 + 1] = startAlpha[i]! * Math.min(1, u * 8) * (1 - u) * (1 - u)
    }
    geometry.attributes.position!.needsUpdate = true
    geometry.attributes.aLook!.needsUpdate = true
    geometry.attributes.aColour!.needsUpdate = true
    const cam = camera as THREE.PerspectiveCamera
    material.uniforms.uScale!.value = (gl.domElement.height * 0.5) / Math.tan((cam.fov * Math.PI) / 360)
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
}
