/**
 * Roundabout direction rule (pure, testable). Uganda keeps left, so traffic goes round clockwise, which on
 * the game's map (x east, z north) means the angle atan2(dz, dx) around the centre DEcreases.
 */

/** Seconds of sustained anticlockwise riding before it counts as going the wrong way. */
export const WRONG_WAY_SECONDS = 1.0

export type WrongWayInput = {
  /** Accumulated wrong-way time so far (s). */
  timer: number
  /** Angle around the centre last frame and now (radians). */
  prevTh: number
  th: number
  /** Distance from the centre (m), island radius (m), speed (km/h), frame time (s). */
  r: number
  island: number
  kmh: number
  dt: number
}

/** Returns the new timer and whether the rule was just broken (timer resets when it fires). */
export function stepWrongWay({ timer, prevTh, th, r, island, kmh, dt }: WrongWayInput): { timer: number; broken: boolean } {
  if (r <= island + 0.5 || kmh <= 7) return { timer, broken: false }
  let dth = th - prevTh
  dth = Math.atan2(Math.sin(dth), Math.cos(dth))
  let next = timer
  if (dth > 0.004) next += dt
  else if (dth < -0.004) next = Math.max(0, next - dt * 2)
  if (next > WRONG_WAY_SECONDS) return { timer: 0, broken: true }
  return { timer: next, broken: false }
}
