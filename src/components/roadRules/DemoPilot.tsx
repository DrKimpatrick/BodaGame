import { useFrame } from '@react-three/fiber'
import { pilot } from '../../input/driveInput'
import { demoRun, stopDemo } from '../../roadRules/demoRun'
import { followPath, pedals, type DemoState } from '../../roadRules/lessonDemos'
import { bikeCommand, bikeTelemetry, trafficTelemetry, worldClock } from '../../roadRules/world/telemetry'

/** No demonstration should take longer than this, whatever the traffic does. */
const MAX_DEMO_S = 60
/** How close a vehicle ahead makes her wait, as any careful rider would. */
const WAIT_BEHIND_M = 7
/** How clear of traffic the start of a demonstration should be. */
const CLEAR_START_M = 9

const state: DemoState = { along: 0, speed: 0, kmh: 0, t: 0, worldT: 0 }

function vehicleJustAhead(): boolean {
  const b = bikeTelemetry
  const fx = -Math.sin(b.yaw)
  const fz = -Math.cos(b.yaw)
  const t = trafficTelemetry
  for (let i = 0; i < t.count; i++) {
    const dx = t.x[i]! - b.x
    const dz = t.z[i]! - b.z
    const ahead = dx * fx + dz * fz
    if (ahead > 0 && ahead < WAIT_BEHIND_M && Math.abs(dx * fz - dz * fx) < 2) return true
  }
  return false
}

function vehicleNear(x: number, z: number): boolean {
  const t = trafficTelemetry
  for (let i = 0; i < t.count; i++) {
    const dx = t.x[i]! - x
    const dz = t.z[i]! - z
    if (dx * dx + dz * dz < CLEAR_START_M * CLEAR_START_M) return true
  }
  return false
}

/** Rides the current demonstration by pressing the same controls a player would. Does nothing the rest of the time. */
export function DemoPilot() {
  useFrame((_, delta) => {
    const run = demoRun
    const demo = run.demo
    if (!demo || bikeCommand.teleport) return
    const dt = Math.min(delta, 0.05)
    run.totalTime += dt
    if (run.placing) {
      // Normally a moment at most; after a couple of seconds, start anyway rather than keep the learner waiting.
      if (!vehicleNear(demo.start.x, demo.start.z) || run.totalTime > 2) {
        run.placing = false
        bikeCommand.teleport = demo.start
      }
      return
    }
    const b = bikeTelemetry
    const speed = Math.max(0, b.speed)
    const follow = followPath(demo.path, b.x, b.z, b.yaw, speed, run.seg)
    run.seg = follow.seg
    state.along = follow.along
    state.speed = speed
    state.kmh = speed * 3.6
    state.t = run.phaseTime
    state.worldT = worldClock.t
    const phase = demo.phases[run.phase]
    if (!phase || run.totalTime > MAX_DEMO_S) {
      stopDemo()
      return
    }
    if (phase.until(state)) {
      run.phase++
      run.phaseTime = 0
      run.progress = run.phase / demo.phases.length
      const nextPhase = demo.phases[run.phase]
      if (nextPhase) run.caption = nextPhase.caption
      return
    }
    run.phaseTime += dt
    const way = typeof phase.drive === 'function' ? phase.drive(state) : phase.drive
    const cmd = vehicleJustAhead() ? pedals('brake', speed) : pedals(way, speed)
    pilot.forward = cmd.gas
    pilot.back = cmd.brake
    pilot.left = speed > 0.3 && follow.steer > 0
    pilot.right = speed > 0.3 && follow.steer < 0
  })
  return null
}
