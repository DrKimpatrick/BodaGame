import { Html, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  type CollisionEnterPayload,
  type RapierRigidBody,
  RigidBody,
  useAfterPhysicsStep,
  useRapier,
} from '@react-three/rapier'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
} from 'react'
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useBikeEngineAudio } from '../hooks/useBikeEngineAudio'
import { useKeyboard } from '../hooks/useKeyboard'
import {
  BIKE_SPAWN_PED_CLEAR_M,
  BIKE_SPAWN_XZ,
  CONDITION_BROKEN_AT,
  FUEL_PER_WORLD_METER,
  normalizeCondition,
  RIDE_SCORE_LOSS_BUILDING,
  RIDE_SCORE_LOSS_PEDESTRIAN,
  RIDE_SCORE_LOSS_VEHICLE,
  RIDE_SCORE_POINTS_PER_WORLD_M,
  shouldApplyBikePedestrianInteraction,
  useGameStore,
} from '../store/useGameStore'
import { BikeDustTrail } from './BikeDustTrail'
import { BikeExhaust } from './BikeExhaust'
import {
  jobPassengerCoatBlueMat,
  jobPassengerCoatRedMat,
  jobPassengerPantsMat,
  jobPassengerSkinMat,
} from '@game/jobPassengerMaterials'
import {
  getPotholeStrikeEnvelope,
  sampleRoadSurfaceBikeEffect,
} from '@game/roadSurfaceFeatures'
import { isDeepOffRoad, isDrivableSurface } from '@game/roadSpatial'

const MAX_FORWARD = 14
const MAX_REVERSE = 10
const ACCEL = 28
/** Extra oomph when building reverse from standstill (S while stopped). */
const REVERSE_ACCEL_SCALE = 1.4
const FRICTION = 6.5
const TURN_SPEED = 2.4
const BRAKE_DECEL = 42
/**
 * Off-limits / shoulder / deep grass: much higher top speed and thrust than
 * on tarmac (arcade “open field” feel — still never hard-zeroed).
 */
const OFFROAD_DRAG_PER_S = 1.25
const OFFROAD_ACCEL_SCALE = 1.65
const OFFROAD_SPEED_CAP = 36
const OFFROAD_REVERSE_SCALE = 0.95

/** After hitting a walker: brief throttle lock. */
const PEDESTRIAN_STUN_MS = 520
/** Car hit: strong slow + stun only (no ragdoll / wreck — avoids physics + graphics issues). */
const VEHICLE_STUN_MS = 720
/** Glancing a fixed building: short throttle lock. */
const BUILDING_STUN_MS = 260
const CONDITION_LOSS_PEDESTRIAN = 6
/** Vehicle strike — much harsher than a pedestrian knock. */
const CONDITION_LOSS_VEHICLE = 32
/** Static building / wall scrape — small wear. */
const CONDITION_LOSS_BUILDING = 3.5
/** Each distinct pothole strike — small wear (stacks over a bad road). */
const CONDITION_LOSS_POTHOLE = 2.2

const POTHOLE_STRIKE_IN = 0.2
const POTHOLE_STRIKE_OUT = 0.052
const POTHOLE_STRIKE_MIN_SPEED = 0.72
const POTHOLE_STRIKE_COOLDOWN_MS = 480

/** Off-network / not allowed surface — periodic condition + blood HUD while moving. */
const CONDITION_LOSS_RESTRICTED_TICK = 1.1
const RESTRICTED_ZONE_DAMAGE_INTERVAL_MS = 1020
const RESTRICTED_ZONE_MIN_SPEED = 0.24

const JOB_ARRIVE_DIST = 3.55
const JOB_ARRIVE_SPEED = 1.45
/** Min speed (m/s) before distance counts toward safe-riding score. */
const RIDE_SCORE_MIN_SPEED_MS = 0.38

const Y_AXIS = new THREE.Vector3(0, 1, 0)

