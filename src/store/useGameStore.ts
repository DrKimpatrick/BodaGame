import { create } from 'zustand'

/** Ignore bike↔ped / bike↔car collision penalties until this `performance.now()` (spawn overlap). */
export const COLLISION_GRACE_MS = 2200

/** Bike spawn XZ (matches `Boda`); used to defer ped knock / condition until you leave the intersection. */
export const BIKE_SPAWN_XZ = { x: 0, z: 0 } as const
/** Min horizontal distance from spawn before bike↔pedestrian knock & condition loss can apply. */
export const BIKE_SPAWN_PED_CLEAR_M = 2.85

/** Tank capacity in abstract units (0–FUEL_MAX, shown as % in UI). */
export const FUEL_MAX = 100

/** Starting wallet (Ugandan shillings). */
export const STARTING_MONEY_UGX = 50_000

/**
 * Cost to add 1 tank point. Full refill from empty = FUEL_MAX * UGX_PER_FUEL_UNIT.
 */
export const UGX_PER_FUEL_UNIT = 500

/**
 * Tank fuel points consumed per world unit (XZ) travelled while moving.
 * Must match consumption in Boda physics.
 */
export const FUEL_PER_WORLD_METER = 0.042

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

export type GameState = {
  money: number
  fuel: number
  condition: number
  /** Display speed (KM/H), updated from physics — keep updates throttled in Boda. */
  speedKmh: number
  ledger: WalletTransaction[]
  /**
   * Collisions before this `performance.now()` do not apply stun / condition loss / pedestrian knock
   * (avoids penalties from initial overlap before React effects run).
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
}

/** Bike–ped knockdown + condition loss (not vehicle bumps). */
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
    s.condition >= 99.9 &&
    s.ledger.length === 0
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
> => ({
  money: STARTING_MONEY_UGX,
  fuel: FUEL_MAX,
  condition: 100,
  speedKmh: 0,
  ledger: [],
  /** Until `resetSession()` runs from `main`, ignore collisions (import order / first physics tick). */
  collisionPenaltiesAfterMs: Number.POSITIVE_INFINITY,
  bikeAwayFromSpawn: false,
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
  },
  setMoney: (money) => set({ money: moneyInt(money) }),
  setFuel: (fuel) => set({ fuel: normalizeTankFuel(fuel) }),
  setCondition: (condition) => set({ condition }),
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
