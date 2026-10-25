import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import * as THREE from 'three'
import { ROAD_TOP_Y } from '../../game/roadSurfaceFeatures'
import { ROUNDABOUTS, type RoundaboutDef } from '../../game/kampalaMap'
import { junctionAt, ROUNDABOUT } from '../../roadRules/world/junctions'
import { asphaltTexture, grassTexture } from './textures'

/**
 * Kampala roundabouts: a paved circle over the junction, a kerbed grass island (solid: you have to ride
 * round it) and a centrepiece: the Clock Tower (raised for the Queen's 1954 visit), fountains, gardens and
 * a crested crane, Uganda's national bird. Traffic goes round clockwise (Uganda keeps left).
 */

const discMat = (() => {
  const t = asphaltTexture().clone()
  t.repeat.set(3, 3)
  t.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: t, color: '#c4c4c4', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 })
})()
const islandGrass = (() => {
  const t = grassTexture().clone()
  t.repeat.set(1.5, 1.5)
  t.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })
})()
const kerbMat = (() => {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 16
  const g = c.getContext('2d')!
  for (let k = 0; k < 16; k++) {
    g.fillStyle = k % 2 ? '#111' : '#f4f4f0'
    g.fillRect(k * 16, 0, 16, 16)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(3, 1)
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })
})()
const M = {
  white: new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.7 }),
  stone: new THREE.MeshStandardMaterial({ color: '#b9ae9c', roughness: 0.85 }),
  roof: new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: '#c0a062', roughness: 0.35, metalness: 0.8 }),
  water: new THREE.MeshStandardMaterial({ color: '#4aa3c7', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }),
  spray: new THREE.MeshStandardMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.55, roughness: 0.2 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#2f6b2a', roughness: 0.9 }),
  red: new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.8 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.8 }),
  craneGrey: new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.6 }),
  craneGold: new THREE.MeshStandardMaterial({ color: '#d4a017', roughness: 0.5, metalness: 0.4 }),
  black: new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.6 }),
}

function clockFaceMaterial() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#f8f5ec'
  g.beginPath()
  g.arc(64, 64, 60, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#1f2937'
  g.lineWidth = 5
  g.stroke()
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    g.fillStyle = '#1f2937'
    g.fillRect(64 + Math.sin(a) * 48 - 2, 64 - Math.cos(a) * 48 - 2, 4, 8)
  }
  g.lineWidth = 6
  g.beginPath()
  g.moveTo(64, 64)
  g.lineTo(64, 26)
  g.moveTo(64, 64)
  g.lineTo(94, 64)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, transparent: true })
}
const clockFace = clockFaceMaterial()

function ClockTower() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} material={M.stone} castShadow>
        <boxGeometry args={[1.9, 1, 1.9]} />
      </mesh>
      <mesh position={[0, 4.2, 0]} material={M.white} castShadow>
        <boxGeometry args={[1.2, 6.4, 1.2]} />
      </mesh>
      <mesh position={[0, 8.0, 0]} material={M.white} castShadow>
        <boxGeometry args={[1.55, 1.6, 1.55]} />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} rotation={[0, (k * Math.PI) / 2, 0]} position={[Math.sin((k * Math.PI) / 2) * 0.79, 8.0, Math.cos((k * Math.PI) / 2) * 0.79]} material={clockFace}>
          <circleGeometry args={[0.62, 24]} />
        </mesh>
      ))}
      <mesh position={[0, 9.4, 0]} rotation={[0, Math.PI / 4, 0]} material={M.metal} castShadow>
        <coneGeometry args={[1.15, 1.6, 4]} />
      </mesh>
      <mesh position={[0, 10.5, 0]} material={M.metal}>
        <cylinderGeometry args={[0.03, 0.03, 0.8, 6]} />
      </mesh>
    </group>
  )
}

function Fountain() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} material={M.stone} castShadow>
        <cylinderGeometry args={[2.1, 2.2, 0.5, 28]} />
      </mesh>
      <mesh position={[0, 0.58, 0]} material={M.water}>
        <cylinderGeometry args={[1.9, 1.9, 0.06, 28]} />
      </mesh>
      <mesh position={[0, 1.2, 0]} material={M.stone}>
        <cylinderGeometry args={[0.25, 0.35, 1.3, 12]} />
      </mesh>
      <mesh position={[0, 2.4, 0]} material={M.spray}>
        <coneGeometry args={[0.7, 1.6, 16, 1, true]} />
      </mesh>
    </group>
  )
}

