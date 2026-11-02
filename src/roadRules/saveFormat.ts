/**
 * The saved ride: where a player stopped, kept on their own device with no account. Pure and testable. Anything read
 * back is checked field by field, because storage can hold an old version, a half-written value or something edited
 * by hand, and none of that may crash the game or put the bike somewhere impossible.
 */
import { CITY_TOTAL } from '../game/cityGrid.ts'
import type { RRState } from './engine.ts'

export type SaveMode = 'learn' | 'shift' | 'free'

export type SavedStop = { x: number; z: number; roadAxis: 'vertical' | 'horizontal'; sideSign: 1 | -1; name: string }

export type SavedRide = {
  v: 1
  savedAt: number
  mode: SaveMode
  rr: RRState | null
  usedThisShift: string[]
  encountersThisShift: number
  deliveriesThisShift: number
  money: number
  fuel: number
  condition: number
  weather: 'clear' | 'rain' | 'dusk'
  headlight: boolean
  rideJob: { phase: 'pickup' | 'carrying'; pickup: SavedStop; dropoff: SavedStop; payoutUgx: number } | null
  rideJobSerial: number
  rideCompletedDeliveries: number
  bike: { x: number; z: number; yaw: number }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function stop(v: unknown): SavedStop | null {
  const s = v as Partial<SavedStop> | null
  if (!s || !finite(s.x) || !finite(s.z) || typeof s.name !== 'string') return null
  if (s.roadAxis !== 'vertical' && s.roadAxis !== 'horizontal') return null
  if (s.sideSign !== 1 && s.sideSign !== -1) return null
  return { x: s.x, z: s.z, roadAxis: s.roadAxis, sideSign: s.sideSign, name: s.name }
}

function roadRules(v: unknown): RRState | null {
  const r = v as Partial<RRState> | null
  if (!r || (r.difficulty !== 'learner' && r.difficulty !== 'shift')) return null
  if (!finite(r.cash) || !finite(r.life) || !finite(r.shift) || r.shift < 1 || !finite(r.streak)) return null
  if (!Array.isArray(r.kids) || r.kids.length === 0 || !r.ledger || !r.stats || !Array.isArray(r.missed)) return null
  if (r.kids.some((k) => !k || typeof k.name !== 'string' || !finite(k.care))) return null
  return r as RRState
}

/** A checked ride, or null if this can't be trusted. Numbers out of range are brought into range. */
export function parseRide(raw: string | null): SavedRide | null {
  if (!raw) return null
  let d: Partial<SavedRide>
  try {
    d = JSON.parse(raw) as Partial<SavedRide>
  } catch {
    return null
  }
  if (!d || typeof d !== 'object' || d.v !== 1) return null
  if (d.mode !== 'learn' && d.mode !== 'shift' && d.mode !== 'free') return null
  if (!finite(d.savedAt) || !finite(d.money) || !finite(d.fuel) || !finite(d.condition)) return null
  if (!d.bike || !finite(d.bike.x) || !finite(d.bike.z) || !finite(d.bike.yaw)) return null
  const rr = d.mode === 'free' ? null : roadRules(d.rr)
  if (d.mode !== 'free' && !rr) return null
  let job: SavedRide['rideJob'] = null
  if (d.rideJob) {
    const pickup = stop(d.rideJob.pickup)
    const dropoff = stop(d.rideJob.dropoff)
    const phase = d.rideJob.phase
    // A broken job is dropped, not the whole ride: the game hands out a new passenger.
    if (pickup && dropoff && (phase === 'pickup' || phase === 'carrying') && finite(d.rideJob.payoutUgx)) {
      job = { phase, pickup, dropoff, payoutUgx: d.rideJob.payoutUgx }
    }
  }
  const half = CITY_TOTAL / 2
  return {
    v: 1,
    savedAt: d.savedAt,
    mode: d.mode,
    rr,
    usedThisShift: Array.isArray(d.usedThisShift) ? d.usedThisShift.filter((u) => typeof u === 'string') : [],
    encountersThisShift: finite(d.encountersThisShift) ? Math.max(0, d.encountersThisShift) : 0,
    deliveriesThisShift: finite(d.deliveriesThisShift) ? Math.max(0, d.deliveriesThisShift) : 0,
    money: Math.max(0, d.money),
    fuel: clamp(d.fuel, 0, 100),
    condition: clamp(d.condition, 0, 100),
    weather: d.weather === 'rain' || d.weather === 'dusk' ? d.weather : 'clear',
    headlight: d.headlight === true,
    rideJob: job,
    rideJobSerial: finite(d.rideJobSerial) ? d.rideJobSerial : 0,
    rideCompletedDeliveries: finite(d.rideCompletedDeliveries) ? Math.max(0, d.rideCompletedDeliveries) : 0,
    bike: { x: clamp(d.bike.x, -half, half), z: clamp(d.bike.z, -half, half), yaw: d.bike.yaw },
  }
}

/** "just now", "5 minutes ago", "yesterday", "3 days ago". */
export function timeAgo(then: number, now: number): string {
  const min = Math.floor(Math.max(0, now - then) / 60000)
  if (min < 2) return 'just now'
  if (min < 60) return `${min} minutes ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
