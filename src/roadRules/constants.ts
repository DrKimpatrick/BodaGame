/**
 * Road Rules game constants. Values come from the prototype v1 handoff; fines and jail terms are game
 * values, not real penalties (the start screen says so).
 */

/** Household cost due at the end of each shift (UGX). */
export const BILL = 20_000
/** Per jail day, a neighbour feeds the children if the rider has savings (UGX). */
export const JAIL_MEAL = 3_000
/** Road encounter cards per shift (at most). */
export const ENCOUNTERS_PER_SHIFT = 6
/** Passenger drop-offs that make one shift. */
export const DELIVERIES_PER_SHIFT = 3
/** Decision timer for encounter cards (seconds). */
export const DECISION_TIME_S = 12
/** Life recovered at the end of a shift. */
export const REST_LIFE = 15
/** Life gained for a right move (capped at {@link LIFE_MAX}). */
export const RIGHT_MOVE_LIFE = 6
export const LIFE_MAX = 100
export const CARE_MAX = 100
export const START_CASH = 20_000
export const START_LIFE = 100
export const START_CARE = 70
/** Streak at which fares get the bonus multiplier. */
export const STREAK_BONUS_AT = 3
export const STREAK_MULTIPLIER = 1.5
/** Care lost per jail day when the neighbour can be paid / cannot be paid. */
export const JAIL_CARE_FED = 3
export const JAIL_CARE_HUNGRY = 7
/** Default reward for a right card choice (UGX). */
export const DEFAULT_REWARD = 5_000
/** Small bonus for a correct live move (clean stop at a red light, STOP sign, etc.). */
export const GOOD_MOVE_BONUS = 500
export const GOOD_MOVE_LIFE = 1

/** Town speed limit (km/h) and school zone limit. */
export const SPEED_LIMIT_TOWN = 50
export const SPEED_LIMIT_SCHOOL = 30
/** Max safe speed over a zebra crossing (km/h). */
export const ZEBRA_MAX_KMH = 20
/** A STOP counts as a stop under this speed (km/h). */
export const STOP_MAX_KMH = 4

export const KID_NAMES = ['Atim', 'Mukisa'] as const

/** Realistic Kampala boda fare for a trip of `meters` (game distance), rounded to UGX 500. */
export function realisticFare(meters: number, salt: number): number {
  const raw = 2_000 + (meters / 100) * 900 + salt * 1_000
  const rounded = Math.round(raw / 500) * 500
  return Math.max(2_000, Math.min(10_000, rounded))
}
