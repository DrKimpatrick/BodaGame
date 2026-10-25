import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import * as THREE from 'three'
import { blockCenter, BLOCK } from '../../game/cityGrid'
import { LANDMARK_BLOCKS } from '../../game/kampalaMap'
import { segmentRandom } from '../../game/roadDecorPlacements'
import { RealTree, StandingHuman } from './Nature'
import { grassTexture, plasterTexture } from './textures'
import { VehicleModel } from './Vehicles'

/**
 * Kampala landmarks inside the city: the Independence Monument park (Speke Road), the Old Taxi Park
 * (thousands of matatus in a small space) and Nakasero Market (fresh produce since 1895).
 * All static: StaticBatch merges them.
 */

const M = {
  paving: new THREE.MeshStandardMaterial({ color: '#c9c2b4', roughness: 0.9 }),
  concrete: new THREE.MeshStandardMaterial({ color: '#8f8a83', roughness: 0.95 }),
  bronze: new THREE.MeshStandardMaterial({ color: '#6b4b2a', roughness: 0.45, metalness: 0.7 }),
  plinth: new THREE.MeshStandardMaterial({ color: '#e5ded0', roughness: 0.8 }),
  hedge: new THREE.MeshStandardMaterial({ color: '#2f6b2a', roughness: 0.9 }),
  roofIron: new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.5, metalness: 0.6 }),
  timber: new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.9 }),
  stallTop: new THREE.MeshStandardMaterial({ color: '#c2b49a', roughness: 0.9 }),
  shelter: new THREE.MeshStandardMaterial({ color: '#d6d3cc', map: plasterTexture(), roughness: 0.9 }),
}
const PRODUCE = ['#f59e0b', '#16a34a', '#dc2626', '#facc15', '#65a30d', '#ea580c'].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }),
)
const UMBRELLAS = ['#dc2626', '#1d4ed8', '#facc15', '#16a34a', '#f97316'].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }),
)
const lawn = (() => {
  const t = grassTexture().clone()
  t.repeat.set(4, 4)
  t.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })
})()

const PLOT = BLOCK - 6

/** Independence Monument: a figure raising a child to the sky on a tall plinth, in a paved park. */
function IndependencePark() {
  const { i, j } = LANDMARK_BLOCKS.independence
  const [cx, cz] = blockCenter(i, j)
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lawn} receiveShadow>
        <planeGeometry args={[PLOT, PLOT]} />
      </mesh>
      {/* Paths crossing the park */}
      {[0, Math.PI / 2].map((r) => (
        <mesh key={r} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, r]} material={M.paving} receiveShadow>
          <planeGeometry args={[2.4, PLOT]} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.paving}>
        <circleGeometry args={[6, 32]} />
      </mesh>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
        <mesh position={[0, 0.6, 0]} material={M.plinth} castShadow>
          <cylinderGeometry args={[2.6, 2.9, 1.2, 8]} />
        </mesh>
        <mesh position={[0, 3.2, 0]} material={M.plinth} castShadow>
          <boxGeometry args={[1.6, 4.0, 1.6]} />
        </mesh>
        {/* Bronze figure: body, raised arms holding the child up */}
        <group position={[0, 5.2, 0]}>
          <mesh position={[0, 1.0, 0]} material={M.bronze} castShadow>
            <capsuleGeometry args={[0.35, 1.3, 4, 10]} />
          </mesh>
          <mesh position={[0, 2.25, 0]} material={M.bronze}>
            <sphereGeometry args={[0.28, 12, 10]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.32, 2.75, 0]} rotation={[0, 0, -s * 0.18]} material={M.bronze}>
              <capsuleGeometry args={[0.1, 1.1, 3, 8]} />
            </mesh>
          ))}
          <mesh position={[0, 3.55, 0]} material={M.bronze} castShadow>
            <capsuleGeometry args={[0.18, 0.5, 3, 8]} />
          </mesh>
          <mesh position={[0, 4.0, 0]} material={M.bronze}>
            <sphereGeometry args={[0.16, 10, 8]} />
          </mesh>
        </group>
        <CylinderCollider args={[1.4, 2.9]} position={[0, 1.4, 0]} />
      </RigidBody>
      {/* Hedges around the circle */}
      {Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8
        return (
          <mesh key={k} position={[Math.cos(a) * 7.5, 0.5, Math.sin(a) * 7.5]} rotation={[0, -a, 0]} material={M.hedge} castShadow>
            <boxGeometry args={[0.8, 1, 3.6]} />
          </mesh>
        )
      })}
      {Array.from({ length: 6 }, (_, k) => (
        <StandingHuman key={k} x={Math.cos(k) * 9} z={Math.sin(k * 1.7) * 9} rotationY={k} seed={k + 30} />
      ))}
    </group>
  )
}

