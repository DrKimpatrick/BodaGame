/**
 * How the bike handles. Shared by the bike itself and by the tests that check the demonstration rider can really
 * ride her routes on it.
 */

/** ~68 km/h: a boda can break the 50 limit, so the speed rule means something. */
export const MAX_FORWARD = 19
/** Pulling power at low speed (m/s²); it fades towards top speed. */
export const ACCEL = 8.5
/** Rolling and engine drag when the accelerator is released: a gentle slow-down, not a stop. */
export const COAST_DRAG = 0.8
export const COAST_PER_S = 0.12
/** How quickly the accelerator and brake come in and out (1/s): a key press is a squeeze, not a jolt. */
export const THROTTLE_RESPONSE = 7
export const BRAKE_RESPONSE = 11
export const BRAKE_DECEL = 15
/** Steering: tightest turn rate (rad/s) at low speed, then limited by grip, so fast means wide. */
export const TURN_RATE_MAX = 1.9
export const TURN_GRIP = 15
/** Turning on the spot, walking the bike round, when stopped. */
export const PIVOT_RATE = 0.9
export const STEER_IN = 6
export const STEER_OUT = 10

/** How much the yaw can change per second at this speed. */
export function turnRate(speed: number, grip = TURN_GRIP): number {
  const s = Math.abs(speed)
  return s < 0.25 ? PIVOT_RATE : Math.min(TURN_RATE_MAX, grip / s)
}

/** Acceleration from the engine at this speed, with the accelerator fully open. */
export function drive(speed: number, accel = ACCEL): number {
  const r = Math.max(0, speed) / MAX_FORWARD
  return accel * (1 - 0.8 * r * r)
}

/** How much speed is lost per second when coasting. */
export function coastLoss(speed: number): number {
  return COAST_DRAG + speed * COAST_PER_S
}
