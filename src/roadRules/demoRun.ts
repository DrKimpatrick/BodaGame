import { pilot } from '../input/driveInput'
import type { Demo } from './lessonDemos'
import { bikeCommand, bikeTelemetry, lessonGate } from './world/telemetry'

/**
 * The demonstration running now, shared between the lesson's screen and the frame loop that rides it (`DemoPilot`).
 * When it ends, the bike goes back exactly where the learner left it. Plain state, like the rest of the telemetry.
 */
export const demoRun = {
  demo: null as Demo | null,
  phase: 0,
  phaseTime: 0,
  seg: 0,
  /** 0–1 through the demonstration, and the caption now. */
  progress: 0,
  caption: '',
  /** A safety net: no demonstration runs for ever. */
  totalTime: 0,
  returnTo: { x: 0, z: 0, yaw: 0 },
  /** Waiting for traffic to clear the start, so she doesn't appear on top of a car. */
  placing: false,
}

export function startDemo(demo: Demo): void {
  demoRun.demo = demo
  demoRun.phase = 0
  demoRun.phaseTime = 0
  demoRun.seg = 0
  demoRun.progress = 0
  demoRun.caption = demo.phases[0]!.caption
  demoRun.totalTime = 0
  demoRun.returnTo = { x: bikeTelemetry.x, z: bikeTelemetry.z, yaw: bikeTelemetry.yaw }
  lessonGate.demo = true
  pilot.on = true
  pilot.forward = pilot.back = pilot.left = pilot.right = false
  demoRun.placing = true
}

export function stopDemo(): void {
  if (!demoRun.demo) return
  demoRun.demo = null
  demoRun.placing = false
  lessonGate.demo = false
  pilot.on = false
  bikeCommand.teleport = demoRun.returnTo
}