/** Old Taxi Park: rows of white matatus packed nose to tail, a shelter and the crowd. */
function TaxiPark() {
  const { i, j } = LANDMARK_BLOCKS.taxiPark
  const [cx, cz] = blockCenter(i, j)
  const rows = 6
  const cols = 5
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.concrete} receiveShadow>
        <planeGeometry args={[PLOT, PLOT]} />
      </mesh>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          if (segmentRandom(r, c, 4401) < 0.12) return null
          const x = (c - (cols - 1) / 2) * 3.4
          const z = (r - (rows - 1) / 2) * 5.6
          return (
            <group key={`${r}-${c}`} position={[x, 0, z]} rotation={[0, (r % 2 ? Math.PI : 0) + (segmentRandom(r, c, 4402) - 0.5) * 0.12, 0]}>
              <VehicleModel kind="matatu" seed={r * cols + c} />
            </group>
          )
        }),
      )}
      {/* Passenger shelter along one side */}
      <mesh position={[PLOT / 2 - 1.6, 1.4, 0]} material={M.shelter} castShadow>
        <boxGeometry args={[0.3, 2.8, PLOT - 4]} />
      </mesh>
      <mesh position={[PLOT / 2 - 2.4, 2.9, 0]} rotation={[0, 0, 0.08]} material={M.roofIron} castShadow>
        <boxGeometry args={[2.2, 0.08, PLOT - 3]} />
      </mesh>
      {Array.from({ length: 14 }, (_, k) => (
        <StandingHuman key={k} x={PLOT / 2 - 2.6 + (k % 2) * 0.6} z={-PLOT / 2 + 3 + k * 1.1} rotationY={-Math.PI / 2} seed={k + 50} />
      ))}
      <CuboidColliderRow />
    </group>
  )
}

/** Simple collision for the packed matatus (one box per row) so the bike can't ride through. */
function CuboidColliderRow() {
  return (
    <RigidBody type="fixed" colliders={false} userData={{ kind: 'vehicle-parked' }}>
      {Array.from({ length: 6 }, (_, r) => (
        <CuboidCollider key={r} args={[8.8, 1, 2.4]} position={[0, 1, (r - 2.5) * 5.6]} />
      ))}
    </RigidBody>
  )
}

/** Nakasero Market: timber stalls under iron roofs, produce piles and umbrellas. */
function Market() {
  const { i, j } = LANDMARK_BLOCKS.market
  const [cx, cz] = blockCenter(i, j)
  const stalls = useMemo(() => {
    const out: { x: number; z: number; k: number }[] = []
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) out.push({ x: (c - 2.5) * 5.4, z: (r - 2) * 6.4, k: r * 6 + c })
    return out
  }, [])
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.concrete} receiveShadow>
        <planeGeometry args={[PLOT, PLOT]} />
      </mesh>
      {stalls.map(({ x, z, k }) => (
        <group key={k} position={[x, 0, z]}>
          <mesh position={[0, 0.85, 0]} material={M.stallTop} castShadow>
            <boxGeometry args={[3.6, 0.12, 1.6]} />
          </mesh>
          {[-1.7, 1.7].map((px) => (
            <mesh key={px} position={[px, 1.3, 0.7]} material={M.timber}>
              <boxGeometry args={[0.1, 2.6, 0.1]} />
            </mesh>
          ))}
          {k % 3 === 0 ? (
            <mesh position={[0, 2.3, 0]} material={UMBRELLAS[k % UMBRELLAS.length]} castShadow>
              <coneGeometry args={[1.9, 0.6, 10, 1, true]} />
            </mesh>
          ) : (
            <mesh position={[0, 2.6, 0]} rotation={[0.12, 0, 0]} material={M.roofIron} castShadow>
              <boxGeometry args={[4.0, 0.06, 2.4]} />
            </mesh>
          )}
          {/* Piles of produce */}
          {[-1.1, 0, 1.1].map((px, n) => (
            <mesh key={px} position={[px, 1.08, 0]} scale={[1, 0.6, 1]} material={PRODUCE[(k + n) % PRODUCE.length]}>
              <sphereGeometry args={[0.42, 8, 6]} />
            </mesh>
          ))}
          <StandingHuman x={0.4} z={-1.3} rotationY={0} seed={k + 80} />
          {k % 2 === 0 ? <StandingHuman x={-0.9} z={-2.1} rotationY={Math.PI} seed={k + 120} /> : null}
        </group>
      ))}
    </group>
  )
}