function stepGasBrakeCoastSpeed(params: {
  dt: number
  speedRef: { current: number }
  gas: boolean
  brake: boolean
  accel: number
  brakeDecel: number
  reverseDragPerS: number
}) {
  const {
    dt,
    speedRef,
    gas,
    brake,
    accel,
    brakeDecel,
    reverseDragPerS,
  } = params
  let s = speedRef.current
  const frictionLight = FRICTION * 0.15

  if (brake && s > 0.04) {
    s = Math.max(0, s - brakeDecel * dt)
  } else if (brake && s < -0.04) {
    s = Math.min(0, s + brakeDecel * dt)
  } else if (gas) {
    s += accel * dt
    s *= Math.exp(-frictionLight * dt)
  } else if (!brake && s > 0.04) {
    s *= Math.exp(-FRICTION * dt)
    if (s < 0.06) s = 0
  } else if (brake && Math.abs(s) <= 0.04 && !gas) {
    s -= accel * REVERSE_ACCEL_SCALE * dt
  } else if (s < -0.04) {
    s *= Math.exp(-reverseDragPerS * dt)
    if (s > -0.06) s = 0
  } else {
    s = 0
  }

  speedRef.current = s
}

/** Placeholder humanoid (Three.js RobotExpressive); replace with your asset URL when ready. */
const RIDER_PLACEHOLDER_GLTF =
  'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb'

const SPAWN: [number, number, number] = [0, 0.32, 0]

function assignForwardedRef<T>(
  ref: ForwardedRef<T> | undefined,
  value: T | null,
) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

/** Glossy commuter red (tank, fenders) */
const matRed = {
  color: '#d42429',
  metalness: 0.28,
  roughness: 0.16,
} as const

/** Frame, seat, rubber, plastics */
const matBlack = {
  color: '#141414',
  metalness: 0.06,
  roughness: 0.88,
} as const

/** Engine, exhaust, shocks, chain guard */
const matSilver = {
  color: '#9ca3af',
  metalness: 0.82,
  roughness: 0.32,
} as const

/** Rim + dark trim */
const matRim = {
  color: '#0a0a0a',
  metalness: 0.35,
  roughness: 0.45,
} as const

const matTire = {
  color: '#0d0d0d',
  metalness: 0.02,
  roughness: 0.94,
} as const

const matGlass = {
  color: '#fef3c7',
  metalness: 0.1,
  roughness: 0.15,
  emissive: '#2a2010',
  emissiveIntensity: 0.15,
} as const

/** High-viz reflector vest */
const matVest = {
  color: '#facc15',
  emissive: '#ca8a04',
  emissiveIntensity: 0.22,
  metalness: 0.04,
  roughness: 0.55,
} as const

function RiderJobDestBillboard() {
  const job = useGameStore((s) => s.rideJob)
  if (!job) return null
  const target = job.phase === 'pickup' ? job.pickup : job.dropoff
  const phaseLabel = job.phase === 'pickup' ? 'Pick up' : 'Drop off'
  return (
    <Html
      position={[0, 2.38, -0.06]}
      center
      distanceFactor={11}
      zIndexRange={[200, 0]}
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <div className="max-w-[min(200px,45vw)] rounded-xl border-2 border-amber-400/90 border-b-4 border-b-amber-950 bg-zinc-950/94 px-2.5 py-1.5 text-center shadow-[0_4px_0_rgba(69,26,3,0.75)] ring-1 ring-amber-300/40 backdrop-blur-sm">
        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-300/95">
          {phaseLabel}
        </p>
        <p className="mt-0.5 text-[12px] font-black leading-tight text-white drop-shadow-sm">
          {target.name}
        </p>
        <p className="mt-1 font-mono text-[10px] font-black text-emerald-400">
          {job.payoutUgx.toLocaleString()} UGX
        </p>
      </div>
    </Html>
  )
}

