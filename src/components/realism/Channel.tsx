import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { blockCenter } from '../../game/cityGrid'
import { CHANNEL, CHANNEL_BLOCKS } from '../../game/kampalaMap'
import { segmentRandom } from '../../game/roadDecorPlacements'
import { nameSign } from './nameSign'
import { StandingHuman } from './Nature'

/**
 * Nakivubo channel: Kampala's main storm drain, a walled open channel that takes the city centre's run-off
 * past Owino Market. It sits in a real opening in the ground (see `buildGroundGeometry` in CityMap), with a
 * parapet and rails along both banks, and passes under the cross roads in culverts. Static except the water.
 */

const { halfLength: L, halfWidth: W, depth: D } = CHANNEL
const WATER_Y = -D + 0.7

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number]) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  return t
}

/** Stained concrete: dark tide mark near the water and streaks running down from the top. */
const wallTexture = canvasTexture(
  128,
  (g) => {
    g.fillStyle = '#8c8880'
    g.fillRect(0, 0, 128, 128)
    for (let k = 0; k < 60; k++) {
      g.fillStyle = `rgba(40,36,30,${0.08 + segmentRandom(k, 1, 7301) * 0.2})`
      g.fillRect(segmentRandom(k, 2, 7302) * 128, 0, 1 + segmentRandom(k, 3, 7303) * 3, 30 + segmentRandom(k, 4, 7304) * 70)
    }
    const tide = g.createLinearGradient(0, 70, 0, 128)
    tide.addColorStop(0, 'rgba(30,32,22,0)')
    tide.addColorStop(1, 'rgba(30,32,22,0.85)')
    g.fillStyle = tide
    g.fillRect(0, 70, 128, 58)
  },
  [5, 1],
)

/** Murky water with long ripples; the texture scrolls so it visibly flows. */
const waterTexture = canvasTexture(
  128,
  (g) => {
    g.fillStyle = '#4a4d36'
    g.fillRect(0, 0, 128, 128)
    for (let k = 0; k < 90; k++) {
      g.fillStyle = k % 3 === 0 ? 'rgba(170,175,140,0.28)' : 'rgba(22,26,16,0.35)'
      g.fillRect(segmentRandom(k, 5, 7305) * 128, segmentRandom(k, 6, 7306) * 128, 10 + segmentRandom(k, 7, 7307) * 28, 1)
    }
  },
  [6, 2],
)

const M = {
  wall: new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.95 }),
  water: new THREE.MeshStandardMaterial({ map: waterTexture, roughness: 0.3, metalness: 0.15 }),
  silt: new THREE.MeshStandardMaterial({ color: '#54503a', roughness: 1 }),
  weed: new THREE.MeshStandardMaterial({ color: '#4c7a2c', roughness: 1 }),
  parapet: new THREE.MeshStandardMaterial({ color: '#a9a59c', roughness: 0.95 }),
  rail: new THREE.MeshStandardMaterial({ color: '#39424e', roughness: 0.6, metalness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: '#0d0e0c', roughness: 1 }),
  path: new THREE.MeshStandardMaterial({ color: '#8e6a4c', roughness: 1 }),
  timber: new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.9 }),
  tin: new THREE.MeshStandardMaterial({ color: '#8d9299', roughness: 0.55, metalness: 0.55 }),
}
const RUBBISH = ['#f5f5f4', '#2563eb', '#facc15', '#dc2626', '#16a34a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }))
const KIOSKS = ['#e9c46a', '#9fd3c7', '#e07a5f', '#a8c5e6'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }))

function Bank({ side }: { side: 1 | -1 }) {
  const posts = Math.round((2 * L) / 2.4)
  return (
    <group>
      <mesh position={[0, -D / 2, side * (W + 0.15)]} material={M.wall} receiveShadow>
        <boxGeometry args={[2 * L, D, 0.3]} />
      </mesh>
      <mesh position={[0, 0.22, side * (W + 0.2)]} material={M.parapet} castShadow receiveShadow>
        <boxGeometry args={[2 * L, 0.46, 0.4]} />
      </mesh>
      {Array.from({ length: posts + 1 }, (_, k) => (
        <mesh key={k} position={[-L + k * 2.4, 0.95, side * (W + 0.2)]} material={M.rail}>
          <boxGeometry args={[0.07, 1.05, 0.07]} />
        </mesh>
      ))}
      {[0.85, 1.42].map((y) => (
        <mesh key={y} position={[0, y, side * (W + 0.2)]} material={M.rail}>
          <boxGeometry args={[2 * L, 0.05, 0.05]} />
        </mesh>
      ))}
      <mesh position={[0, 0.012, side * (W + 1.6)]} rotation={[-Math.PI / 2, 0, 0]} material={M.path} receiveShadow>
        <planeGeometry args={[2 * L, 2]} />
      </mesh>
    </group>
  )
}

/** Concrete end wall with the dark culvert mouth, where the channel passes under the road. */
function Culvert({ side }: { side: 1 | -1 }) {
  return (
    <group position={[side * (L - 0.3), 0, 0]}>
      <mesh position={[0, (0.6 - D) / 2, 0]} material={M.parapet} receiveShadow castShadow>
        <boxGeometry args={[0.6, D + 0.6, 2 * W + 0.8]} />
      </mesh>
      <mesh position={[-side * 0.32, WATER_Y + 0.75, 0]} material={M.dark}>
        <boxGeometry args={[0.04, 1.5, 2 * W - 1.6]} />
      </mesh>
    </group>
  )
}

