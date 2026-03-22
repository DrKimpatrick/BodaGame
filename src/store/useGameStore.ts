import { create } from 'zustand'
import { playBloodImpactFeedback } from '../audio/bloodImpactFeedback'
import {
  generateRideJob,
  type RideJob,
  type RideManhattanOrder,
} from '../game/passengerJobs'

/** Ignore bike↔ped / bike↔car collision penalties until this `performance.now()` (spawn overlap). */
export const COLLISION_GRACE_MS = 2200

/** Bike spawn XZ (matches `Boda`); used to defer ped knock / condition until you leave the intersection. */
export const BIKE_SPAWN_XZ = { x: 0, z: 0 } as const
/** Min horizontal distance from spawn before bike↔pedestrian knock & condition loss can apply. */
export const BIKE_SPAWN_PED_CLEAR_M = 2.85

/** Tank capacity in abstract units (0–FUEL_MAX, shown as % in UI). */
export const FUEL_MAX = 100

/** Starting wallet (Ugandan shillings). */
export const STARTING_MONEY_UGX = 100_000

/**
 * Cost to add 1 tank point. Full refill from empty = FUEL_MAX * UGX_PER_FUEL_UNIT.
 */
export const UGX_PER_FUEL_UNIT = 500

/** Bike condition ceiling (same scale as UI %). */
export const CONDITION_MAX = 100

/** Soft HUD warning + light vignette. */
export const CONDITION_WARN_AT = 30
/** “Go to garage” messaging + edge warning cues. */
export const CONDITION_GARAGE_WARNING_AT = 20
/** Severe visuals; bike can still roll until {@link CONDITION_BROKEN_AT}. */
export const CONDITION_TERRIBLE_AT = 10
/**
 * Breakdown: no drive input, 3D world pauses (`Canvas` demand loop), repair modal required.
 * (If a brief says “pause at 50%”, that maps here as the single hard lock — we use 5%.)
 */
export const CONDITION_BROKEN_AT = 5

/**
 * Cost to restore 1 condition point. Full repair from 0 = CONDITION_MAX * UGX_PER_CONDITION_UNIT.
 * Kept lower than fuel unit so repairs sting less than filling the tank.
 */
export const UGX_PER_CONDITION_UNIT = 280

/**
 * Tank fuel points consumed per world unit (XZ) travelled while moving.
 * Must match consumption in Boda physics.
 */
export const FUEL_PER_WORLD_METER = 0.128

const LEDGER_CAP = 200

/** Set in sessionStorage when run is no longer “factory fresh” (warn on reload / show notice after wipe). */
export const SESSION_STORAGE_PROGRESS_KEY = 'boda-session-active'

export type WalletTransaction = {
  id: string
  at: number
  kind: 'earn' | 'spend'
  amountUgx: number
  label: string
}

/**
 * Bike hit a walker vs got struck by traffic vs illegal / rough off-network riding —
 * drives HUD blood splatter intensity.
 */
export type BloodImpactKind = 'pedestrian' | 'vehicle' | 'restricted'

function nextId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Approximate world distance (m) you can cover with `fuelPoints` at current burn rate. */
export function approxMetersForFuelPoints(fuelPoints: number): number {
  if (fuelPoints <= 0 || FUEL_PER_WORLD_METER <= 0) return 0
  return fuelPoints / FUEL_PER_WORLD_METER
}

