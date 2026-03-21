import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const textureCache = new Map<string, THREE.Texture>()

function createLabelTexture(title: string, subtitle?: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = subtitle ? 168 : 118
  const g = c.getContext('2d')
  if (!g) return new THREE.Texture()
  g.fillStyle = '#0a0f18'
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = '#b8954a'
  g.lineWidth = 3
  g.strokeRect(2, 2, c.width - 4, c.height - 4)
  g.fillStyle = '#faf7f0'
  g.font = 'bold 44px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(title.toUpperCase(), c.width / 2, subtitle ? 50 : c.height / 2)
  if (subtitle) {
    g.font = '26px system-ui, sans-serif'
    g.fillStyle = '#b8aea0'
    g.fillText(subtitle, c.width / 2, 116)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function textureForLabel(title: string, subtitle?: string) {
  const key = `${title}\0${subtitle ?? ''}`
  let tex = textureCache.get(key)
  if (!tex) {
    tex = createLabelTexture(title, subtitle)
    textureCache.set(key, tex)
  }
  return tex
}

type Props = {
  position: [number, number, number]
  title: string
  subtitle?: string
  /** World-space panel width */
  width?: number
}

/** Rooftop / skyline sign that turns to face the camera. */
export function BuildingNameLabel({
  position,
  title,
  subtitle,
  width = 7.5,
}: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const map = useMemo(() => textureForLabel(title, subtitle), [title, subtitle])
  const aspect = (subtitle ? 168 : 118) / 512
  const h = width * aspect

  useFrame(() => {
    const m = meshRef.current
    if (!m) return
    m.lookAt(camera.position)
  })

  return (
    <mesh ref={meshRef} position={position} renderOrder={4}>
      <planeGeometry args={[width, h]} />
      <meshBasicMaterial
        map={map}
        transparent
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  )
}
