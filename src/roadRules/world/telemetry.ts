/**
 * Per-frame shared state between the bike, traffic, signals and the rule monitor. Plain mutable objects,
 * deliberately outside React and zustand: they change every frame and nothing should re-render on them.
 */

/** Set once the static city has been built and batched (the loading screen waits for it). */
export const sceneStatus = { cityBuilt: false }

/** World clock in seconds; only advances while the 3D world is running (pauses with modals). */
export const worldClock = { t: 0 }

export const bikeTelemetry = {
  x: 0,
  z: 0,
  /** Yaw in radians; forward is (−sin yaw, −cos yaw). */
  yaw: 0,
  /** Forward speed (m/s). A boda has no reverse, so it is never negative. */
  speed: 0,
  /** Headlight switched on. */
  headlight: false,
  /** Speed limit where the bike is now (km/h), set by the rule monitor for the HUD. */
  limitKmh: 50,
}

export function bikeKmh(): number {
  return Math.abs(bikeTelemetry.speed) * 3.6
}

/** Traffic positions + velocities, written by RoadTraffic each frame. */
export const trafficTelemetry = {
  count: 0,
  x: new Float32Array(128),
  z: new Float32Array(128),
  vx: new Float32Array(128),
  vz: new Float32Array(128),
  /** Heading; +Z rotated by this about Y, so forward is (sin yaw, cos yaw). */
  yaw: new Float32Array(128),
}

export type CollisionKind = 'pedestrian' | 'vehicle' | 'building'

type CollisionListener = (kind: CollisionKind) => void

/*
 * Event hubs are keyed by owner: registering the same owner again replaces its listener. Effects inside the
 * Canvas can run twice in development, and a plain Set would then deliver every event twice.
 */
const collisionListeners = new Map<string, CollisionListener>()

export function onBikeCollision(owner: string, fn: CollisionListener): () => void {
  collisionListeners.set(owner, fn)
  return () => {
    if (collisionListeners.get(owner) === fn) collisionListeners.delete(owner)
  }
}

const strikeListeners = new Map<string, () => void>()

/** A pedestrian was struck by the bike (detected by the crowd, which has no physics bodies). */
export function onPedestrianStrike(owner: string, fn: () => void): () => void {
  strikeListeners.set(owner, fn)
  return () => {
    if (strikeListeners.get(owner) === fn) strikeListeners.delete(owner)
  }
}

export function emitPedestrianStrike(): void {
  for (const fn of strikeListeners.values()) fn()
}

export function emitBikeCollision(kind: CollisionKind): void {
  for (const fn of collisionListeners.values()) fn(kind)
}

/** Last rule-monitor readings (for the dev test hook and debugging). */
export const monitorDebug = { heading: '', strip: -1, limit: 50, overTimer: 0, junction: '', distToLine: 0, wrongWay: 0, onRoundabout: false, kmh: 0 }

/** Listener counts (dev test hook: each should be 1 while a ride is running). */
export function listenerCounts() {
  return { collision: collisionListeners.size, strike: strikeListeners.size }
}