/** Pillion passenger (red / blue coat) — visible while job phase is `carrying`. */
function PassengerOnBike() {
  const phase = useGameStore((s) => s.rideJob?.phase)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (phase !== 'carrying') return
    const w = Math.sin(clock.elapsedTime * 5.8 + 1.1) * 0.055
    if (legL.current) legL.current.rotation.x = w
    if (legR.current) legR.current.rotation.x = -w
  })

  if (phase !== 'carrying') return null

  return (
    <group position={[0, 0.74, 0.56]} rotation={[0.16, Math.PI, 0]}>
      <group scale={0.9} position={[0, -0.3, 0]}>
        <mesh position={[0, 1.32, -0.05]} castShadow material={jobPassengerSkinMat}>
          <sphereGeometry args={[0.11, 10, 10]} />
        </mesh>
        <mesh position={[-0.07, 0.95, -0.03]} castShadow material={jobPassengerCoatRedMat}>
          <boxGeometry args={[0.14, 0.48, 0.18]} />
        </mesh>
        <mesh position={[0.07, 0.95, -0.03]} castShadow material={jobPassengerCoatBlueMat}>
          <boxGeometry args={[0.14, 0.48, 0.18]} />
        </mesh>
        <mesh
          position={[-0.15, 1.02, -0.14]}
          rotation={[0.35, 0, 0.55]}
          castShadow
          material={jobPassengerCoatRedMat}
        >
          <boxGeometry args={[0.07, 0.07, 0.22]} />
        </mesh>
        <mesh
          position={[0.15, 1.02, -0.14]}
          rotation={[0.35, 0, -0.55]}
          castShadow
          material={jobPassengerCoatBlueMat}
        >
          <boxGeometry args={[0.07, 0.07, 0.22]} />
        </mesh>
        <group ref={legL} position={[-0.12, 0.66, 0.08]} rotation={[0.08, 0, 0.12]}>
          <mesh position={[0, -0.15, 0]} castShadow material={jobPassengerPantsMat}>
            <boxGeometry args={[0.1, 0.34, 0.1]} />
          </mesh>
        </group>
        <group ref={legR} position={[0.12, 0.66, 0.08]} rotation={[0.08, 0, -0.12]}>
          <mesh position={[0, -0.15, 0]} castShadow material={jobPassengerPantsMat}>
            <boxGeometry args={[0.1, 0.34, 0.1]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function RiderHumanoid() {
  const { scene } = useGLTF(RIDER_PLACEHOLDER_GLTF)
  const riderRoot = useMemo(() => {
    // scene.clone(true) leaves SkinnedMesh hands bound to the original armature — they stay behind.
    const root = cloneSkinnedScene(scene)
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && /torso/i.test(obj.name)) {
        obj.material = new THREE.MeshStandardMaterial({ ...matVest })
        obj.castShadow = true
      }
    })
    return root
  }, [scene])

  return (
    <group position={[0, 0.72, 0.28]} rotation={[0, Math.PI, 0]}>
      <primitive object={riderRoot} scale={0.22} />
    </group>
  )
}

useGLTF.preload(RIDER_PLACEHOLDER_GLTF)

function Wheel({ z }: { z: number }) {
  return (
    <group position={[0, 0, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.31, 0.31, 0.11, 20]} />
        <meshStandardMaterial {...matTire} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.12, 20]} />
        <meshStandardMaterial {...matRim} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[0, Math.cos(a) * 0.1, Math.sin(a) * 0.1]}
            rotation={[0, -a, 0]}
            castShadow
          >
            <boxGeometry args={[0.03, 0.18, 0.035]} />
            <meshStandardMaterial {...matRim} />
          </mesh>
        )
      })}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.2, 0.012, 8, 24]} />
        <meshStandardMaterial {...matRed} roughness={0.35} metalness={0.2} />
      </mesh>
    </group>
  )
}

