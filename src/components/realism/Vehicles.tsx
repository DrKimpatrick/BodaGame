import * as THREE from 'three'
import { BodaModel } from '../BodaModel'
import { PassengerModel, RiderModel } from '../RiderModel'

/**
 * Kampala traffic at real scale, built from extruded side profiles with bevelled edges (so cars read as
 * cars, not boxes): white matatu with the blue chequered band, saloons, SUVs, double-cab pickups,
 * coaster buses, lorries, other bodas and bicycles. Vehicle space: forward is +Z, ground at y = 0.
 * Everything is static, so `StaticBatch` merges each vehicle into a few draw calls.
 */

export type { VehicleKind } from './vehicleSpecs'
import type { VehicleKind } from './vehicleSpecs'

type P = [number, number]

/**
 * Extrude a side profile (z = length, y = height) across `width`, centred on x. With `arches`, the
 * bottom edge (points[0] → points[1]) gets a semicircular wheel-arch cut at each wheel.
 */
function extrudeProfile(
  points: P[],
  width: number,
  bevel = 0.06,
  arches?: { zs: number[]; r: number },
): THREE.BufferGeometry {
  let shape: THREE.Shape
  if (arches) {
    shape = new THREE.Shape()
    const [z0, yb] = points[0]!
    shape.moveTo(z0, yb)
    const R = arches.r + 0.07
    for (const wz of [...arches.zs].sort((a, b) => a - b)) {
      shape.lineTo(wz - R, yb)
      shape.lineTo(wz - R, arches.r)
      shape.absarc(wz, arches.r, R, Math.PI, 0, true)
      shape.lineTo(wz + R, yb)
    }
    for (const [z, y] of points.slice(1)) shape.lineTo(z, y)
    shape.closePath()
  } else {
    shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)))
  }
  const depth = Math.max(0.01, width - bevel * 2)
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 3,
  })
  g.translate(0, 0, -depth / 2)
  g.rotateY(-Math.PI / 2)
  g.computeVertexNormals()
  return g
}

const geoCache = new Map<string, THREE.BufferGeometry>()
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key)
  if (!g) geoCache.set(key, (g = make()))
  return g
}

const paintCache = new Map<string, THREE.MeshStandardMaterial>()
function paint(color: string) {
  let m = paintCache.get(color)
  if (!m) paintCache.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2, envMapIntensity: 1.1 })))
  return m
}

const M = {
  // Tinted, slightly see-through glass: an opaque mirror reads as black paint with this little to reflect.
  glass: new THREE.MeshStandardMaterial({ color: '#7d93a8', roughness: 0.08, metalness: 0.35, envMapIntensity: 1.6, transparent: true, opacity: 0.82 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#101112', roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: '#b8bec6', roughness: 0.25, metalness: 0.9 }),
  trim: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.6, metalness: 0.2 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.15, metalness: 1 }),
  head: new THREE.MeshStandardMaterial({ color: '#f5f7fa', roughness: 0.1, emissive: '#fff3d0', emissiveIntensity: 0.5 }),
  tail: new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.2, emissive: '#7f1d1d', emissiveIntensity: 0.7 }),
  plate: new THREE.MeshStandardMaterial({ color: '#f4f4ef', roughness: 0.5 }),
  tarp: new THREE.MeshStandardMaterial({ color: '#2f5d3a', roughness: 0.85 }),
  bed: new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.8 }),
}

function checkerMaterial() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 32
  const g = c.getContext('2d')!
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#1d4ed8' : '#ffffff'
      g.fillRect(x * 8, y * 16, 8, 16)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 })
}
const matatuBand = checkerMaterial()

function destinationMaterial() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 48
  const g = c.getContext('2d')!
  g.fillStyle = '#111'
  g.fillRect(0, 0, 256, 48)
  g.fillStyle = '#fbbf24'
  g.font = 'bold 28px "Arial Narrow", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('KAMPALA - JINJA', 128, 25)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.4 })
}
const busSign = destinationMaterial()

