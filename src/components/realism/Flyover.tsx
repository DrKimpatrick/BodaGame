import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { blockCenter, roadStripCenterZ } from '../../game/cityGrid'
import { FLYOVER_BLOCKS } from '../../game/kampalaMap'
import { BodaModel } from '../BodaModel'
import { StandingHuman } from './Nature'

/**
 * Clock Tower flyover (Kampala Flyover Project, opened 2025): an elevated road crossing Queensway right beside
 * the roundabout. Scenery, not a route: riders pass underneath, its ramps are barred at the foot, and the rules
 * and traffic AI stay on the ground grid. Cars on the deck are a single instanced mesh.
 */

const X = blockCenter(FLYOVER_BLOCKS[0]!.i, FLYOVER_BLOCKS[0]!.j)[0]
const Z = roadStripCenterZ(2)
/** Deck half width, deck top height, depth of the box girder. */
const W = 5
const H = 6.4
const GIRDER = 0.9
/** Flat over this distance each side of Queensway; ramps reach the ground at RUN (the side street's pavement). */
const FLAT = 11
const RUN = 46
/** Beyond this the ramp is a solid fill between retaining walls; before it the deck stands on piers. */
const FILL_FROM = 31
const PARAPET = 0.95

function deckTop(s: number) {
  const a = Math.abs(s)
  if (a <= FLAT) return H
  if (a >= RUN) return 0
  const t = (a - FLAT) / (RUN - FLAT)
  return H * (1 - t * t * (3 - 2 * t))
}

const STATIONS = Array.from({ length: 41 }, (_, k) => -RUN + (k * 2 * RUN) / 40)

/** Sweeps a two-point section along the deck into a strip of quads. */
function strip(section: (s: number) => [number, number, number, number]) {
  const pos: number[] = []
  const idx: number[] = []
  STATIONS.forEach((s, k) => {
    const [x0, y0, x1, y1] = section(s)
    pos.push(x0, y0, s, x1, y1, s)
    if (k > 0) {
      const a = (k - 1) * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function underside(s: number) {
  return Math.abs(s) >= FILL_FROM ? 0 : Math.max(0, deckTop(s) - GIRDER)
}

function buildDeck() {
  const concrete: THREE.BufferGeometry[] = []
  for (const side of [-1, 1]) {
    const e = side * W
    const inner = side * (W - 0.25)
    // Outer face (retaining wall on the fill) up to the parapet top.
    concrete.push(strip((s) => [e, underside(s), e, deckTop(s) + PARAPET]))
    concrete.push(strip((s) => [inner, deckTop(s), inner, deckTop(s) + PARAPET]))
    concrete.push(strip((s) => [e, deckTop(s) + PARAPET, inner, deckTop(s) + PARAPET]))
  }
  concrete.push(strip((s) => [-W, underside(s), W, underside(s)]))
  const road = strip((s) => [-W + 0.25, deckTop(s), W - 0.25, deckTop(s)])
  const lines = [
    strip((s) => [-0.18, deckTop(s) + 0.02, -0.06, deckTop(s) + 0.02]),
    strip((s) => [0.06, deckTop(s) + 0.02, 0.18, deckTop(s) + 0.02]),
    strip((s) => [-W + 0.5, deckTop(s) + 0.02, -W + 0.62, deckTop(s) + 0.02]),
    strip((s) => [W - 0.62, deckTop(s) + 0.02, W - 0.5, deckTop(s) + 0.02]),
  ]
  return { concrete: mergeGeometries(concrete)!, road, lines: mergeGeometries(lines)! }
}

const M = {
  concrete: new THREE.MeshStandardMaterial({ color: '#b5b1a8', roughness: 0.92, side: THREE.DoubleSide }),
  road: new THREE.MeshStandardMaterial({ color: '#3a3a3d', roughness: 0.95, side: THREE.DoubleSide }),
  line: new THREE.MeshStandardMaterial({ color: '#e8e4d6', roughness: 0.8, side: THREE.DoubleSide }),
  pier: new THREE.MeshStandardMaterial({ color: '#a8a49b', roughness: 0.95 }),
  lamp: new THREE.MeshStandardMaterial({ color: '#7d858f', roughness: 0.5, metalness: 0.6 }),
  barrierRed: new THREE.MeshStandardMaterial({ color: '#c81e1e', roughness: 0.7 }),
  barrierWhite: new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.7 }),
}

const noEntry = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(64, 64, 62, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#c81e1e'
  g.beginPath()
  g.arc(64, 64, 57, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffffff'
  g.fillRect(22, 52, 84, 24)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, transparent: true, alphaTest: 0.5 })
})()

const PIERS = [-22, -FLAT - 0.5, FLAT + 0.5, 22]

function Pier({ s }: { s: number }) {
  const top = deckTop(s) - GIRDER
  return (
    <group position={[0, 0, s]}>
      <mesh position={[0, top / 2 - 0.4, 0]} material={M.pier} castShadow>
        <cylinderGeometry args={[0.75, 0.85, top - 0.8, 12]} />
      </mesh>
      <mesh position={[0, top - 0.4, 0]} material={M.pier} castShadow>
        <boxGeometry args={[2 * W - 1.2, 0.8, 1.5]} />
      </mesh>
    </group>
  )
}

