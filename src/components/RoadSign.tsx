import { useMemo } from 'react'
import * as THREE from 'three'

const stopTexture = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  if (!g) return new THREE.Texture()
  g.fillStyle = '#dc2626'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#ffffff'
  g.font = 'bold 28px system-ui,sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('STOP', 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
})()

type Props = {
  x: number
  z: number
  rotationY?: number
  streetName: string
  crossStreet?: string
}

/** NYC-inspired: black pole, green blade sign + optional STOP octagon. */
export function RoadSign({
  x,
  z,
  rotationY = 0,
  streetName,
  crossStreet,
}: Props) {
  const nameTex = useMemo(() => createStreetNameTexture(streetName, crossStreet), [streetName, crossStreet])

  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.15, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 2.35, 8]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.85} metalness={0.2} />
      </mesh>
      {/* Green / white street blade */}
      <mesh position={[0, 2.05, 0.06]} castShadow>
        <boxGeometry args={[1.35, 0.38, 0.06]} />
        <meshStandardMaterial color="#166534" roughness={0.55} />
      </mesh>
      <mesh position={[0, 2.05, 0.095]}>
        <planeGeometry args={[1.22, 0.3]} />
        <meshBasicMaterial map={nameTex} transparent toneMapped={false} />
      </mesh>
      {/* STOP octagon */}
      <group position={[0.85, 1.55, 0]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.05, 8]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.45} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0, 0.03]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.38, 0.38]} />
          <meshBasicMaterial map={stopTexture} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function createStreetNameTexture(main: string, cross?: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')
  if (!g) return new THREE.Texture()
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = '#14532d'
  g.font = 'bold 52px system-ui,sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(main.toUpperCase(), 256, cross ? 48 : 64)
  if (cross) {
    g.font = '28px system-ui,sans-serif'
    g.fillStyle = '#166534'
    g.fillText(`& ${cross.toUpperCase()}`, 256, 92)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}
