import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import * as THREE from 'three'
import { FLOOR_H, type ShopLot } from './kampalaLots'
import { corrugatedTexture, makeAtlas, plasterTexture, shopSignAtlas } from './textures'

/**
 * Street-facing Kampala shop rows: real storey heights (3.1 m), shopfronts with painted signboards,
 * awnings and dark doorways at street level, windows above, parapets or rusty mabaati roofs and black
 * rooftop water tanks. All static, so `StaticBatch` merges them into a few draw calls.
 */

/* ---------- Shared geometry & materials ---------- */

const box = new THREE.BoxGeometry(1, 1, 1)
const plane = new THREE.PlaneGeometry(1, 1)
const tankGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.3, 16)
const tankLidGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12)

const mats = {
  door: new THREE.MeshStandardMaterial({ color: '#15130f', roughness: 0.9 }),
  shutter: new THREE.MeshStandardMaterial({ color: '#7c8288', roughness: 0.45, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: '#2a3b4a', roughness: 0.12, metalness: 0.6, envMapIntensity: 1.3 }),
  frame: new THREE.MeshStandardMaterial({ color: '#e8e4da', roughness: 0.6 }),
  tank: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.55 }),
  slab: new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.9 }),
  step: new THREE.MeshStandardMaterial({ color: '#8f8a82', roughness: 0.95 }),
}
const AWNINGS = ['#b91c1c', '#1d4ed8', '#15803d', '#ca8a04', '#7c3aed', '#0f766e'].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }),
)

const wallMatCache = new Map<string, THREE.MeshStandardMaterial>()
function wallMat(color: string) {
  let m = wallMatCache.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, map: plasterTexture(), roughness: 0.85 })
    wallMatCache.set(color, m)
  }
  return m
}
const roofMat = (() => {
  const t = corrugatedTexture().clone()
  t.repeat.set(3, 3)
  t.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: t, color: '#b5a99a', roughness: 0.65, metalness: 0.45 })
})()
const signAtlas = shopSignAtlas()
const signMat = new THREE.MeshStandardMaterial({ map: signAtlas.texture, roughness: 0.7 })

function B({ p, s, m, r }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; r?: [number, number, number] }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} castShadow receiveShadow />
}

const yearAtlas = makeAtlas(
  'years',
  Array.from({ length: 40 }, (_, k) => String(1919 + k)),
  (g, label, _i, w, h) => {
    g.fillStyle = '#e9dfc7'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#8a7a5c'
    g.lineWidth = 6
    g.strokeRect(6, 6, w - 12, h - 12)
    g.fillStyle = '#5b4a32'
    g.font = 'bold 58px Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(label, w / 2, h / 2 + 3)
  },
  256,
  96,
)
const yearMat = new THREE.MeshStandardMaterial({ map: yearAtlas.texture, roughness: 0.8 })
const trimMat = new THREE.MeshStandardMaterial({ color: '#f7f2e6', roughness: 0.75 })
const shutterGreen = new THREE.MeshStandardMaterial({ color: '#3f6b4f', roughness: 0.7 })

/**
 * Kampala Road colonial-era building (1920s–50s Indian bazaar style): a columned arcade at street level
 * with shops behind, a first floor over the arcade with tall shuttered windows and a balustrade, a cornice,
 * and a parapet with the year on a plaque.
 */