/* ---------- Parts ---------- */

function Wheel({ x, z, r = 0.32, w = 0.2 }: { x: number; z: number; r?: number; w?: number }) {
  return (
    <group position={[x, r, z]}>
      <mesh rotation={[0, Math.PI / 2, 0]} material={M.rubber} castShadow>
        <torusGeometry args={[r * 0.72, r * 0.28, 5, 12]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[Math.sign(x) * w * 0.25, 0, 0]} material={M.rim}>
        <cylinderGeometry args={[r * 0.5, r * 0.5, w * 0.6, 8]} />
      </mesh>
    </group>
  )
}

function Wheels({ track, front, rear, r, dual = false }: { track: number; front: number; rear: number; r?: number; dual?: boolean }) {
  return (
    <>
      <Wheel x={track} z={front} r={r} />
      <Wheel x={-track} z={front} r={r} />
      <Wheel x={track} z={rear} r={r} />
      <Wheel x={-track} z={rear} r={r} />
      {dual ? (
        <>
          <Wheel x={track} z={rear - 1.2} r={r} />
          <Wheel x={-track} z={rear - 1.2} r={r} />
        </>
      ) : null}
    </>
  )
}

/** Head and tail lights + plates at the given body ends. */
function Lights({ halfW, frontZ, rearZ, y, rearY = y }: { halfW: number; frontZ: number; rearZ: number; y: number; rearY?: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (halfW - 0.2), y, frontZ + 0.01]} material={M.head}>
            <boxGeometry args={[0.32, 0.12, 0.04]} />
          </mesh>
          <mesh position={[s * (halfW - 0.15), rearY, rearZ - 0.01]} material={M.tail}>
            <boxGeometry args={[0.22, 0.14, 0.04]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, y - 0.18, frontZ + 0.02]} material={M.plate}>
        <boxGeometry args={[0.46, 0.12, 0.02]} />
      </mesh>
      <mesh position={[0, rearY - 0.12, rearZ - 0.02]} material={M.plate}>
        <boxGeometry args={[0.46, 0.12, 0.02]} />
      </mesh>
    </>
  )
}

/** Dark window pillars over a glass band so long windows read as separate panes. */
function Pillars({ zs, y0, y1, halfW }: { zs: number[]; y0: number; y1: number; halfW: number }) {
  return (
    <>
      {zs.flatMap((z) =>
        [-1, 1].map((sx) => (
          <mesh key={`${z}:${sx}`} position={[sx * halfW, (y0 + y1) / 2, z]} material={M.trim}>
            <boxGeometry args={[0.03, y1 - y0, 0.09]} />
          </mesh>
        )),
      )}
    </>
  )
}

/* ---------- Vehicles ---------- */

const COLOURS = ['#e5e7eb', '#9ca3af', '#111827', '#f8fafc', '#1e3a8a', '#7f1d1d', '#374151', '#d1d5db', '#14532d']

function Saloon({ color }: { color: string }) {
  const body = cached('saloon-body', () =>
    extrudeProfile([[-2.2, 0.28], [2.2, 0.28], [2.25, 0.55], [2.05, 0.82], [0.9, 0.9], [-1.45, 0.9], [-2.2, 0.78]], 1.72, 0.06, { zs: [1.35, -1.35], r: 0.31 }),
  )
  const cabin = cached('saloon-cabin', () =>
    extrudeProfile([[-1.4, 0.88], [0.85, 0.88], [0.2, 1.38], [-1.0, 1.38], [-1.55, 0.9]], 1.52, 0.05),
  )
  return (
    <group>
      <mesh geometry={body} material={paint(color)} castShadow receiveShadow />
      <mesh geometry={cabin} material={M.glass} castShadow />
      <mesh position={[0, 1.4, -0.4]} material={paint(color)}>
        <boxGeometry args={[1.42, 0.05, 1.1]} />
      </mesh>
      <Wheels track={0.78} front={1.35} rear={-1.35} r={0.31} />
      <Lights halfW={0.86} frontZ={2.26} rearZ={-2.26} y={0.62} rearY={0.7} />
    </group>
  )
}