/** Red and white barriers across the ramp foot, with a no-entry sign each side. */
function RampFoot({ dir }: { dir: 1 | -1 }) {
  return (
    <group position={[0, 0, dir * (RUN - 0.6)]}>
      {Array.from({ length: 5 }, (_, k) => (
        <mesh key={k} position={[(k - 2) * 2, 0.5, 0]} material={k % 2 ? M.barrierWhite : M.barrierRed} castShadow>
          <boxGeometry args={[1.95, 1, 0.5]} />
        </mesh>
      ))}
      {[-W - 0.5, W + 0.5].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.3, 0]} material={M.lamp}>
            <cylinderGeometry args={[0.05, 0.05, 2.6, 6]} />
          </mesh>
          <mesh position={[0, 2.5, dir * 0.06]} rotation={[0, dir > 0 ? 0 : Math.PI, 0]} material={noEntry}>
            <circleGeometry args={[0.45, 20]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const CAR_COLOURS = ['#f4f4f2', '#20242c', '#b3b7bd', '#7f1d1d', '#f4f4f2', '#1e3a8a', '#d6d3d1', '#111827'].map((c) => new THREE.Color(c))
const carGeo = (() => {
  const body = new THREE.BoxGeometry(1.8, 0.7, 4.2)
  body.translate(0, 0.55, 0)
  const cab = new THREE.BoxGeometry(1.6, 0.62, 2.2)
  cab.translate(0, 1.2, -0.2)
  return mergeGeometries([body, cab])!
})()
const carMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 })
const CARS = CAR_COLOURS.length
const CAR_SPEED = 11
const dummy = new THREE.Object3D()

/** Traffic on the deck: eight cars looping, shrinking away behind the barriers at each ramp foot. */
function DeckTraffic() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const clock = useRef(0)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    CAR_COLOURS.forEach((c, k) => m.setColorAt(k, c))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])
  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    clock.current += Math.min(dt, 0.1)
    const span = 2 * (RUN - 2)
    for (let k = 0; k < CARS; k++) {
      const north = k % 2 === 0 ? 1 : -1
      const d = (clock.current * CAR_SPEED + (k * span * 5) / CARS) % span
      const s = north * (d - span / 2)
      const a = Math.abs(s)
      const scale = Math.min(1, Math.max(0.001, (span / 2 - a) / 3))
      // Keep left: heading +Z the traveller's left is +X.
      dummy.position.set(north * 2.35, deckTop(s), s)
      dummy.rotation.set(-(deckTop(s + 0.5) - deckTop(s - 0.5)), north > 0 ? 0 : Math.PI, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      m.setMatrixAt(k, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[carGeo, carMat, CARS]} frustumCulled={false} castShadow />
}

export function ClockTowerFlyover() {
  const deck = useMemo(() => buildDeck(), [])
  return (
    <group position={[X, 0, Z]}>
      <mesh geometry={deck.concrete} material={M.concrete} castShadow receiveShadow />
      <mesh geometry={deck.road} material={M.road} receiveShadow />
      <mesh geometry={deck.lines} material={M.line} />
      {PIERS.map((s) => (
        <Pier key={s} s={s} />
      ))}
      <RampFoot dir={1} />
      <RampFoot dir={-1} />
      {/* Lamps along the deck */}
      {[-24, -8, 8, 24].map((s) => (
        <group key={s} position={[0, deckTop(s), s]}>
          <mesh position={[W - 0.15, 2.6, 0]} material={M.lamp}>
            <cylinderGeometry args={[0.06, 0.09, 5.2, 6]} />
          </mesh>
          <mesh position={[W - 1.05, 5.15, 0]} material={M.lamp}>
            <boxGeometry args={[1.8, 0.08, 0.14]} />
          </mesh>
        </group>
      ))}
      {/* Bodas and their riders always find the shade under a flyover */}
      {[-16, 16].map((s) => (
        <group key={s} position={[0, 0, s]}>
          {[-2.4, 0, 2.4].map((x, k) => (
            <group key={x} position={[x, 0, 1.8 * (k % 2 ? 1 : -1)]} rotation={[0, 1.4, 0]}>
              <BodaModel spin={false} low />
            </group>
          ))}
          <StandingHuman x={3.6} z={1} rotationY={-1.5} seed={s + 1000} />
        </group>
      ))}
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
        {PIERS.map((s) => (
          <CylinderCollider key={s} args={[3, 0.85]} position={[0, 3, s]} />
        ))}
        {[1, -1].map((dir) => (
          <CuboidCollider key={dir} args={[W + 0.2, 1.5, (RUN - FILL_FROM) / 2]} position={[0, 1.5, (dir * (RUN + FILL_FROM)) / 2]} />
        ))}
      </RigidBody>
      <group userData={{ dynamic: true }}>
        <DeckTraffic />
      </group>
    </group>
  )
}