export function formatDistanceShort(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '0 m'
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${Math.round(meters)} m`
}

/** Clamp tank reading and limit float noise (world units, purchases). */
export function normalizeTankFuel(fuel: number): number {
  const v = Math.max(0, Math.min(FUEL_MAX, fuel))
  return Math.round(v * 10_000) / 10_000
}

export function normalizeCondition(c: number): number {
  const v = Math.max(0, Math.min(CONDITION_MAX, c))
  return Math.round(v * 10_000) / 10_000
}

export function isBikeBrokenDown(condition: number): boolean {
  return normalizeCondition(condition) <= CONDITION_BROKEN_AT
}

/**
 * Smallest whole UGX spend that adds enough condition to leave breakdown ({@link CONDITION_BROKEN_AT}).
 * 0 if already above the threshold.
 */
export function minUgxToClearBikeBreakdown(condition: number): number {
  const c = normalizeCondition(condition)
  if (c > CONDITION_BROKEN_AT) return 0
  const gap = CONDITION_BROKEN_AT - c
  return Math.max(1, Math.floor(gap * UGX_PER_CONDITION_UNIT) + 1)
}

export type FinancialGameOverResult =
  | { over: false }
  | {
      over: true
      reason: 'breakdown_no_cash' | 'stranded_no_fuel'
      needUgx: number
      shortfallUgx: number
    }

/**
 * True when the run is unwinnable with current wallet: cannot afford the minimum repair to ride again,
 * or (if not broken down) empty tank and cannot afford even one fuel unit while the tank has room.
 */
export function evaluateFinancialGameOver(
  s: Pick<GameState, 'money' | 'fuel' | 'condition'>,
): FinancialGameOverResult {
  const wallet = moneyInt(s.money)
  const minRepair = minUgxToClearBikeBreakdown(s.condition)
  if (minRepair > 0 && wallet < minRepair) {
    return {
      over: true,
      reason: 'breakdown_no_cash',
      needUgx: minRepair,
      shortfallUgx: minRepair - wallet,
    }
  }
  if (!isBikeBrokenDown(s.condition)) {
    const f = normalizeTankFuel(s.fuel)
    const roomForFuel = maxUgxToFillRemaining(s.fuel)
    if (
      f <= 1e-4 &&
      roomForFuel >= UGX_PER_FUEL_UNIT &&
      wallet < UGX_PER_FUEL_UNIT
    ) {
      return {
        over: true,
        reason: 'stranded_no_fuel',
        needUgx: UGX_PER_FUEL_UNIT,
        shortfallUgx: UGX_PER_FUEL_UNIT - wallet,
      }
    }
  }
  return { over: false }
}

function moneyInt(m: number): number {
  return Math.max(0, Math.floor(Number.isFinite(m) ? m : 0))
}

/**
 * Max whole UGX you can spend on fuel without exceeding tank capacity.
 * 1 UGX = 1/UGX_PER_FUEL_UNIT of a tank point; tank tops out at FUEL_MAX.
 */
export function maxUgxToFillRemaining(fuel: number): number {
  const f = normalizeTankFuel(fuel)
  const remaining = Math.max(0, FUEL_MAX - f)
  return Math.floor(remaining * UGX_PER_FUEL_UNIT + Number.EPSILON)
}

export type FuelPurchasePreview = {
  spendUgx: number
  fuelAdd: number
  approxMeters: number
  balanceAfter: number
}

/** How a fuel purchase would settle (before mutating state). All UGX are whole numbers. */
export function previewFuelPurchase(
  requestedUgx: number,
  money: number,
  currentFuel: number,
): FuelPurchasePreview {
  const req = Math.max(0, Math.floor(requestedUgx))
  const wallet = moneyInt(money)
  const maxSpend = maxUgxToFillRemaining(currentFuel)
  if (maxSpend <= 0 || req <= 0) {
    return {
      spendUgx: 0,
      fuelAdd: 0,
      approxMeters: 0,
      balanceAfter: wallet,
    }
  }
  const spend = Math.min(req, wallet, maxSpend)
  const fuelAdd = spend / UGX_PER_FUEL_UNIT
  return {
    spendUgx: spend,
    fuelAdd,
    approxMeters: approxMetersForFuelPoints(fuelAdd),
    balanceAfter: wallet - spend,
  }
}

/**
 * Max whole UGX you can spend on repairs without exceeding CONDITION_MAX.
 */
export function maxUgxToRepairRemaining(condition: number): number {
  const c = normalizeCondition(condition)
  const remaining = Math.max(0, CONDITION_MAX - c)
  return Math.floor(remaining * UGX_PER_CONDITION_UNIT + Number.EPSILON)
}

export type RepairPurchasePreview = {
  spendUgx: number
  conditionAdd: number
  balanceAfter: number
}

export function previewRepairPurchase(
  requestedUgx: number,
  money: number,
  currentCondition: number,
): RepairPurchasePreview {
  const req = Math.max(0, Math.floor(requestedUgx))
  const wallet = moneyInt(money)
  const maxSpend = maxUgxToRepairRemaining(currentCondition)
  if (maxSpend <= 0 || req <= 0) {
    return {
      spendUgx: 0,
      conditionAdd: 0,
      balanceAfter: wallet,
    }
  }
  const spend = Math.min(req, wallet, maxSpend)
  const conditionAdd = spend / UGX_PER_CONDITION_UNIT
  return {
    spendUgx: spend,
    conditionAdd,
    balanceAfter: wallet - spend,
  }
}

export type GameState = {
  money: number
  fuel: number
  condition: number
  /** Display speed (KM/H), updated from physics — keep updates throttled in Boda. */
  speedKmh: number
  ledger: WalletTransaction[]
  /**
   * Collisions before this `performance.now()` do not apply stun / condition loss / pedestrian knock
   * (avoids penalties from initial overlap before React effects run). Vehicle strikes use the same grace.
   */
  collisionPenaltiesAfterMs: number
  /**
   * After grace, still ignore bike↔ped knock & condition until the bike leaves spawn (zebra overlap).
   */
  bikeAwayFromSpawn: boolean
  /**
   * Full reset to defaults. Call from `main` before render and from `App` in `useLayoutEffect`
   * so physics frames cannot drain condition before reset runs.
   */
  resetSession: () => void
  setMoney: (money: number) => void
  setFuel: (fuel: number) => void
  setCondition: (condition: number) => void
  setSpeedKmh: (speedKmh: number) => void
  /** Add money and record a ledger credit (rides, jobs, etc.). */
  earnUgx: (amountUgx: number, label: string) => void
  /** Deduct money with a ledger spend (use for non-fuel purchases later). */
  spendUgx: (amountUgx: number, label: string) => boolean
  /** Spend up to `ugx` to add fuel; only charges for fuel that fits in the tank. */
  buyFuel: (ugx: number) => void
  /** Spend up to `ugx` to restore condition; only charges for points that fit below CONDITION_MAX. */
  buyRepair: (ugx: number) => void
  /** HUD-only red flash (ped knock vs car strike). */
  bloodImpactNonce: number
  bloodImpactKind: BloodImpactKind | null
  triggerBloodImpactFlash: (kind: BloodImpactKind) => void
  /** Passenger job (pick up → drop off → pay). */
  rideJob: RideJob | null
  rideJobSerial: number
  /**
   * Current L-route elbow axis (synced from {@link JobRouteGuide}) so HUD minimap matches the 3D line.
   */
  rideJobRouteOrder: RideManhattanOrder
  /** Throttled bike XZ for HUD minimap / navigation. */
  bikeMapX: number
  bikeMapZ: number
  setBikeMapCoords: (x: number, z: number) => void
  assignRideJob: () => void
  completeRidePickup: () => void
  completeRideDropoff: () => void
  /** Bumped when pickup completes — HUD shows “you reached your passenger”. */
  ridePickupToastNonce: number
  ridePickupToastDestination: string
  /** Bumped after drop-off when the next job is assigned. */
  rideNextPassengerToastNonce: number
  rideNextPassengerPickupName: string
  rideNextPassengerPayoutUgx: number
  /** Successful passenger drop-offs (pickup → drop-off) in this session. */
  rideCompletedDeliveries: number
  /** Bumped when a rider tier milestone is hit (2 / 5 / 10 deliveries). */
  riderLevelUpToastNonce: number
  /** Last milestone level for the toast (2, 3, or 4). */
  riderLevelUpToastLevel: number
}

/** Bike–ped knockdown + condition loss (vehicle hits do not use spawn clearance). */
export function shouldApplyBikePedestrianInteraction(): boolean {
  const s = useGameStore.getState()
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  if (now < s.collisionPenaltiesAfterMs) return false
  return s.bikeAwayFromSpawn
}

/** True while wallet / tank / condition / ledger match a brand-new session (ignores speed / grace fields). */
export function isProgressPristine(s: GameState): boolean {
  return (
    moneyInt(s.money) === STARTING_MONEY_UGX &&
    normalizeTankFuel(s.fuel) >= FUEL_MAX - 0.02 &&
    normalizeCondition(s.condition) >= CONDITION_MAX - 0.02 &&
    s.ledger.length === 0 &&
    s.rideCompletedDeliveries === 0
  )
}

function appendLedger(
  ledger: WalletTransaction[],
  entry: Omit<WalletTransaction, 'id' | 'at'>,
): WalletTransaction[] {
  const row: WalletTransaction = {
    id: nextId(),
    at: Date.now(),
    ...entry,
  }
  return [row, ...ledger].slice(0, LEDGER_CAP)
}

function nextCollisionPenaltyDeadline(): number {
  return typeof performance !== 'undefined' ? performance.now() + COLLISION_GRACE_MS : 0
}

const initialSession = (): Pick<
  GameState,
  | 'money'
  | 'fuel'
  | 'condition'
  | 'speedKmh'
  | 'ledger'
  | 'collisionPenaltiesAfterMs'
  | 'bikeAwayFromSpawn'
  | 'bloodImpactNonce'
  | 'bloodImpactKind'
  | 'rideJob'
  | 'rideJobSerial'
  | 'rideJobRouteOrder'
  | 'bikeMapX'
  | 'bikeMapZ'
  | 'ridePickupToastNonce'
  | 'ridePickupToastDestination'
  | 'rideNextPassengerToastNonce'
  | 'rideNextPassengerPickupName'
  | 'rideNextPassengerPayoutUgx'
  | 'rideCompletedDeliveries'
  | 'riderLevelUpToastNonce'
  | 'riderLevelUpToastLevel'
> => ({
  money: STARTING_MONEY_UGX,
  fuel: FUEL_MAX,
  condition: 100,
  speedKmh: 0,
  ledger: [],
  /** Until `resetSession()` runs from `main`, ignore collisions (import order / first physics tick). */
  collisionPenaltiesAfterMs: Number.POSITIVE_INFINITY,
  bikeAwayFromSpawn: false,
  bloodImpactNonce: 0,
  bloodImpactKind: null,
  rideJob: null,
  rideJobSerial: 0,
  rideJobRouteOrder: 'xFirst',
  bikeMapX: 0,
  bikeMapZ: 0,
  ridePickupToastNonce: 0,
  ridePickupToastDestination: '',
  rideNextPassengerToastNonce: 0,
  rideNextPassengerPickupName: '',
  rideNextPassengerPayoutUgx: 0,
  rideCompletedDeliveries: 0,
  riderLevelUpToastNonce: 0,
  riderLevelUpToastLevel: 0,
})

export const useGameStore = create<GameState>((set, get) => ({
  ...initialSession(),
  resetSession: () => {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_PROGRESS_KEY)
    } catch {
      /* */
    }
    set({
      ...initialSession(),
      collisionPenaltiesAfterMs: nextCollisionPenaltyDeadline(),
    })
    get().assignRideJob()
  },
  setMoney: (money) => set({ money: moneyInt(money) }),
  setFuel: (fuel) => set({ fuel: normalizeTankFuel(fuel) }),
  setCondition: (condition) => set({ condition: normalizeCondition(condition) }),
  setSpeedKmh: (speedKmh) => set({ speedKmh }),
  earnUgx: (amountUgx, label) => {
    const n = Math.max(0, Math.floor(amountUgx))
    if (n <= 0) return
    const state = get()
    set({
      money: moneyInt(state.money + n),
      ledger: appendLedger(state.ledger, {
        kind: 'earn',
        amountUgx: n,
        label: label.trim() || 'Income',
      }),
    })
  },
  spendUgx: (amountUgx, label) => {
    const n = Math.max(0, Math.floor(amountUgx))
    if (n <= 0) return true
    const state = get()
    if (moneyInt(state.money) < n) return false
    set({
      money: moneyInt(state.money - n),
      ledger: appendLedger(state.ledger, {
        kind: 'spend',
        amountUgx: n,
        label: label.trim() || 'Purchase',
      }),
    })
    return true
  },
  buyFuel: (requestedUgx) => {
    const state = get()
    const p = previewFuelPurchase(requestedUgx, state.money, state.fuel)
    if (p.spendUgx <= 0) return
    const nextFuel = normalizeTankFuel(state.fuel + p.fuelAdd)
    set({
      money: p.balanceAfter,
      fuel: nextFuel,
      ledger: appendLedger(state.ledger, {
        kind: 'spend',
        amountUgx: p.spendUgx,
        label: `Fuel (+${p.fuelAdd.toFixed(1)}% tank, ~${formatDistanceShort(p.approxMeters)})`,
      }),
    })
  },
  buyRepair: (requestedUgx) => {
    const state = get()
    const p = previewRepairPurchase(requestedUgx, state.money, state.condition)
    if (p.spendUgx <= 0) return
    const nextCondition = normalizeCondition(state.condition + p.conditionAdd)
    set({
      money: p.balanceAfter,
      condition: nextCondition,
      ledger: appendLedger(state.ledger, {
        kind: 'spend',
        amountUgx: p.spendUgx,
        label: `Bike repair (+${p.conditionAdd.toFixed(1)}% condition)`,
      }),
    })
  },
  triggerBloodImpactFlash: (kind) => {
    playBloodImpactFeedback(kind)
    set((s) => ({
      bloodImpactNonce: s.bloodImpactNonce + 1,
      bloodImpactKind: kind,
    }))
  },
  setBikeMapCoords: (x, z) =>
    set({
      bikeMapX: x,
      bikeMapZ: z,
    }),
  assignRideJob: () => {
    const serial = get().rideJobSerial + 1
    set({
      rideJob: generateRideJob(serial),
      rideJobSerial: serial,
      rideJobRouteOrder: 'xFirst',
    })
  },
  completeRidePickup: () => {
    const j = get().rideJob
    if (!j || j.phase !== 'pickup') return
    set((s) => ({
      rideJob: { ...j, phase: 'carrying' },
      ridePickupToastNonce: s.ridePickupToastNonce + 1,
      ridePickupToastDestination: j.dropoff.name,
      rideJobRouteOrder: 'xFirst',
    }))
  },
  completeRideDropoff: () => {
    const j = get().rideJob
    if (!j || j.phase !== 'carrying') return
    const label = `Fare — ${j.dropoff.name}`
    get().earnUgx(j.payoutUgx, label)

    const s0 = get()
    const deliveries = s0.rideCompletedDeliveries + 1
    let riderLevelUpToastNonce = s0.riderLevelUpToastNonce
    let riderLevelUpToastLevel = s0.riderLevelUpToastLevel
    if (deliveries === 2) {
      riderLevelUpToastNonce += 1
      riderLevelUpToastLevel = 2
    } else if (deliveries === 5) {
      riderLevelUpToastNonce += 1
      riderLevelUpToastLevel = 3
    } else if (deliveries === 10) {
      riderLevelUpToastNonce += 1
      riderLevelUpToastLevel = 4
    }

    const serial = s0.rideJobSerial + 1
    const nextJob = generateRideJob(serial)
    set({
      rideJob: nextJob,
      rideJobSerial: serial,
      rideJobRouteOrder: 'xFirst',
      rideCompletedDeliveries: deliveries,
      riderLevelUpToastNonce,
      riderLevelUpToastLevel,
      rideNextPassengerToastNonce: s0.rideNextPassengerToastNonce + 1,
      rideNextPassengerPickupName: nextJob.pickup.name,
      rideNextPassengerPayoutUgx: nextJob.payoutUgx,
    })
  },
}))

useGameStore.subscribe((state) => {
  if (typeof sessionStorage === 'undefined') return
  if (isProgressPristine(state)) return
  try {
    sessionStorage.setItem(SESSION_STORAGE_PROGRESS_KEY, '1')
  } catch {
    /* private mode */
  }
})