function ColonialBuilding({ lot }: { lot: ShopLot }) {
  const { w, d } = lot
  const h = 2 * FLOOR_H + 0.4
  const wall = wallMat(lot.wall)
  const front = d / 2
  const arcade = 2.2
  const bays = Math.max(2, Math.round(w / 2.4))
  const bayW = w / bays
  return (
    <RigidBody type="fixed" colliders={false} position={[lot.x, 0, lot.z]} rotation={[0, lot.yaw, 0]} userData={{ kind: 'building' }}>
      {/* Ground floor set back behind the arcade; first floor spans the full depth over it */}
      <B p={[0, FLOOR_H / 2, -arcade / 2]} s={[w, FLOOR_H, d - arcade]} m={wall} />
      <B p={[0, FLOOR_H + (h - FLOOR_H) / 2, 0]} s={[w, h - FLOOR_H, d]} m={wall} />
      <B p={[0, 0.09, front - arcade / 2]} s={[w, 0.18, arcade]} m={mats.slab} />
      {/* Columns along the arcade */}
      {Array.from({ length: bays + 1 }, (_, k) => (
        <B key={k} p={[-w / 2 + k * bayW, FLOOR_H / 2, front - 0.25]} s={[0.36, FLOOR_H, 0.36]} m={trimMat} />
      ))}
      <B p={[0, FLOOR_H - 0.18, front - 0.2]} s={[w, 0.36, 0.42]} m={trimMat} />
      {/* Shopfronts behind the arcade */}
      {Array.from({ length: bays }, (_, k) => {
        const x = -w / 2 + (k + 0.5) * bayW
        return (
          <group key={k}>
            <B p={[x, 1.25, front - arcade + 0.02]} s={[bayW - 0.7, 2.3, 0.04]} m={mats.door} />
            {k % 3 === 1 ? <B p={[x, 1.9, front - arcade + 0.05]} s={[bayW - 0.7, 1.0, 0.03]} m={mats.shutter} /> : null}
          </group>
        )
      })}
      <mesh geometry={signAtlas.geometry(lot.sign, w - 1, 0.55)} material={signMat} position={[0, FLOOR_H - 0.7, front - arcade + 0.06]} />
      {/* First floor: tall shuttered windows, balustrade, cornice */}
      {Array.from({ length: bays }, (_, k) => {
        const x = -w / 2 + (k + 0.5) * bayW
        return (
          <group key={k}>
            <B p={[x, FLOOR_H + 1.55, front + 0.02]} s={[1.15, 2.0, 0.06]} m={trimMat} />
            <B p={[x, FLOOR_H + 1.55, front + 0.05]} s={[0.95, 1.8, 0.04]} m={mats.glass} />
            <B p={[x - 0.62, FLOOR_H + 1.55, front + 0.06]} s={[0.12, 1.8, 0.03]} m={shutterGreen} />
            <B p={[x + 0.62, FLOOR_H + 1.55, front + 0.06]} s={[0.12, 1.8, 0.03]} m={shutterGreen} />
          </group>
        )
      })}
      <B p={[0, FLOOR_H + 0.5, front + 0.12]} s={[w, 0.12, 0.3]} m={trimMat} />
      <B p={[0, FLOOR_H + 0.28, front + 0.22]} s={[w, 0.45, 0.06]} m={trimMat} />
      <B p={[0, h - 0.1, front + 0.1]} s={[w + 0.2, 0.22, 0.32]} m={trimMat} />
      {/* Parapet with year plaque */}
      <B p={[0, h + 0.45, front - 0.05]} s={[w, 0.9, 0.18]} m={wall} />
      <mesh geometry={yearAtlas.geometry((lot.year ?? 1930) - 1919, 1.3, 0.48)} material={yearMat} position={[0, h + 0.5, front + 0.05]} />
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
    </RigidBody>
  )
}

export function ShopBuilding({ lot }: { lot: ShopLot }) {
  if (lot.style === 'colonial') return <ColonialBuilding lot={lot} />
  return <ShopFront lot={lot} />
}

