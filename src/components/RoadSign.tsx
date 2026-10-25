import * as THREE from 'three'
import { ALL_STREETS } from '../game/streetNames'
import { streetNameAtlas } from './realism/textures'

type Props = {
  x: number
  z: number
  rotationY?: number
  streetName: string
  crossStreet?: string
}

/** One shared atlas + materials: every blade in the city batches into a couple of draw calls. */
const atlas = streetNameAtlas(ALL_STREETS)
const bladeMat = new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.5 })
const poleMat = new THREE.MeshStandardMaterial({ color: '#1f2933', roughness: 0.6, metalness: 0.5 })
const poleGeo = new THREE.CylinderGeometry(0.04, 0.05, 2.7, 8).translate(0, 1.35, 0)
const nameIndex = (n: string) => Math.max(0, ALL_STREETS.indexOf(n))

/** A blade is two back-to-back faces so the name reads correctly from both sides (not mirrored). */
function Blade({ name, y, yaw }: { name: string; y: number; yaw: number }) {
  const geo = atlas.geometry(nameIndex(name), 1.2, 0.22)
  return (
    <group position={[0, y, 0]} rotation={[0, yaw, 0]}>
      <mesh geometry={geo} material={bladeMat} position={[0, 0, 0.012]} />
      <mesh geometry={geo} material={bladeMat} position={[0, 0, -0.012]} rotation={[0, Math.PI, 0]} />
    </group>
  )
}

/**
 * Street-name signpost: two blades crossed at the top, one per street, readable from both sides
 * (junction control signs live in `RoadSignage`).
 */
export function RoadSign({ x, z, rotationY = 0, streetName, crossStreet }: Props) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      <mesh geometry={poleGeo} material={poleMat} castShadow />
      <Blade name={streetName} y={2.62} yaw={0} />
      {crossStreet ? <Blade name={crossStreet} y={2.38} yaw={Math.PI / 2} /> : null}
    </group>
  )
}