/** Silt bars with weeds, and the bottles and jerrycans that collect against them. */
function Bed({ seed }: { seed: number }) {
  return (
    <group>
      <mesh position={[0, -D - 0.05, 0]} material={M.silt}>
        <boxGeometry args={[2 * L, 0.1, 2 * W]} />
      </mesh>
      {[0, 1].map((n) => {
        const x = -8 + n * 16 + segmentRandom(seed, n, 7310) * 4
        const z = (n ? 1 : -1) * (W - 1.1)
        return (
          <group key={n} position={[x, WATER_Y, z]}>
            <mesh scale={[5, 0.32, 1.1]} material={M.silt}>
              <sphereGeometry args={[1, 8, 5]} />
            </mesh>
            {Array.from({ length: 7 }, (_, k) => (
              <mesh key={k} position={[-3 + k, 0.35, (k % 2) * 0.4 - 0.2]} material={M.weed}>
                <coneGeometry args={[0.28, 0.9, 4]} />
              </mesh>
            ))}
          </group>
        )
      })}
      {Array.from({ length: 26 }, (_, k) => {
        const big = k % 5 === 0
        return (
          <mesh
            key={k}
            position={[-L + 1.5 + segmentRandom(seed, k, 7311) * (2 * L - 3), WATER_Y + 0.05, (segmentRandom(seed, k, 7312) - 0.5) * (2 * W - 1)]}
            rotation={[0, segmentRandom(seed, k, 7313) * 3, 0.3]}
            material={RUBBISH[k % RUBBISH.length]}
          >
            <boxGeometry args={big ? [0.5, 0.32, 0.34] : [0.34, 0.12, 0.12]} />
          </mesh>
        )
      })}
    </group>
  )
}

function Kiosk({ x, z, k }: { x: number; z: number; k: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.15, 0]} material={KIOSKS[k % KIOSKS.length]} castShadow>
        <boxGeometry args={[3, 2.3, 2.2]} />
      </mesh>
      <mesh position={[0, 2.45, -0.25]} rotation={[0.1, 0, 0]} material={M.tin} castShadow>
        <boxGeometry args={[3.4, 0.06, 3.2]} />
      </mesh>
      <mesh position={[0, 1.25, -1.12]} material={M.dark}>
        <boxGeometry args={[2.2, 1, 0.04]} />
      </mesh>
      <StandingHuman x={0.5} z={-2} rotationY={0} seed={k + 960} />
    </group>
  )
}

/** Steel footbridge over the channel, with steps at each end. */
function Footbridge() {
  const y = 1.75
  const half = W + 0.6
  return (
    <group>
      <mesh position={[0, y, 0]} material={M.rail} castShadow>
        <boxGeometry args={[1.8, 0.12, 2 * half]} />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, y + 0.6, 0]} material={M.rail}>
          <boxGeometry args={[0.05, 0.05, 2 * half]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          {Array.from({ length: 6 }, (_, k) => (
            <mesh key={k} position={[0, 0.15 + k * 0.28, s * (half + 1.7 - k * 0.3)]} material={M.parapet} castShadow>
              <boxGeometry args={[1.8, 0.28, 0.32]} />
            </mesh>
          ))}
          {[-0.9, 0.9].map((x) => (
            <mesh key={x} position={[x, y / 2 + 0.3, s * half]} material={M.rail}>
              <boxGeometry args={[0.08, y + 0.6, 0.08]} />
            </mesh>
          ))}
        </group>
      ))}
      <StandingHuman x={0.35} z={-1} rotationY={0} seed={950} />
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
        <CuboidCollider args={[0.9, 0.8, 1]} position={[0, 0.8, half + 1]} />
        <CuboidCollider args={[0.9, 0.8, 1]} position={[0, 0.8, -half - 1]} />
      </RigidBody>
    </group>
  )
}

/** Advances the shared water texture; one uniform update per frame. */
function WaterFlow() {
  useFrame((_, dt) => {
    waterTexture.offset.x = (waterTexture.offset.x + Math.min(dt, 0.1) * 0.07) % 1
  })
  return null
}

export function NakivuboChannel() {
  return (
    <group>
      <WaterFlow />
      {CHANNEL_BLOCKS.map(({ i, j }, n) => {
        const [cx, cz] = blockCenter(i, j)
        return (
          <group key={`${i},${j}`} position={[cx, 0, cz]}>
            <Bank side={1} />
            <Bank side={-1} />
            <Culvert side={1} />
            <Culvert side={-1} />
            <Bed seed={n + 1} />
            <mesh position={[0, WATER_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.water} userData={{ dynamic: true }} receiveShadow>
              <planeGeometry args={[2 * L, 2 * W]} />
            </mesh>
            <RigidBody type="fixed" colliders={false} userData={{ kind: 'building' }}>
              <CuboidCollider args={[L, 1, 0.3]} position={[0, 1, W + 0.2]} />
              <CuboidCollider args={[L, 1, 0.3]} position={[0, 1, -W - 0.2]} />
              {[-13, 13].map((x) => (
                <CuboidCollider key={x} args={[1.5, 1.2, 1.1]} position={[x, 1.2, -13.5]} />
              ))}
            </RigidBody>
            {[-13, 13].map((x, k) => (
              <Kiosk key={x} x={x} z={-13.5} k={n * 2 + k} />
            ))}
            {n === 1 ? (
              <>
                <Footbridge />
                {[-3.6, 3.6].map((x) => (
                  <mesh key={x} position={[x + 6.5, 1.5, -W - 0.75]} material={M.rail}>
                    <boxGeometry args={[0.12, 3, 0.12]} />
                  </mesh>
                ))}
                <mesh position={[6.5, 2.6, -W - 0.8]} rotation={[0, Math.PI, 0]} material={nameSign('NAKIVUBO CHANNEL', '#1e3a8a')}>
                  <planeGeometry args={[8, 1.5]} />
                </mesh>
              </>
            ) : null}
          </group>
        )
      })}
    </group>
  )
}