function ugandaFlagMaterial() {
  const c = document.createElement('canvas')
  c.width = 192
  c.height = 128
  const g = c.getContext('2d')!
  const stripes = ['#000000', '#fcdc04', '#d90000', '#000000', '#fcdc04', '#d90000']
  stripes.forEach((col, k) => {
    g.fillStyle = col
    g.fillRect(0, (k * 128) / 6, 192, 128 / 6 + 1)
  })
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(96, 64, 22, 0, Math.PI * 2)
  g.fill()
  // Grey crowned crane silhouette (simplified)
  g.fillStyle = '#6b6b6b'
  g.beginPath()
  g.ellipse(94, 70, 9, 6, 0, 0, Math.PI * 2)
  g.fill()
  g.fillRect(97, 52, 3, 16)
  g.fillStyle = '#d90000'
  g.fillRect(96, 50, 6, 3)
  g.fillStyle = '#fcdc04'
  g.fillRect(95, 47, 4, 3)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 })
}
const flagMat = ugandaFlagMaterial()
const benchMat = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.85 })
const poleMat = new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.3, metalness: 0.8 })

/** Constitutional Square: lawn, paths, benches, trees and the Uganda flag on a tall pole. */
function ConstitutionalSquare() {
  const { i, j } = LANDMARK_BLOCKS.square
  const [cx, cz] = blockCenter(i, j)
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lawn} receiveShadow>
        <planeGeometry args={[PLOT, PLOT]} />
      </mesh>
      {[Math.PI / 4, -Math.PI / 4].map((r) => (
        <mesh key={r} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, r]} material={M.paving} receiveShadow>
          <planeGeometry args={[2.2, PLOT * 1.35]} />
        </mesh>
      ))}
      <mesh position={[0, 7, 0]} material={poleMat} castShadow>
        <cylinderGeometry args={[0.07, 0.12, 14, 10]} />
      </mesh>
      <mesh position={[1.25, 12.8, 0]} material={flagMat} castShadow>
        <planeGeometry args={[2.4, 1.6]} />
      </mesh>
      {Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2
        return (
          <group key={k} position={[Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5]} rotation={[0, -a + Math.PI / 2, 0]}>
            <mesh position={[0, 0.45, 0]} material={benchMat} castShadow>
              <boxGeometry args={[1.6, 0.08, 0.45]} />
            </mesh>
            <mesh position={[0, 0.75, -0.2]} material={benchMat}>
              <boxGeometry args={[1.6, 0.5, 0.06]} />
            </mesh>
          </group>
        )
      })}
      {[[-12, -12], [12, -12], [-12, 12], [12, 12], [0, -14], [0, 14]].map(([x, z], k) => (
        <RealTree key={k} x={x!} z={z!} seed={k + 300} scale={1.1} />
      ))}
      {Array.from({ length: 7 }, (_, k) => (
        <StandingHuman key={k} x={Math.cos(k * 0.9) * 5.6} z={Math.sin(k * 0.9) * 5.6} rotationY={k * 0.9 + Math.PI} seed={k + 400} />
      ))}
    </group>
  )
}

const TARPS = ['#1d4ed8', '#f97316', '#16a34a', '#facc15', '#7c3aed'].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide }),
)
const CLOTHES = ['#dc2626', '#2563eb', '#f5f5f4', '#111827', '#ca8a04', '#db2777', '#059669'].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }),
)