function Garden({ seed }: { seed: number }) {
  const flowers = useMemo(
    () =>
      Array.from({ length: 18 }, (_, k) => {
        const a = (k / 18) * Math.PI * 2
        return { x: Math.cos(a) * 2.2, z: Math.sin(a) * 2.2, red: (k + seed) % 3 === 0 }
      }),
    [seed],
  )
  return (
    <group>
      {flowers.map((f, k) => (
        <mesh key={k} position={[f.x, 0.42, f.z]} material={f.red ? M.red : k % 2 ? M.yellow : M.leaf}>
          <sphereGeometry args={[0.32, 8, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 0]} material={M.leaf} castShadow>
        <sphereGeometry args={[1.1, 10, 8]} />
      </mesh>
      <mesh position={[0, 0.6, 0]} material={M.black}>
        <cylinderGeometry args={[0.15, 0.2, 1.0, 8]} />
      </mesh>
    </group>
  )
}

/** Grey crowned crane on a plinth (Uganda's national bird, on the flag). */
function CraneStatue() {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} material={M.stone} castShadow>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
      </mesh>
      <group position={[0, 1.5, 0]} scale={1.4}>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0.45, 0]} material={M.black}>
            <cylinderGeometry args={[0.025, 0.025, 0.9, 6]} />
          </mesh>
        ))}
        <mesh position={[0, 1.05, 0]} scale={[0.8, 0.7, 1.3]} material={M.craneGrey} castShadow>
          <sphereGeometry args={[0.35, 14, 10]} />
        </mesh>
        <mesh position={[0, 1.5, 0.32]} rotation={[0.4, 0, 0]} material={M.craneGrey}>
          <cylinderGeometry args={[0.05, 0.07, 0.75, 8]} />
        </mesh>
        <mesh position={[0, 1.85, 0.45]} material={M.black}>
          <sphereGeometry args={[0.1, 10, 8]} />
        </mesh>
        <mesh position={[0, 2.0, 0.42]} material={M.craneGold}>
          <sphereGeometry args={[0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 1.83, 0.6]} rotation={[Math.PI / 2, 0, 0]} material={M.black}>
          <coneGeometry args={[0.03, 0.18, 6]} />
        </mesh>
      </group>
    </group>
  )
}

function Monument({ def }: { def: RoundaboutDef }) {
  switch (def.monument) {
    case 'clocktower':
      return <ClockTower />
    case 'fountain':
      return <Fountain />
    case 'crane':
      return <CraneStatue />
    default:
      return <Garden seed={def.i * 7 + def.j} />
  }
}

export function Roundabouts() {
  return (
    <group>
      {ROUNDABOUTS.map((def) => {
        const jn = junctionAt(def.i, def.j)
        if (!jn) return null
        return (
          <group key={def.name} position={[jn.x, 0, jn.z]}>
            {/* Paved circle over the junction */}
            <mesh position={[0, ROAD_TOP_Y + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={discMat} receiveShadow>
              <circleGeometry args={[ROUNDABOUT.disc, 48]} />
            </mesh>
            {/* Kerbed island */}
            <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
              <mesh position={[0, 0.2, 0]} material={kerbMat} castShadow>
                <cylinderGeometry args={[ROUNDABOUT.island, ROUNDABOUT.island, 0.3, 40, 1, true]} />
              </mesh>
              <mesh position={[0, 0.34, 0]} rotation={[-Math.PI / 2, 0, 0]} material={islandGrass} receiveShadow>
                <circleGeometry args={[ROUNDABOUT.island, 40]} />
              </mesh>
              <group position={[0, 0.34, 0]}>
                <Monument def={def} />
              </group>
              <CylinderCollider args={[1.5, ROUNDABOUT.island]} position={[0, 1.5, 0]} />
            </RigidBody>
          </group>
        )
      })}
    </group>
  )
}
