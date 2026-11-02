import { bikeTelemetry, lessonGate } from '../roadRules/world/telemetry'
import { demoRun } from '../roadRules/demoRun'
import { parseRide, type SavedRide, type SaveMode } from '../roadRules/saveFormat'
import { useGameStore } from './useGameStore'
import { useRoadRulesStore } from './useRoadRulesStore'

/**
 * Where each player stopped, one saved ride per way of playing, on this device only (no account). Written every few
 * seconds and whenever the page is hidden or closed, so an abrupt exit, a flat battery or a crash loses very little.
 */

const key = (mode: SaveMode) => `wow-ride-v1-${mode}`
const MODES: SaveMode[] = ['learn', 'shift', 'free']

export function loadRide(mode: SaveMode): SavedRide | null {
  try {
    return parseRide(localStorage.getItem(key(mode)))
  } catch {
    return null
  }
}

/** The ride to offer on the start screen: the most recently played. */
export function latestRide(): SavedRide | null {
  let best: SavedRide | null = null
  for (const m of MODES) {
    const r = loadRide(m)
    if (r && (!best || r.savedAt > best.savedAt)) best = r
  }
  return best
}

export function clearRide(mode: SaveMode): void {
  try {
    localStorage.removeItem(key(mode))
  } catch {
    /* storage blocked: nothing was saved anyway */
  }
}

export function clearAllRides(): void {
  for (const m of MODES) clearRide(m)
}

/** Saves the ride in progress. Skipped while a card or result is up, so a decision can't be escaped by leaving. */
export function saveRide(): void {
  const r = useRoadRulesStore.getState()
  if (r.overlay) return
  const g = useGameStore.getState()
  // Mid-demonstration the bike is Mama Sarah's: the learner's own place is where it goes back to.
  const pos = lessonGate.demo ? demoRun.returnTo : bikeTelemetry
  const ride: SavedRide = {
    v: 1,
    savedAt: Date.now(),
    mode: r.mode,
    rr: r.rr,
    usedThisShift: r.usedThisShift,
    encountersThisShift: r.encountersThisShift,
    deliveriesThisShift: r.deliveriesThisShift,
    money: g.money,
    fuel: g.fuel,
    condition: g.condition,
    weather: g.weather,
    headlight: g.headlight,
    rideJob: g.rideJob,
    rideJobSerial: g.rideJobSerial,
    rideCompletedDeliveries: g.rideCompletedDeliveries,
    bike: { x: pos.x, z: pos.z, yaw: pos.yaw },
  }
  try {
    localStorage.setItem(key(r.mode), JSON.stringify(ride))
  } catch {
    /* storage full or blocked: the game goes on, just without a save */
  }
}