function BodaBikeModel() {
  return (
    <group>
      <Wheel z={-0.78} />
      <Wheel z={0.78} />

      <mesh
        position={[0, 0.22, -0.05]}
        rotation={[0.55, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.035, 0.035, 0.95, 8]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.38, 0.35]} rotation={[-0.35, 0, 0]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.75, 8]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      <mesh position={[0, 0.12, 0.02]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.22, 0.022, 8, 20]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      <mesh position={[0, 0.08, 0.06]} castShadow receiveShadow>
        <boxGeometry args={[0.38, 0.28, 0.36]} />
        <meshStandardMaterial {...matSilver} />
      </mesh>
      <mesh position={[0, 0.06, 0.22]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.12, 12]} />
        <meshStandardMaterial {...matSilver} />
      </mesh>

      <mesh position={[-0.12, 0.04, 0.52]} rotation={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, 0.42]} />
        <meshStandardMaterial {...matSilver} metalness={0.75} roughness={0.4} />
      </mesh>

      <mesh
        position={[-0.22, 0.1, 0.35]}
        rotation={[0, 0, Math.PI / 2.3]}
        castShadow
      >
        <cylinderGeometry args={[0.045, 0.055, 0.55, 10]} />
        <meshStandardMaterial {...matSilver} />
      </mesh>

      <mesh position={[0, 0.48, -0.18]} castShadow receiveShadow>
        <sphereGeometry args={[0.26, 16, 12]} />
        <meshStandardMaterial {...matRed} />
      </mesh>
      <mesh position={[0, 0.5, -0.28]} castShadow>
        <boxGeometry args={[0.36, 0.08, 0.14]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} metalness={0.1} />
      </mesh>

      <mesh position={[0.22, 0.28, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 0.22, 0.38]} />
        <meshStandardMaterial {...matRed} />
      </mesh>
      <mesh position={[-0.22, 0.28, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 0.22, 0.38]} />
        <meshStandardMaterial {...matRed} />
      </mesh>

      <mesh position={[0, 0.52, 0.32]} castShadow receiveShadow>
        <boxGeometry args={[0.36, 0.1, 0.62]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.62, 0.28]} castShadow>
        <boxGeometry args={[0.34, 0.04, 0.5]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.72, 0.5]} castShadow>
        <boxGeometry args={[0.28, 0.03, 0.2]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0.12, 0.66, 0.52]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.28, 6]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[-0.12, 0.66, 0.52]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.28, 6]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      {[-0.13, 0.13].map((x) => (
        <group key={x} position={[x, 0.32, 0.48]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.028, 0.028, 0.22, 8]} />
            <meshStandardMaterial {...matSilver} />
          </mesh>
          <mesh position={[0, -0.06, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.08, 10]} />
            <meshStandardMaterial {...matSilver} metalness={0.85} roughness={0.25} />
          </mesh>
        </group>
      ))}

      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.28, -0.62]} castShadow>
          <cylinderGeometry args={[0.03, 0.028, 0.62, 8]} />
          <meshStandardMaterial {...matBlack} />
        </mesh>
      ))}

      {[-0.1, 0.1].map((x) => (
        <mesh key={`g-${x}`} position={[x, 0.08, -0.58]} castShadow>
          <cylinderGeometry args={[0.038, 0.034, 0.22, 8]} />
          <meshStandardMaterial {...matBlack} roughness={0.92} />
        </mesh>
      ))}

      <mesh position={[0, 0.56, -0.48]} castShadow>
        <boxGeometry args={[0.24, 0.05, 0.08]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      <mesh position={[0, 0.58, -0.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.72, 8]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>

      <mesh position={[0, 0.52, -0.78]} castShadow>
        <boxGeometry args={[0.32, 0.12, 0.1]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.48, -0.82]} castShadow receiveShadow>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshStandardMaterial {...matGlass} />
      </mesh>
      <mesh position={[0, 0.42, -0.76]} castShadow>
        <boxGeometry args={[0.34, 0.06, 0.12]} />
        <meshStandardMaterial {...matRed} />
      </mesh>

      <mesh
        position={[0, 0.12, -0.82]}
        rotation={[0.35, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.28, 0.04, 0.22]} />
        <meshStandardMaterial {...matRed} />
      </mesh>

      {[-0.2, 0.2].map((x) => (
        <mesh key={`s-${x}`} position={[x, 0.46, -0.8]} castShadow>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshStandardMaterial
            color="#ea580c"
            emissive="#7c2d12"
            emissiveIntensity={0.25}
            roughness={0.5}
            metalness={0.1}
          />
        </mesh>
      ))}

      <mesh
        position={[0, 0.22, 0.88]}
        rotation={[-0.4, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.26, 0.04, 0.28]} />
        <meshStandardMaterial {...matBlack} />
      </mesh>
      <mesh position={[0, 0.38, 0.92]} castShadow>
        <boxGeometry args={[0.12, 0.08, 0.06]} />
        <meshStandardMaterial color="#7f1d1d" emissive="#450a0a" emissiveIntensity={0.2} />
      </mesh>
    </group>
  )
}

type BodaProps = {
  onSpeedKmhChange?: (speedKmh: number) => void
  onOffroadChange?: (isOffroad: boolean) => void
}