function Suv({ color }: { color: string }) {
  const body = cached('suv-body', () =>
    extrudeProfile([[-2.3, 0.36], [2.3, 0.36], [2.35, 0.75], [2.1, 1.02], [1.05, 1.1], [-2.3, 1.1]], 1.86, 0.06, { zs: [1.45, -1.4], r: 0.38 }),
  )
  const cabin = cached('suv-cabin', () =>
    extrudeProfile([[-2.25, 1.08], [1.0, 1.08], [0.45, 1.75], [-2.2, 1.75]], 1.7, 0.05),
  )
  return (
    <group>
      <mesh geometry={body} material={paint(color)} castShadow receiveShadow />
      <mesh geometry={cabin} material={M.glass} castShadow />
      <mesh position={[0, 1.78, -0.85]} material={paint(color)}>
        <boxGeometry args={[1.62, 0.06, 2.6]} />
      </mesh>
      {/* Spare wheel on the tailgate */}
      <mesh position={[0, 1.0, -2.42]} rotation={[Math.PI / 2, 0, 0]} material={M.rubber}>
        <torusGeometry args={[0.26, 0.1, 8, 18]} />
      </mesh>
      <Wheels track={0.85} front={1.45} rear={-1.4} r={0.38} />
      <Lights halfW={0.93} frontZ={2.36} rearZ={-2.31} y={0.82} rearY={0.95} />
    </group>
  )
}

/** Toyota Hiace-style minibus: matatu (white + blue chequered band) or plain van. */
function Minibus({ color, matatu }: { color: string; matatu: boolean }) {
  const body = cached('hiace-body', () =>
    extrudeProfile([[-2.4, 0.3], [2.35, 0.3], [2.45, 0.7], [2.3, 1.05], [1.75, 1.95], [-2.4, 1.98]], 1.72, 0.06, { zs: [1.55, -1.45], r: 0.32 }),
  )
  const side = cached('hiace-windows', () => extrudeProfile([[-2.2, 1.18], [1.6, 1.18], [1.55, 1.7], [-2.2, 1.7]], 1.76, 0.02))
  const screen = cached('hiace-screen', () => extrudeProfile([[1.62, 1.12], [2.25, 1.1], [1.75, 1.9], [1.5, 1.9]], 1.6, 0.02))
  return (
    <group>
      <mesh geometry={body} material={paint(matatu ? '#f8fafc' : color)} castShadow receiveShadow />
      <mesh geometry={side} material={M.glass} />
      <mesh geometry={screen} material={M.glass} />
      {matatu ? (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.885, 0.95, -0.1]} rotation={[0, s * Math.PI / 2, 0]} material={matatuBand}>
              <planeGeometry args={[4.4, 0.16]} />
            </mesh>
          ))}
          {/* Roof rack with luggage */}
          <mesh position={[0, 2.06, -0.6]} material={M.trim}>
            <boxGeometry args={[1.5, 0.05, 2.6]} />
          </mesh>
          <mesh position={[0.2, 2.24, -0.9]} material={M.tarp}>
            <boxGeometry args={[0.9, 0.32, 1.0]} />
          </mesh>
        </>
      ) : null}
      <Wheels track={0.78} front={1.55} rear={-1.45} r={0.32} />
      <Pillars zs={[-1.6, -0.75, 0.1, 0.95]} y0={1.18} y1={1.7} halfW={0.885} />
      <Lights halfW={0.86} frontZ={2.46} rearZ={-2.41} y={0.72} rearY={0.85} />
    </group>
  )
}

