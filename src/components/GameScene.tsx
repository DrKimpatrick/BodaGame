import type { RapierRigidBody } from '@react-three/rapier'
import { Physics } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { isBikeBrokenDown, isTankEmpty, useGameStore } from '../store/useGameStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { Boda } from './Boda'
import { CityMap } from './CityMap'
import { CityMapErrorBoundary } from './CityMapErrorBoundary'
import { Pedestrians } from './Pedestrians'
import { RoadTraffic } from './RoadTraffic'
import { HorizonSky } from './HorizonSky'
import { getSunDirection } from './sky'
import { ThirdPersonCamera } from './ThirdPersonCamera'
import { JobRouteGuide } from './JobRouteGuide'
import { JobTargetPin } from './JobTargetPin'
import { JobWaitingPassenger } from './JobWaitingPassenger'
import { JobParkingBays } from './JobParkingBays'
import { Rain } from './roadRules/Rain'
import { RoadRulesMonitor } from './roadRules/RoadRulesMonitor'
import { VIEW_SCALE } from './viewScale'
import { bikeTelemetry } from '../roadRules/world/telemetry'
import { VehicleShowroom } from './realism/Vehicles'
import { KampalaHills } from './realism/Hills'
import { StreetLights } from './realism/StreetLife'

const SHOWROOM = import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('showroom')

/** Light, fog and sky per shift condition. */
const ATMOSPHERE = {
  clear: { ambient: 0.42, sun: 1.15, sunColor: '#fff4e2', fog: '#b4c4d1', near: 90, far: 560, bg: '#9fb5c6' },
  rain: { ambient: 0.34, sun: 0.38, sunColor: '#cfd8e3', fog: '#7a848f', near: 18, far: 260, bg: '#6c7580' },
  dusk: { ambient: 0.16, sun: 0.42, sunColor: '#ff9d5c', fog: '#4a4255', near: 40, far: 460, bg: '#2f2b3d' },
} as const

const SHADOW_MAP = { low: 0, medium: 1024, high: 2048 } as const

/**
 * Sun whose shadow box follows the rider (the city is ~650 m across; one fixed shadow map over all of it
 * would be blurry). Snapped to whole metres so shadows don't shimmer as she moves.
 */
function SunLight({
  shadowSize,
  intensity,
  color,
  direction,
}: {
  shadowSize: number
  intensity: number
  color: string
  direction: THREE.Vector3
}) {
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const frame = useRef(0)
  useFrame(() => {
    const l = light.current
    if (!l) return
    // Redrawing every caster is the largest single render cost; every second frame looks the same in motion.
    l.shadow.autoUpdate = false
    l.shadow.needsUpdate = ++frame.current % 2 === 0
    const x = Math.round(bikeTelemetry.x)
    const z = Math.round(bikeTelemetry.z)
    target.position.set(x, 0, z)
    l.position.set(x + direction.x * 120, direction.y * 120, z + direction.z * 120)
    target.updateMatrixWorld()
  })
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        castShadow={shadowSize > 0}
        intensity={intensity}
        color={color}
        shadow-mapSize={[shadowSize || 512, shadowSize || 512]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-near={1}
        shadow-camera-far={260}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
      />
    </>
  )
}

export function GameScene() {
  const bodaRef = useRef<RapierRigidBody>(null)
  const setSpeedKmh = useGameStore((s) => s.setSpeedKmh)
  // Booleans, not the raw values: fuel changes every frame while riding, and re-rendering here reconciles the whole city.
  const physicsPaused = useGameStore((s) => isBikeBrokenDown(s.condition) || s.hudModalFreezesWorld || isTankEmpty(s.fuel))
  const weather = useGameStore((s) => s.weather)
  const quality = useSettingsStore((s) => s.quality)
  const [offroad, setOffroad] = useState(false)
  // Phones see less far: fog (and with it the city culling distance) closes in on lower settings.
  const atm0 = ATMOSPHERE[weather]
  const atm = { ...atm0, far: atm0.far * VIEW_SCALE[quality], near: atm0.near * VIEW_SCALE[quality] }
  const shadowSize = SHADOW_MAP[quality]

  const sunDir = useMemo(() => getSunDirection(new THREE.Vector3(), weather), [weather])

  return (
    <>
      <HorizonSky weather={weather} quality={quality} />

      <color attach="background" args={[atm.bg]} />
      <fog attach="fog" args={[atm.fog, atm.near, atm.far]} />

      <ambientLight intensity={atm.ambient} />
      <hemisphereLight args={['#cfe3ff', '#5a4632', weather === 'dusk' ? 0.12 : 0.28]} />
      <SunLight key={shadowSize} shadowSize={shadowSize} intensity={atm.sun} color={atm.sunColor} direction={sunDir} />
      {weather === 'rain' ? <Rain count={quality === 'low' ? 450 : 1100} /> : null}

      {/*
        One physics step per rendered frame, before every other frame callback: the bike, the camera and the
        traffic then all read positions from the same instant, so nothing judders against anything else.
      */}
      <Physics
        gravity={[0, -16, 0]}
        timeStep="vary"
        updatePriority={-50}
        paused={physicsPaused}
      >
        <CityMapErrorBoundary>
          <CityMap />
        </CityMapErrorBoundary>
        <Boda
          ref={bodaRef}
          onSpeedKmhChange={setSpeedKmh}
          onOffroadChange={setOffroad}
        />
        <JobRouteGuide rigidBodyRef={bodaRef} />
        <RoadTraffic />
        <Pedestrians />
        <ThirdPersonCamera rigidBodyRef={bodaRef} roughRide={offroad} />
      </Physics>
      <RoadRulesMonitor />
      <KampalaHills weather={weather} />
      <StreetLights />
      {SHOWROOM ? <VehicleShowroom x={0} z={0} /> : null}
      <JobTargetPin />
      <JobWaitingPassenger />
      <JobParkingBays />
    </>
  )
}