export const Boda = forwardRef<RapierRigidBody, BodaProps>(function Boda(
  { onSpeedKmhChange, onOffroadChange },
  ref,
) {
  const rb = useRef<RapierRigidBody | null>(null)
  /** Latest forwarded ref without re-creating callbacks (RigidBody is memoized). */
  const forwardRefLatest = useRef(ref)
  forwardRefLatest.current = ref

  const { world } = useRapier()

  useEffect(
    () => () => {
      rb.current = null
      assignForwardedRef(forwardRefLatest.current, null)
    },
    [],
  )

  useEffect(() => {
    return useGameStore.subscribe((_state, prev) => {
      const s = useGameStore.getState()
      const nowBroken =
        normalizeCondition(s.condition) <= CONDITION_BROKEN_AT
      const wasBroken =
        normalizeCondition(prev.condition) <= CONDITION_BROKEN_AT
      if (nowBroken && !wasBroken) {
        speed.current = 0
        const body = rb.current
        if (!body) return
        try {
          if (world.getRigidBody(body.handle) != null) {
            body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          }
        } catch {
          /* rigid body torn down */
        }
      }
    })
  }, [world])

  const keys = useKeyboard()
  const prevDriveHud = useRef({
    gas: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
  })
  const speed = useRef(0)
  useBikeEngineAudio(speed)
  const yaw = useRef(0)
  const lastReportedKmh = useRef(-1)
  const [isOffroad, setIsOffroad] = useState(false)
  const offroadRef = useRef(false)
  const visualRef = useRef<THREE.Group>(null)
  const bankSmoothed = useRef(0)
  const pitchSmoothed = useRef(0)
  const yOffSmoothed = useRef(0)
  const enginePhase = useRef(0)
  const lastFuelPos = useRef<{ x: number; z: number } | null>(null)
  /** Car hits can spam `onCollisionEnter` while overlapping. */
  const noVehicleBumpUntil = useRef(0)
  /** Building hits while sliding along a wall. */
  const noBuildingBumpUntil = useRef(0)
  /** Pedestrian hits can spam collision events while overlapping. */
  const noPedestrianStunUntil = useRef(0)
  /** Throttle ignored until this time (walker / vehicle bump). */
  const stunnedUntil = useRef(0)
  const potholeEnvelopePrev = useRef(0)
  const potholeHitCooldownUntil = useRef(0)
  /** Decays 0→1 after a pothole strike — extra mesh dip / wobble. */
  const potholeJolt = useRef(0)
  /** Decays after hitting static geometry — rebound pitch / roll. */
  const buildingHitJolt = useRef(0)
  const restrictedZoneDamageNextMs = useRef(0)
  const lastBikeMapEmitMs = useRef(0)
  const rideJobGateUntilMs = useRef(0)
  /** Fractional score from distance; flushed via {@link useGameStore.applyRideScoreDelta}. */
  const rideScoreAcc = useRef(0)

  const forward = useMemo(() => new THREE.Vector3(), [])
  const quat = useMemo(() => new THREE.Quaternion(), [])

  const onBikeCollision = useCallback(
    ({ other }: CollisionEnterPayload) => {
      const now = performance.now()
      const ud = other.rigidBodyObject?.userData as { kind?: string } | undefined
      if (ud?.kind === 'vehicle') {
        if (now < useGameStore.getState().collisionPenaltiesAfterMs) return
        if (now < noVehicleBumpUntil.current) return
        noVehicleBumpUntil.current = now + 850
        speed.current *= 0.26
        stunnedUntil.current = Math.max(
          stunnedUntil.current,
          now + VEHICLE_STUN_MS,
        )
        const st = useGameStore.getState()
        st.setCondition(
          Math.max(0, st.condition - CONDITION_LOSS_VEHICLE),
        )
        st.triggerBloodImpactFlash('vehicle')
        st.applyRideScoreDelta(-RIDE_SCORE_LOSS_VEHICLE)
        return
      }
      if (ud?.kind === 'building') {
        if (now < useGameStore.getState().collisionPenaltiesAfterMs) return
        if (now < noBuildingBumpUntil.current) return
        noBuildingBumpUntil.current = now + 520
        speed.current *= 0.42
        stunnedUntil.current = Math.max(
          stunnedUntil.current,
          now + BUILDING_STUN_MS,
        )
        buildingHitJolt.current = 1
        const st = useGameStore.getState()
        st.setCondition(Math.max(0, st.condition - CONDITION_LOSS_BUILDING))
        st.applyRideScoreDelta(-RIDE_SCORE_LOSS_BUILDING)
        return
      }
      if (ud?.kind === 'pedestrian') {
        if (!shouldApplyBikePedestrianInteraction()) return
        if (now < noPedestrianStunUntil.current) return
        noPedestrianStunUntil.current = now + 700
        speed.current *= 0.38
        stunnedUntil.current = now + PEDESTRIAN_STUN_MS
        const st = useGameStore.getState()
        st.setCondition(Math.max(0, st.condition - CONDITION_LOSS_PEDESTRIAN))
        st.triggerBloodImpactFlash('pedestrian')
        st.applyRideScoreDelta(-RIDE_SCORE_LOSS_PEDESTRIAN)
      }
    },
    [],
  )

  useAfterPhysicsStep(() => {
    const body = rb.current
    if (!body || world.getRigidBody(body.handle) == null) return
    const av = body.angvel()
    if (Math.abs(av.x) > 0.002 || Math.abs(av.z) > 0.002) {
      body.setAngvel({ x: 0, y: av.y, z: 0 }, true)
    }
  })

  useFrame((_, delta) => {
    assignForwardedRef(forwardRefLatest.current, rb.current)

    const body = rb.current
    if (!body || world.getRigidBody(body.handle) == null) return

    const dt = Math.min(delta, 0.05)

    const t = body.translation()
    const nowEmit = performance.now()
    if (nowEmit - lastBikeMapEmitMs.current >= 100) {
      lastBikeMapEmitMs.current = nowEmit
      useGameStore.getState().setBikeMapCoords(t.x, t.z)
    }
    if (!useGameStore.getState().bikeAwayFromSpawn) {
      const d = Math.hypot(t.x - BIKE_SPAWN_XZ.x, t.z - BIKE_SPAWN_XZ.z)
      if (d > BIKE_SPAWN_PED_CLEAR_M) {
        useGameStore.setState({ bikeAwayFromSpawn: true })
      }
    }
    const drivable = isDrivableSurface(t.x, t.z)

    const brokenDown =
      normalizeCondition(useGameStore.getState().condition) <=
      CONDITION_BROKEN_AT

    const steer = brokenDown
      ? 0
      : (keys.current.left ? 1 : 0) - (keys.current.right ? 1 : 0)
    const isStunned = performance.now() < stunnedUntil.current
    const gas = !brokenDown && !isStunned && keys.current.forward
    const brake = !brokenDown && !isStunned && keys.current.back

    const dh = {
      gas: keys.current.forward,
      brake: keys.current.back,
      steerLeft: keys.current.left,
      steerRight: keys.current.right,
    }
    const p = prevDriveHud.current
    if (
      p.gas !== dh.gas ||
      p.brake !== dh.brake ||
      p.steerLeft !== dh.steerLeft ||
      p.steerRight !== dh.steerRight
    ) {
      prevDriveHud.current = dh
      useGameStore.getState().setDriveHud(dh)
    }

    const speedAbsEarly = Math.abs(speed.current)
    const moving = speedAbsEarly > 0.08
    if (moving || steer !== 0) {
      let turnScale = THREE.MathUtils.clamp(
        speedAbsEarly / MAX_FORWARD,
        0.35,
        1,
      )
      /** Pivot in place when nearly stopped so you can turn off a wall / shoulder. */
      if (speedAbsEarly < 0.2 && steer !== 0) {
        turnScale = 1
      }
      yaw.current += steer * TURN_SPEED * turnScale * dt
    }

    const fuelLeft = useGameStore.getState().fuel

    if (drivable) {
      if (fuelLeft > 0 && !brokenDown) {
        stepGasBrakeCoastSpeed({
          dt,
          speedRef: speed,
          gas,
          brake,
          accel: ACCEL,
          brakeDecel: BRAKE_DECEL,
          reverseDragPerS: FRICTION * 0.55,
        })
      } else if (fuelLeft > 0 && brokenDown) {
        speed.current *= Math.exp(-FRICTION * 2.8 * dt)
        if (Math.abs(speed.current) < 0.05) speed.current = 0
      } else {
        const drag = Math.exp(-FRICTION * 1.2 * dt)
        speed.current *= drag
        if (Math.abs(speed.current) < 0.06) speed.current = 0
      }
    } else if (fuelLeft > 0 && !brokenDown) {
      stepGasBrakeCoastSpeed({
        dt,
        speedRef: speed,
        gas,
        brake,
        accel: ACCEL * OFFROAD_ACCEL_SCALE,
        brakeDecel: BRAKE_DECEL * 0.92,
        reverseDragPerS: FRICTION * 0.58,
      })
      speed.current *= Math.exp(-OFFROAD_DRAG_PER_S * 0.28 * dt)
    } else {
      speed.current *= Math.exp(-OFFROAD_DRAG_PER_S * (fuelLeft > 0 ? 1 : 1.35) * dt)
      if (Math.abs(speed.current) < 0.07) speed.current = 0
    }

    if (brokenDown) {
      speed.current *= Math.exp(-FRICTION * 6 * dt)
      if (Math.abs(speed.current) < 0.04) speed.current = 0
    }

    const capFwd = drivable ? MAX_FORWARD : OFFROAD_SPEED_CAP
    const capRev = drivable ? MAX_REVERSE : MAX_REVERSE * OFFROAD_REVERSE_SCALE
    speed.current = THREE.MathUtils.clamp(speed.current, -capRev, capFwd)

    quat.setFromAxisAngle(Y_AXIS, yaw.current)
    forward.set(0, 0, -1).applyQuaternion(quat)
    const speedAbsPreSurf = Math.abs(speed.current)
    const surf = sampleRoadSurfaceBikeEffect(
      t.x,
      t.z,
      forward.x,
      forward.z,
      speedAbsPreSurf,
    )
    if (drivable && !brokenDown) {
      speed.current *= surf.speedMul
    }

    const phEnv =
      drivable && !brokenDown ? getPotholeStrikeEnvelope(t.x, t.z) : 0
    const strikeNow = performance.now()
    if (
      drivable &&
      !brokenDown &&
      speedAbsPreSurf > POTHOLE_STRIKE_MIN_SPEED &&
      phEnv > POTHOLE_STRIKE_IN &&
      potholeEnvelopePrev.current < POTHOLE_STRIKE_OUT &&
      strikeNow >= potholeHitCooldownUntil.current
    ) {
      potholeHitCooldownUntil.current = strikeNow + POTHOLE_STRIKE_COOLDOWN_MS
      potholeJolt.current = 1
      const st = useGameStore.getState()
      st.setCondition(Math.max(0, st.condition - CONDITION_LOSS_POTHOLE))
    }
    potholeEnvelopePrev.current = phEnv

    body.setRotation(
      { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
      true,
    )

    body.setLinvel(
      {
        x: forward.x * speed.current,
        y: 0,
        z: forward.z * speed.current,
      },
      true,
    )

    const nextOffroad = isDeepOffRoad(t.x, t.z)
    if (nextOffroad !== offroadRef.current) {
      offroadRef.current = nextOffroad
      setIsOffroad(nextOffroad)
      onOffroadChange?.(nextOffroad)
    }

    const speedAbs = Math.abs(speed.current)

    const rideJob = useGameStore.getState().rideJob
    const nowJob = performance.now()
    if (
      rideJob &&
      !brokenDown &&
      nowJob >= rideJobGateUntilMs.current &&
      nowJob >= useGameStore.getState().collisionPenaltiesAfterMs
    ) {
      if (rideJob.phase === 'pickup') {
        const d = Math.hypot(t.x - rideJob.pickup.x, t.z - rideJob.pickup.z)
        if (d < JOB_ARRIVE_DIST && speedAbs < JOB_ARRIVE_SPEED) {
          rideJobGateUntilMs.current = nowJob + 900
          useGameStore.getState().completeRidePickup()
        }
      } else {
        const d = Math.hypot(t.x - rideJob.dropoff.x, t.z - rideJob.dropoff.z)
        if (d < JOB_ARRIVE_DIST && speedAbs < JOB_ARRIVE_SPEED) {
          rideJobGateUntilMs.current = nowJob + 900
          useGameStore.getState().completeRideDropoff()
        }
      }
    }

    if (!drivable && !brokenDown && speedAbs > RESTRICTED_ZONE_MIN_SPEED) {
      const nowZ = performance.now()
      const stZ = useGameStore.getState()
      if (
        nowZ >= stZ.collisionPenaltiesAfterMs &&
        nowZ >= restrictedZoneDamageNextMs.current
      ) {
        restrictedZoneDamageNextMs.current =
          nowZ + RESTRICTED_ZONE_DAMAGE_INTERVAL_MS
        stZ.setCondition(
          Math.max(0, stZ.condition - CONDITION_LOSS_RESTRICTED_TICK),
        )
        stZ.triggerBloodImpactFlash('restricted')
      }
    }

    const speed01 = THREE.MathUtils.clamp(speedAbs / MAX_FORWARD, 0, 1)
    const targetBank =
      -steer * speed01 * 0.42 +
      (speedAbs < 0.06 ? Math.sin(enginePhase.current) * 0.012 : 0) +
      surf.roll
    enginePhase.current += dt * 88

    const jp = potholeJolt.current
    potholeJolt.current *= Math.exp(-17 * dt)
    const jb = buildingHitJolt.current
    buildingHitJolt.current *= Math.exp(-20 * dt)

    const braking = brake && speed.current > 0.12
    const accelerating = gas && speed.current >= -0.2
    const targetPitch =
      (braking ? -0.11 : 0) * speed01 +
      (accelerating ? 0.06 * speed01 : 0) +
      surf.pitch

    const smooth = 1 - Math.exp(-12 * dt)
    bankSmoothed.current += (targetBank - bankSmoothed.current) * smooth
    pitchSmoothed.current += (targetPitch - pitchSmoothed.current) * smooth
    yOffSmoothed.current += (surf.yOff - yOffSmoothed.current) * smooth

    const g = visualRef.current
    if (g) {
      const potholeWobble = Math.sin(enginePhase.current * 0.52) * 0.15 * jp
      const buildingWobble = Math.sin(enginePhase.current * 0.88) * 0.24 * jb
      g.rotation.z = bankSmoothed.current + potholeWobble + buildingWobble
      g.rotation.x =
        pitchSmoothed.current +
        jp * (-0.38 - speed01 * 0.16) +
        jb * (0.36 + speed01 * 0.28)
      g.position.y = yOffSmoothed.current - jp * 0.062 - jb * 0.028
    }

    const kmh = Math.round(speedAbs * 3.6)
    if (kmh !== lastReportedKmh.current) {
      lastReportedKmh.current = kmh
      onSpeedKmhChange?.(kmh)
    }

    if (speedAbs > 0.04) {
      const prev = lastFuelPos.current
      lastFuelPos.current = { x: t.x, z: t.z }
      if (prev) {
        const dist = Math.hypot(t.x - prev.x, t.z - prev.z)
        if (dist > 1e-6) {
          const stRide = useGameStore.getState()
          const burn = dist * FUEL_PER_WORLD_METER
          const f = stRide.fuel
          if (f > 0) {
            stRide.setFuel(Math.max(0, f - burn))
          }
          const canGainRideScore =
            speedAbs >= RIDE_SCORE_MIN_SPEED_MS &&
            !brokenDown &&
            !isStunned &&
            drivable &&
            stRide.bikeAwayFromSpawn &&
            nowEmit >= stRide.collisionPenaltiesAfterMs &&
            f > 0
          if (canGainRideScore) {
            rideScoreAcc.current += dist * RIDE_SCORE_POINTS_PER_WORLD_M
            if (rideScoreAcc.current >= 1) {
              const add = Math.floor(rideScoreAcc.current)
              rideScoreAcc.current -= add
              stRide.applyRideScoreDelta(add)
            }
          }
        }
      }
    } else {
      lastFuelPos.current = { x: t.x, z: t.z }
    }
  })

  return (
    <RigidBody
      ref={rb}
      position={SPAWN}
      colliders={false}
      enabledRotations={[false, true, false]}
      enabledTranslations={[true, false, true]}
      gravityScale={0}
      linearDamping={0.22}
      angularDamping={2.5}
      mass={2.8}
      userData={{ kind: 'bike' }}
      ccd
      onCollisionEnter={onBikeCollision}
    >
      <CuboidCollider args={[0.48, 0.36, 1.05]} position={[0, 0.35, 0]} />
      <group ref={visualRef}>
        <BodaBikeModel />
        <RiderHumanoid />
        <PassengerOnBike />
        <RiderJobDestBillboard />
        <spotLight
          position={[0, 0.62, -0.35]}
          angle={0.5}
          penumbra={0.42}
          intensity={2.8}
          distance={38}
          color="#fff4e0"
          castShadow
          shadow-mapSize={[512, 512]}
          shadow-bias={-0.0001}
        />
        {isOffroad ? (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.95, 1.1, 24]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.3} toneMapped={false} />
          </mesh>
        ) : null}
      </group>
      <BikeExhaust rigidBodyRef={rb} speedRef={speed} />
      <BikeDustTrail
        rigidBodyRef={rb}
        speedRef={speed}
        offroadRef={offroadRef}
      />
    </RigidBody>
  )
})