function ShopFront({ lot }: { lot: ShopLot }) {
  const { w, d, floors } = lot
  const h = floors * FLOOR_H
  const wall = wallMat(lot.wall)
  const awning = AWNINGS[lot.sign % AWNINGS.length]!
  const doors = Math.max(1, Math.round(w / 3.2))
  const front = d / 2

  const upperWindows = useMemo(() => {
    const out: { x: number; y: number }[] = []
    const cols = Math.max(1, Math.floor(w / 2.4))
    for (let f = 1; f < floors; f++) {
      for (let c = 0; c < cols; c++) out.push({ x: ((c + 0.5) / cols - 0.5) * (w - 0.6), y: f * FLOOR_H + 1.55 })
    }
    return out
  }, [w, floors])

  return (
    <RigidBody type="fixed" colliders={false} position={[lot.x, 0, lot.z]} rotation={[0, lot.yaw, 0]} userData={{ kind: 'building' }}>
      {/* Walls */}
      <B p={[0, h / 2, 0]} s={[w, h, d]} m={wall} />
      {/* Verandah slab and step along the shopfront */}
      <B p={[0, 0.09, front + 0.9]} s={[w, 0.18, 1.8]} m={mats.slab} />
      {/* Shop doors: dark openings, some with roller shutters half down */}
      {Array.from({ length: doors }, (_, k) => {
        const x = ((k + 0.5) / doors - 0.5) * (w - 0.8)
        const shutter = (lot.sign + k) % 4 === 0
        return (
          <group key={k}>
            <B p={[x, 1.3, front + 0.01]} s={[Math.min(2.2, w / doors - 0.5), 2.4, 0.04]} m={mats.door} />
            {shutter ? <B p={[x, 2.0, front + 0.04]} s={[Math.min(2.2, w / doors - 0.5), 1.0, 0.03]} m={mats.shutter} /> : null}
          </group>
        )
      })}
      {/* Signboard above the doors */}
      <mesh geometry={signAtlas.geometry(lot.sign, w - 0.4, 0.75)} material={signMat} position={[0, 2.95, front + 0.06]} />
      {/* Awning sloping over the verandah */}
      <mesh geometry={plane} material={awning} position={[0, 2.55, front + 0.75]} rotation={[-Math.PI / 2 + 0.32, 0, 0]} scale={[w - 0.2, 1.6, 1]} castShadow />
      {/* Upper-floor windows with frames */}
      {upperWindows.map((win, k) => (
        <group key={k}>
          <B p={[win.x, win.y, front + 0.02]} s={[1.35, 1.5, 0.05]} m={mats.frame} />
          <B p={[win.x, win.y, front + 0.05]} s={[1.15, 1.3, 0.03]} m={mats.glass} />
        </group>
      ))}
      {/* Side windows so corners don't read as blank boxes */}
      {floors > 1 ? (
        <>
          <B p={[w / 2 + 0.02, FLOOR_H + 1.55, 0]} s={[0.05, 1.3, 1.15]} m={mats.glass} />
          <B p={[-w / 2 - 0.02, FLOOR_H + 1.55, 0]} s={[0.05, 1.3, 1.15]} m={mats.glass} />
        </>
      ) : null}
      {/* Roof */}
      {lot.roof === 'parapet' ? (
        <>
          <B p={[0, h + 0.35, front - 0.08]} s={[w, 0.7, 0.16]} m={wall} />
          <B p={[0, h + 0.35, -front + 0.08]} s={[w, 0.7, 0.16]} m={wall} />
          <B p={[w / 2 - 0.08, h + 0.35, 0]} s={[0.16, 0.7, d]} m={wall} />
          <B p={[-w / 2 + 0.08, h + 0.35, 0]} s={[0.16, 0.7, d]} m={wall} />
        </>
      ) : (
        <>
          <B p={[0, h + 0.45, d / 4]} s={[w + 0.4, 0.06, d / 2 + 0.5]} r={[-0.3, 0, 0]} m={roofMat} />
          <B p={[0, h + 0.45, -d / 4]} s={[w + 0.4, 0.06, d / 2 + 0.5]} r={[0.3, 0, 0]} m={roofMat} />
          <B p={[0, h + 0.35, front - 0.05]} s={[w, 0.7, 0.1]} m={wall} />
        </>
      )}
      {lot.tank ? (
        <group position={[w / 2 - 1, h + (lot.roof === 'parapet' ? 0.65 : 0.95), -d / 4]}>
          <mesh geometry={tankGeo} material={mats.tank} castShadow />
          <mesh geometry={tankLidGeo} material={mats.tank} position={[0, 0.7, 0]} />
        </group>
      ) : null}
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
    </RigidBody>
  )
}