function Pickup({ color }: { color: string }) {
  const body = cached('pickup-body', () =>
    extrudeProfile([[-2.6, 0.42], [2.5, 0.42], [2.58, 0.8], [2.3, 1.05], [1.4, 1.1], [-2.6, 1.1]], 1.8, 0.06, { zs: [1.55, -1.6], r: 0.37 }),
  )
  const cabin = cached('pickup-cabin', () =>
    extrudeProfile([[-0.85, 1.08], [1.35, 1.08], [0.75, 1.75], [-0.8, 1.75]], 1.64, 0.05),
  )
  return (
    <group>
      <mesh geometry={body} material={paint(color)} castShadow receiveShadow />
      <mesh geometry={cabin} material={M.glass} castShadow />
      <mesh position={[0, 1.78, 0.25]} material={paint(color)}>
        <boxGeometry args={[1.55, 0.05, 1.5]} />
      </mesh>
      {/* Open load bed */}
      <mesh position={[0, 1.12, -1.75]} material={M.bed}>
        <boxGeometry args={[1.6, 0.04, 1.6]} />
      </mesh>
      <mesh position={[0, 1.35, -0.92]} material={M.chrome}>
        <boxGeometry args={[1.6, 0.04, 0.04]} />
      </mesh>
      <Wheels track={0.82} front={1.55} rear={-1.6} r={0.37} />
      <Lights halfW={0.9} frontZ={2.59} rearZ={-2.61} y={0.85} rearY={0.95} />
    </group>
  )
}

function Coaster() {
  const body = cached('bus-body', () =>
    extrudeProfile([[-4.4, 0.35], [4.4, 0.35], [4.5, 0.9], [4.35, 2.75], [4.1, 2.95], [-4.4, 2.95]], 2.3, 0.1, { zs: [3.0, -2.6], r: 0.48 }),
  )
  const windows = cached('bus-windows', () => extrudeProfile([[-4.1, 1.55], [3.6, 1.55], [3.6, 2.45], [-4.1, 2.45]], 2.34, 0.02))
  const screen = cached('bus-screen', () => extrudeProfile([[4.2, 1.4], [4.42, 1.4], [4.3, 2.55], [4.05, 2.55]], 2.0, 0.02))
  return (
    <group>
      <mesh geometry={body} material={paint('#f59e0b')} castShadow receiveShadow />
      <mesh geometry={windows} material={M.glass} />
      <mesh geometry={screen} material={M.glass} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.165, 1.05, 0]} rotation={[0, s * Math.PI / 2, 0]} material={paint('#7c2d12')}>
          <planeGeometry args={[8.6, 0.22]} />
        </mesh>
      ))}
      <mesh position={[0, 2.72, 4.47]} material={busSign}>
        <planeGeometry args={[1.5, 0.28]} />
      </mesh>
      <Wheels track={1.04} front={3.0} rear={-2.6} r={0.48} />
      <Pillars zs={[-3.2, -2.0, -0.8, 0.4, 1.6, 2.8]} y0={1.55} y1={2.45} halfW={1.17} />
      <Lights halfW={1.15} frontZ={4.51} rearZ={-4.41} y={0.85} rearY={1.0} />
    </group>
  )
}

function Lorry() {
  const cab = cached('lorry-cab', () =>
    extrudeProfile([[2.4, 0.55], [4.0, 0.55], [4.1, 1.2], [4.0, 2.6], [3.6, 2.75], [2.4, 2.75]], 2.3, 0.08, { zs: [3.2], r: 0.5 }),
  )
  const screen = cached('lorry-screen', () => extrudeProfile([[3.98, 1.6], [4.12, 1.6], [4.0, 2.45], [3.85, 2.45]], 2.0, 0.02))
  return (
    <group>
      <mesh geometry={cab} material={paint('#1d4ed8')} castShadow receiveShadow />
      <mesh geometry={screen} material={M.glass} />
      {/* Chassis + cargo body with tarpaulin */}
      <mesh position={[0, 0.7, -0.6]} material={M.trim} castShadow>
        <boxGeometry args={[1.2, 0.3, 8.6]} />
      </mesh>
      <mesh position={[0, 1.15, -1.6]} material={paint('#78350f')} castShadow>
        <boxGeometry args={[2.35, 0.6, 6.0]} />
      </mesh>
      <mesh position={[0, 2.05, -1.6]} material={M.tarp} castShadow>
        <boxGeometry args={[2.3, 1.2, 5.9]} />
      </mesh>
      <Wheels track={1.0} front={3.2} rear={-2.6} r={0.5} dual />
      <Lights halfW={1.15} frontZ={4.11} rearZ={-4.62} y={0.95} rearY={0.95} />
    </group>
  )
}

