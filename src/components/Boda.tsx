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
  useGameStore,
} from '../store/useGameStore'
import { BikeDustTrail } from './BikeDustTrail'
import { BikeExhaust } from './BikeExhaust'
import { bikeTelemetry, emitBikeCollision, onPedestrianStrike } from '../roadRules/world/telemetry'
import { useSettingsStore } from '../store/useSettingsStore'
import { BodaModel } from './BodaModel'
import { PassengerModel, RiderModel } from './RiderModel'
import {
  getPotholeStrikeEnvelope,
  sampleRoadSurfaceBikeEffect,
} from '@game/roadSurfaceFeatures'
import { isDeepOffRoad, isDrivableSurface, roadKindAt } from '@game/roadSpatial'

/** ~68 km/h: a boda can break the 50 limit, so the speed rule means something. */
const MAX_FORWARD = 19
/** Murram shoulder / pavement edge: drivable but slow (~32 km/h). */
const SHOULDER_SPEED_CAP = 9
/** Unpaved murram: rutted and dusty, ~43 km/h at most. */
const MURRAM_SPEED_CAP = 12
const MAX_REVERSE = 10
const ACCEL = 28
/** Extra oomph when building reverse from standstill (S while stopped). */
const REVERSE_ACCEL_SCALE = 1.4
const FRICTION = 6.5
const TURN_SPEED = 2.4
const BRAKE_DECEL = 42
/** Grass / dirt off the network: slow and draggy, like a real bike on rough ground. */
const OFFROAD_DRAG_PER_S = 1.25
const OFFROAD_ACCEL_SCALE = 0.55
const OFFROAD_SPEED_CAP = 6
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

/** Left lane just short of the centre junction, facing −Z (heading S keeps left at −X). */
/** Entebbe Rd kerb lane (heading S, keep left), just south of the Kampala Rd junction. */
const SPAWN: [number, number, number] = [-4.0, 0.32, 12]

function assignForwardedRef<T>(
  ref: ForwardedRef<T> | undefined,
  value: T | null,
) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}


/** Pillion passenger — visible while the job phase is `carrying`. */
function PassengerOnBike() {
  const phase = useGameStore((s) => s.rideJob?.phase)
  return phase === 'carrying' ? <PassengerModel /> : null
}

function RiderOnBike() {
  const helmetCam = useSettingsStore((s) => s.camera === 'helmet')
  return <RiderModel hideHead={helmetCam} />
}

/**
 * Headlight: a forward spot (aimed at a child target; the old light pointed at the world origin) plus a
 * glowing lens. Off by default; the rule monitor checks it on dusk shifts.
 */
function BikeHeadlight() {
  const on = useGameStore((s) => s.headlight)
  const quality = useSettingsStore((s) => s.quality)
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(0, 0.1, -9)
    return o
  }, [])
  useEffect(() => {
    bikeTelemetry.headlight = on
  }, [on])
  return (
    <group>
      <mesh position={[0, 0.55, -0.63]}>
        <circleGeometry args={[0.085, 16]} />
        <meshBasicMaterial color={on ? '#fff6dc' : '#3b3524'} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <primitive object={target} />
      {on ? (
        <spotLight
          position={[0, 0.55, -0.66]}
          target={target}
          angle={0.55}
          penumbra={0.5}
          intensity={9}
          decay={1.4}
          distance={34}
          color="#fff1d6"
          castShadow={quality === 'high'}
          shadow-mapSize={[512, 512]}
          shadow-bias={-0.0002}
        />
      ) : null}
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
        emitBikeCollision('vehicle')
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
        emitBikeCollision('building')
        return
      }
    },
    [],
  )

  // Pedestrians are instanced (no physics bodies); the crowd reports strikes by distance.
  useEffect(
    () =>
      onPedestrianStrike('bike', () => {
        const now = performance.now()
        if (now < noPedestrianStunUntil.current) return
        noPedestrianStunUntil.current = now + 700
        speed.current *= 0.38
        stunnedUntil.current = now + PEDESTRIAN_STUN_MS
        const st = useGameStore.getState()
        st.setCondition(Math.max(0, st.condition - CONDITION_LOSS_PEDESTRIAN))
        st.triggerBloodImpactFlash('pedestrian')
        st.applyRideScoreDelta(-RIDE_SCORE_LOSS_PEDESTRIAN)
        emitBikeCollision('pedestrian')
      }),
    [],
  )

  // Dev-only: teleport the bike (for testing rules at a given spot), e.g. __wowTeleport(0, -205, Math.PI).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const fn = (x: number, z: number, yawRad: number) => {
      const body = rb.current
      if (!body) return
      body.setTranslation({ x, y: SPAWN[1], z }, true)
      yaw.current = yawRad
    }
    Object.assign(window, { __wowTeleport: fn })
  }, [])

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
    // Wet tarmac: weaker brakes and a little less drive (rain shifts).
    const wet = useGameStore.getState().weather === 'rain'
    const grip = wet ? 0.58 : 1

    if (drivable) {
      if (fuelLeft > 0 && !brokenDown) {
        stepGasBrakeCoastSpeed({
          dt,
          speedRef: speed,
          gas,
          brake,
          accel: ACCEL * (wet ? 0.85 : 1),
          brakeDecel: BRAKE_DECEL * grip,
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

    const surfaceKind = drivable ? roadKindAt(t.x, t.z) : null
    const capFwd = !drivable
      ? OFFROAD_SPEED_CAP
      : surfaceKind === 'murram'
        ? MURRAM_SPEED_CAP
        : surfaceKind
          ? MAX_FORWARD
          : SHOULDER_SPEED_CAP
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

    bikeTelemetry.x = t.x
    bikeTelemetry.z = t.z
    bikeTelemetry.yaw = yaw.current
    bikeTelemetry.speed = speed.current

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
          const burn = dist * FUEL_PER_WORLD_METER * stRide.fuelBurnScale
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
        {/* Physics origin is 0.31 m up (wheel centre); the model is built from the ground. */}
        <group position={[0, -0.31, 0]}>
          <BodaModel />
          <group position={[0, 0.21, 0]}>
            <RiderOnBike />
            <PassengerOnBike />
          </group>
        </group>
        <BikeHeadlight />
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
