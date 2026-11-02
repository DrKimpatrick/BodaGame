import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildGrassMask, GRASS_MASK_SPAN } from '../../game/grassMask'
import { bikeTelemetry, sceneStatus } from '../../roadRules/world/telemetry'
import { useSettingsStore } from '../../store/useSettingsStore'

/**
 * Real blades of grass around the camera, one draw call. The tufts have fixed positions in a square that wraps
 * around the camera in the vertex shader, so they stay put in the world as you ride and nothing is updated from
 * JavaScript. A mask of the city (roads, buildings, paving) keeps them on the actual grass. They fade out with
 * distance, where the ground texture takes over.
 */

const SETTINGS = {
  low: { tufts: 2200, radius: 20 },
  medium: { tufts: 6000, radius: 30 },
  high: { tufts: 11000, radius: 42 },
} as const

/** A tuft: narrow tapered blades in a loose clump, darker at the root and sun-lit at the tip. */
function tuftGeometry() {
  const blades = 7
  const pos: number[] = []
  const col: number[] = []
  const root = new THREE.Color('#2e4a1c')
  const tips = ['#7c9a3e', '#8fa84a', '#6f9239', '#a5a958'].map((c) => new THREE.Color(c))
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 1.3
    const r = 0.05 + ((b * 37) % 11) * 0.012
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const h = 0.22 + ((b * 53) % 7) * 0.035
    const w = 0.035
    const sideA = a + 1.4
    const lean = 0.05 + ((b * 19) % 5) * 0.02
    const tip = tips[b % tips.length]!
    pos.push(x + Math.cos(sideA) * w, 0, z + Math.sin(sideA) * w)
    pos.push(x - Math.cos(sideA) * w, 0, z - Math.sin(sideA) * w)
    pos.push(x + Math.cos(a) * lean, h, z + Math.sin(a) * lean)
    col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  // Lit as if pointing up, so the meadow shades as one surface rather than as flickering triangles.
  const normals = new Float32Array(pos.length)
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return g
}

export function GrassField() {
  const quality = useSettingsStore((s) => s.quality)
  const { tufts, radius } = SETTINGS[quality]
  const ref = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => tuftGeometry(), [])
  const uniforms = useRef({
    uCam: { value: new THREE.Vector2() },
    uR: { value: radius },
    uHalf: { value: GRASS_MASK_SPAN / 2 },
    uMask: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
  })
  const material = useMemo(() => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    const u = uniforms.current
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec2 uCam;
          uniform float uR;
          uniform float uHalf;
          uniform float uTime;
          uniform sampler2D uMask;`,
        )
        .replace(
          '#include <project_vertex>',
          `vec4 ip = instanceMatrix * vec4(transformed, 1.0);
          vec2 base = instanceMatrix[3].xz;
          vec2 wrapped = mod(base - uCam + uR, 2.0 * uR) - uR + uCam;
          ip.xz += wrapped - base;
          float mask = texture2D(uMask, (wrapped + uHalf) / (2.0 * uHalf)).r;
          float fade = smoothstep(1.0, 0.72, length(wrapped - uCam) / uR);
          float size = step(0.5, mask) * fade;
          ip.y *= size;
          ip.xz = mix(wrapped, ip.xz, size);
          // Breeze: slow waves crossing the field, only moving the tips.
          float gust = sin(wrapped.x * 0.35 + uTime * 1.1) * cos(wrapped.y * 0.28 + uTime * 0.8);
          ip.xz += vec2(0.06, 0.035) * gust * transformed.y * 4.0;
          // Patches of greener and drier grass, on the scale of metres.
          float patchy = sin(wrapped.x * 0.21 + 1.7) * sin(wrapped.y * 0.17) + sin(wrapped.x * 0.67) * sin(wrapped.y * 0.53 + 0.8) * 0.5;
          vColor.rgb *= 0.86 + 0.2 * patchy;
          vColor.r += 0.05 * max(0.0, patchy) * step(0.1, transformed.y);
          vec4 mvPosition = viewMatrix * ip;
          gl_Position = projectionMatrix * mvPosition;`,
        )
    }
    m.customProgramCacheKey = () => 'grass-field'
    return m
  }, [])
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const o = new THREE.Object3D()
    // Low-discrepancy scatter: fills the square evenly with no visible grid or clumps.
    for (let i = 0; i < tufts; i++) {
      const a = ((i * 0.7548776662) % 1) * 2 - 1
      const b = ((i * 0.5698402910) % 1) * 2 - 1
      o.position.set(a * radius, 0, b * radius)
      o.rotation.set(0, i * 2.399, 0)
      const s = 0.75 + ((i * 0.381966) % 1) * 0.8
      o.scale.set(s, s * (0.8 + ((i * 0.2071) % 1) * 0.7), s)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [tufts, radius])

  // The mask needs the finished city, which reports what it built as it batches.
  useEffect(() => {
    if (ready) return
    const id = setInterval(() => {
      if (!sceneStatus.cityBuilt) return
      uniforms.current.uMask.value = buildGrassMask()
      clearInterval(id)
      setReady(true)
    }, 200)
    return () => clearInterval(id)
  }, [ready])

  useFrame(({ camera }, delta) => {
    const u = uniforms.current
    u.uCam.value.set(camera.position.x, camera.position.z)
    u.uR.value = radius
    if (Math.abs(bikeTelemetry.speed) < 25) u.uTime.value += Math.min(delta, 0.1)
  })

  return <instancedMesh key={tufts} ref={ref} args={[geometry, material, tufts]} frustumCulled={false} visible={ready} />
}