/** Owino (St Balikuddembe): East Africa's busiest market — tight lanes of tarps, umbrellas and clothes heaps. */
function Owino() {
  const { i, j } = LANDMARK_BLOCKS.owino
  const [cx, cz] = blockCenter(i, j)
  const stalls = useMemo(() => {
    const out: { x: number; z: number; k: number }[] = []
    for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) out.push({ x: (c - 3.5) * 4.2, z: (r - 3) * 4.6, k: r * 8 + c })
    return out
  }, [])
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.concrete} receiveShadow>
        <planeGeometry args={[PLOT, PLOT]} />
      </mesh>
      {stalls.map(({ x, z, k }) => (
        <group key={k} position={[x + (segmentRandom(k, 1, 4501) - 0.5) * 0.6, 0, z]}>
          {/* Tarp roof on four poles */}
          <mesh position={[0, 2.3, 0]} rotation={[-Math.PI / 2 + 0.08 * (k % 2 ? 1 : -1), 0, 0]} material={TARPS[k % TARPS.length]} castShadow>
            <planeGeometry args={[3.6, 3.2]} />
          </mesh>
          {[-1.6, 1.6].flatMap((px) =>
            [-1.4, 1.4].map((pz) => (
              <mesh key={`${px}${pz}`} position={[px, 1.15, pz]} material={M.timber}>
                <boxGeometry args={[0.08, 2.3, 0.08]} />
              </mesh>
            )),
          )}
          {/* Heaps of second-hand clothes ("mivumba") on a table */}
          <mesh position={[0, 0.75, 0]} material={M.stallTop}>
            <boxGeometry args={[2.8, 0.1, 1.6]} />
          </mesh>
          {[-0.9, 0, 0.9].map((px, n) => (
            <mesh key={px} position={[px, 1.0, 0]} scale={[1, 0.5, 0.8]} material={CLOTHES[(k + n) % CLOTHES.length]}>
              <sphereGeometry args={[0.5, 7, 5]} />
            </mesh>
          ))}
          <StandingHuman x={0.6} z={-1.9} rotationY={0} seed={k + 500} />
          {k % 2 === 0 ? <StandingHuman x={-0.8} z={2.0} rotationY={Math.PI} seed={k + 560} /> : null}
          {k % 3 === 0 ? <StandingHuman x={1.9} z={0.2} rotationY={-Math.PI / 2} seed={k + 620} /> : null}
        </group>
      ))}
    </group>
  )
}

const ivory = new THREE.MeshStandardMaterial({ color: '#f4efe2', roughness: 0.7 })
const gateStone = new THREE.MeshStandardMaterial({ color: '#c8bfae', roughness: 0.85 })
const nameSignCache = new Map<string, THREE.MeshStandardMaterial>()
function nameSign(text: string, bg = '#14532d', fg = '#f8fafc') {
  const key = text + bg
  let m = nameSignCache.get(key)
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
    nameSignCache.set(key, m)
  }
  return m
}