/** Another boda on the road: rider in a vest, sometimes a passenger. */
function OtherBoda({ passenger }: { passenger: boolean }) {
  return (
    <group rotation={[0, Math.PI, 0]}>
      <BodaModel spin={false} low />
      <group position={[0, 0.21, 0]}>
        <RiderModel />
        {passenger ? <PassengerModel /> : null}
      </group>
    </group>
  )
}

function Bicycle() {
  const tube = (a: [number, number, number], b: [number, number, number], key: string) => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const d = vb.clone().sub(va)
    return (
      <mesh
        key={key}
        position={va.clone().add(vb).multiplyScalar(0.5)}
        quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())}
        material={paint('#0f172a')}
      >
        <cylinderGeometry args={[0.018, 0.018, d.length(), 6]} />
      </mesh>
    )
  }
  return (
    <group>
      {[0.52, -0.52].map((z) => (
        <mesh key={z} position={[0, 0.34, z]} rotation={[0, Math.PI / 2, 0]} material={M.rubber}>
          <torusGeometry args={[0.32, 0.025, 6, 24]} />
        </mesh>
      ))}
      {tube([0, 0.34, -0.52], [0, 0.62, -0.05], 'a')}
      {tube([0, 0.62, -0.05], [0, 0.88, -0.12], 'b')}
      {tube([0, 0.62, -0.05], [0, 0.82, 0.42], 'c')}
      {tube([0, 0.82, 0.42], [0, 0.34, 0.52], 'd')}
      {tube([0, 0.34, -0.52], [0, 0.36, 0.0], 'e')}
      {tube([-0.25, 0.98, 0.42], [0.25, 0.98, 0.42], 'f')}
      <mesh position={[0, 0.9, -0.12]} material={M.trim}>
        <boxGeometry args={[0.12, 0.05, 0.22]} />
      </mesh>
      {/* Rider sitting upright */}
      <group position={[0, 0.24, 0.15]} rotation={[0, Math.PI, 0]}>
        <RiderModel />
      </group>
    </group>
  )
}

export function VehicleModel({ kind, seed }: { kind: VehicleKind; seed: number }) {
  const color = COLOURS[Math.abs(seed * 7 + kind.length) % COLOURS.length]!
  switch (kind) {
    case 'sedan':
      return <Saloon color={color} />
    case 'taxi':
      // In Kampala the shared "taxi" is the white minibus.
      return <Minibus color={color} matatu />
    case 'matatu':
      return <Minibus color={color} matatu />
    case 'van':
      return <Minibus color={color} matatu={false} />
    case 'suv':
      return <Suv color={color} />
    case 'pickup':
      return <Pickup color={color} />
    case 'bus':
      return <Coaster />
    case 'trailer':
      return <Lorry />
    case 'motorbike':
      return <OtherBoda passenger={seed % 2 === 0} />
    case 'bicycle':
      return <Bicycle />
  }
}

const SHOWROOM: VehicleKind[] = ['taxi', 'sedan', 'suv', 'van', 'pickup', 'bus', 'trailer', 'motorbike', 'bicycle']

/** Dev-only: one of each vehicle staggered down the road ahead of the spawn (open with `?showroom`). */
export function VehicleShowroom({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {SHOWROOM.map((k, i) => (
        <group key={k} position={[i % 2 ? 1.4 : -1.4, 0, -6 - i * 7]} rotation={[0, (i % 2 ? 1 : -1) * 0.9 + Math.PI, 0]}>
          <VehicleModel kind={k} seed={i} />
        </group>
      ))}
    </group>
  )
}