/** Makerere University: the gate on the road and the white Main Building with its clock tower behind. */
function Makerere() {
  const { i, j } = LANDMARK_BLOCKS.makerere
  const [cx, cz] = blockCenter(i, j)
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lawn} receiveShadow>
        <planeGeometry args={[PLOT, PLOT]} />
      </mesh>
      {/* Gate facing the southern road */}
      <group position={[0, 0, -PLOT / 2 + 1.5]} rotation={[0, Math.PI, 0]}>
        {[-3.4, 3.4].map((x) => (
          <mesh key={x} position={[x, 2.2, 0]} material={gateStone} castShadow>
            <boxGeometry args={[1.2, 4.4, 1.2]} />
          </mesh>
        ))}
        <mesh position={[0, 4.6, 0]} material={gateStone} castShadow>
          <boxGeometry args={[8.2, 0.9, 1.0]} />
        </mesh>
        <mesh position={[0, 4.6, 0.52]} material={nameSign('MAKERERE UNIVERSITY')}>
          <planeGeometry args={[6.8, 0.75]} />
        </mesh>
      </group>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
        <CuboidCollider args={[0.6, 2.2, 0.6]} position={[-3.4, 2.2, -PLOT / 2 + 1.5]} />
        <CuboidCollider args={[0.6, 2.2, 0.6]} position={[3.4, 2.2, -PLOT / 2 + 1.5]} />
        <CuboidCollider args={[15, 3.5, 4]} position={[0, 3.5, 6]} />
      </RigidBody>
      {/* Main Building: long white two-storey block with a central clock tower */}
      <group position={[0, 0, 6]}>
        <mesh position={[0, 3.5, 0]} material={ivory} castShadow>
          <boxGeometry args={[30, 7, 8]} />
        </mesh>
        <mesh position={[0, 7.4, 0]} material={M.roofIron}>
          <boxGeometry args={[30.6, 0.8, 8.6]} />
        </mesh>
        <mesh position={[0, 10.5, -1]} material={ivory} castShadow>
          <boxGeometry args={[4, 13, 4]} />
        </mesh>
        <mesh position={[0, 18, -1]} rotation={[0, Math.PI / 4, 0]} material={M.roofIron}>
          <coneGeometry args={[3.2, 3, 4]} />
        </mesh>
        <mesh position={[0, 14.5, -3.02]} rotation={[0, Math.PI, 0]} material={nameSign('', '#f8f5ec')}>
          <circleGeometry args={[1.1, 20]} />
        </mesh>
        {Array.from({ length: 12 }, (_, k) => (
          <mesh key={k} position={[-13.2 + k * 2.4, 3.5, -4.03]} material={M.timber}>
            <boxGeometry args={[1.1, 4.2, 0.05]} />
          </mesh>
        ))}
      </group>
      {Array.from({ length: 10 }, (_, k) => (
        <StandingHuman key={k} x={-8 + k * 1.8} z={-4 + (k % 3)} rotationY={k} seed={k + 700} />
      ))}
      {[[-14, -12], [14, -12], [-15, 12], [15, 12]].map(([x, z], k) => (
        <RealTree key={k} x={x!} z={z!} seed={k + 720} scale={1.2} />
      ))}
    </group>
  )
}

const redCross = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#dc2626'
  g.fillRect(24, 8, 16, 48)
  g.fillRect(8, 24, 48, 16)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })
})()

/** Mulago National Referral Hospital: tall white wards, a red cross, the gate and waiting relatives. */
function Mulago() {
  const { i, j } = LANDMARK_BLOCKS.mulago
  const [cx, cz] = blockCenter(i, j)
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.paving} receiveShadow>
        <planeGeometry args={[PLOT, PLOT]} />
      </mesh>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
        <mesh position={[0, 9, 6]} material={ivory} castShadow>
          <boxGeometry args={[28, 18, 10]} />
        </mesh>
        {Array.from({ length: 5 }, (_, f) =>
          Array.from({ length: 10 }, (_, k) => (
            <mesh key={`${f}-${k}`} position={[-12.6 + k * 2.8, 2.5 + f * 3.3, 0.97]} material={M.roofIron}>
              <boxGeometry args={[1.6, 1.4, 0.05]} />
            </mesh>
          )),
        )}
        <mesh position={[0, 15.5, 0.96]} rotation={[0, Math.PI, 0]} material={redCross}>
          <planeGeometry args={[2.4, 2.4]} />
        </mesh>
        <CuboidCollider args={[14, 9, 5]} position={[0, 9, 6]} />
      </RigidBody>
      <group position={[0, 0, -PLOT / 2 + 1.5]} rotation={[0, Math.PI, 0]}>
        <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
          <CuboidCollider args={[0.45, 1.8, 0.45]} position={[-3.2, 1.8, 0]} />
          <CuboidCollider args={[0.45, 1.8, 0.45]} position={[3.2, 1.8, 0]} />
        </RigidBody>
        {[-3.2, 3.2].map((x) => (
          <mesh key={x} position={[x, 1.8, 0]} material={gateStone} castShadow>
            <boxGeometry args={[0.9, 3.6, 0.9]} />
          </mesh>
        ))}
        <mesh position={[0, 3.9, 0]} material={nameSign('MULAGO HOSPITAL', '#1e3a8a')}>
          <planeGeometry args={[7, 0.8]} />
        </mesh>
      </group>
      {Array.from({ length: 12 }, (_, k) => (
        <StandingHuman key={k} x={-10 + k * 1.7} z={-6 - (k % 2)} rotationY={Math.PI} seed={k + 800} />
      ))}
    </group>
  )
}

export function KampalaLandmarks() {
  return (
    <group>
      <IndependencePark />
      <TaxiPark />
      <Market />
      <ConstitutionalSquare />
      <Owino />
      <Makerere />
      <Mulago />
    </group>
  )
}
