import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { fullNuclearResetAndReload } from '../clearClientOnRestart'
import {
  approxMetersForFuelPoints,
  CONDITION_BROKEN_AT,
  CONDITION_GARAGE_WARNING_AT,
  CONDITION_MAX,
  CONDITION_TERRIBLE_AT,
  CONDITION_WARN_AT,
  formatDistanceShort,
  FUEL_MAX,
  isBikeBrokenDown,
  maxUgxToFillRemaining,
  maxUgxToRepairRemaining,
  normalizeCondition,
  normalizeTankFuel,
  previewFuelPurchase,
  previewRepairPurchase,
  UGX_PER_CONDITION_UNIT,
  UGX_PER_FUEL_UNIT,
  useGameStore,
} from '../store/useGameStore'

/** Quick-buy: whole tank points (capped by room + wallet). */
const FUEL_POINT_PRESETS = [5, 10, 25, 50] as const

/** Quick-buy: whole condition points (capped by room + wallet). */
const REPAIR_POINT_PRESETS = [5, 10, 25, 50] as const

/** Tank points (same scale as FUEL_MAX): warn orange at/below this. */
const FUEL_LOW_ORANGE_AT = 20
/** Critical red at/below this (takes priority over orange). */
const FUEL_LOW_RED_AT = 10

function tankReadout(fuel: number): string {
  const f = normalizeTankFuel(fuel)
  const shown = (Math.round(f * 10) / 10).toFixed(1)
  return `${shown} / ${FUEL_MAX}`
}

function fuelLowLevel(fuel: number): 'ok' | 'low' | 'critical' {
  const f = normalizeTankFuel(fuel)
  if (f <= FUEL_LOW_RED_AT) return 'critical'
  if (f <= FUEL_LOW_ORANGE_AT) return 'low'
  return 'ok'
}

/** Tenor post: torque / Audi RS6 RPM-style gauge (GIF — not synced to in-game speed). */
const TENOR_SPEEDO_POST_ID = '15773332'
const TENOR_SPEEDO_ASPECT = 1.50943

/** Uganda flag asset (public). */
const UGANDA_FLAG_SRC = '/textures/uganda-flag_1070394-187.avif'

function UgandaFlagBadge({
  className,
  title,
}: {
  className?: string
  title?: string
}) {
  return (
    <img
      src={UGANDA_FLAG_SRC}
      alt=""
      title={title}
      width={60}
      height={40}
      className={`pointer-events-none select-none object-cover shadow-sm ring-1 ring-black/40 ${className ?? ''}`}
      loading="lazy"
      decoding="async"
    />
  )
}

/** Car-style fuel pump lamp (stroke icon). */
function FuelPumpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16H3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M17 22V10a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 10h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Wrench + spoke — workshop / repair. */
function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.36 6.36a2.83 2.83 0 1 1-4-4l6.36-6.36a6 6 0 0 1 7.94-7.94l-3.77 3.77Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Bifold wallet (stroke) — matches arcade HUD icons. */
function WalletIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M3 10h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 13h7M7 16h5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  )
}

/**
 * Same Tenor clip as
 * `data-postid="15773332"` / https://tenor.com/view/torque-audi-rs6-rpm-meter-gif-15773332
 * Iframe embed works reliably with React (Tenor’s embed.js usually runs before the HUD mounts).
 * The GIF is decorative; actual speed is the digits below.
 */
function TenorSpeedometerEmbed({ speedKmh }: { speedKmh: number }) {
  return (
    <div
      className="pointer-events-none flex w-[min(184px,100vw-3rem)] shrink-0 flex-col items-center gap-1.5"
      aria-label={`Speed ${speedKmh} kilometres per hour. Gauge animation is a Tenor clip.`}
    >
      <div
        className="w-full overflow-hidden rounded-lg bg-black ring-1 ring-white/20"
        style={{ aspectRatio: `${TENOR_SPEEDO_ASPECT} / 1` }}
      >
        <iframe
          title="Torque / RPM gauge (Tenor)"
          src={`https://tenor.com/embed/${TENOR_SPEEDO_POST_ID}`}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="flex flex-col items-center leading-none">
        <span className="font-mono text-lg font-bold tabular-nums text-amber-200">
          {speedKmh}
        </span>
        <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
          km/h
        </span>
      </div>
    </div>
  )
}

function RefuelSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className="h-px min-w-[8px] flex-1 bg-linear-to-r from-transparent via-amber-500/45 to-amber-500/30" />
      <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/95 drop-shadow-[0_1px_0_rgba(0,0,0,0.9)]">
        {children}
      </span>
      <span className="h-px min-w-[8px] flex-1 bg-linear-to-l from-transparent via-amber-500/45 to-amber-500/30" />
    </div>
  )
}

const gameArcadeBtn =
  'rounded-xl border-2 font-black uppercase tracking-wide transition-[transform,box-shadow,border-width] duration-100 active:translate-y-1'

/** Chunky arcade-style fuel tiles (press opens refuel where useful). */
function FuelGameButtons({
  fuel,
  rangeKmLabel,
  onRefuel,
}: {
  fuel: number
  rangeKmLabel: string
  onRefuel: () => void
}) {
  const level = fuelLowLevel(fuel)
  const pct = Math.max(0, Math.min(100, (fuel / FUEL_MAX) * 100))
  const fillByLevel =
    level === 'critical'
      ? 'bg-red-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]'
      : level === 'low'
        ? 'bg-orange-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
        : 'bg-linear-to-r from-sky-400 to-cyan-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'
  const trackRing =
    level === 'critical'
      ? 'ring-red-500/70'
      : level === 'low'
        ? 'ring-orange-400/60'
        : 'ring-sky-400/40'

  const tileBase =
    'w-full rounded-xl border-2 text-left transition-[transform,box-shadow,border-width] duration-100 active:translate-y-1'

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={onRefuel}
        className={`${tileBase} border-sky-400/55 border-b-[6px] border-b-sky-950 bg-linear-to-b from-sky-600/40 via-sky-950/80 to-black/90 px-3 py-2.5 shadow-[0_6px_0_rgba(8,47,73,0.85)] active:border-b-[3px] active:shadow-[0_3px_0_rgba(8,47,73,0.85)] ring-1 ring-sky-300/25`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-black uppercase italic tracking-[0.18em] text-sky-100 drop-shadow-[0_1px_0_rgba(0,0,0,0.8)]">
            Fuel
          </span>
          <span className="rounded-md border border-sky-500/40 bg-black/55 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-sky-50">
            {tankReadout(fuel)}
          </span>
        </div>
        <div
          className={`mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-inset ring-black/80 ${trackRing}`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${fillByLevel}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>

      <button
        type="button"
        onClick={onRefuel}
        className={`${tileBase} border-emerald-500/45 border-b-[6px] border-b-emerald-950 bg-linear-to-b from-emerald-700/35 via-emerald-950/75 to-black/90 px-3 py-2.5 shadow-[0_6px_0_rgba(6,78,59,0.88)] active:border-b-[3px] active:shadow-[0_3px_0_rgba(6,78,59,0.88)] ring-1 ring-emerald-400/20`}
      >
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200/95 drop-shadow-[0_1px_0_rgba(0,0,0,0.75)]">
          Range
        </span>
        <p className="mt-1 font-mono text-base font-bold tabular-nums text-emerald-50">
          ~{rangeKmLabel}
        </p>
        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400/75">
          Est. left
        </p>
      </button>

      <button
        type="button"
        onClick={onRefuel}
        className={`${tileBase} border-amber-300/70 border-b-[6px] border-b-amber-950 bg-linear-to-b from-amber-400 via-amber-500 to-amber-700 px-3 py-3 text-center font-black uppercase italic tracking-[0.2em] text-amber-950 shadow-[0_6px_0_rgba(120,53,15,0.95)] active:border-b-[3px] active:shadow-[0_3px_0_rgba(120,53,15,0.95)] ring-1 ring-amber-200/50 drop-shadow-sm`}
      >
        Refuel
      </button>
    </div>
  )
}

/** Gauge + hub — reads as vehicle condition / health. */
function ConditionGaugeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5 16.5a8.5 8.5 0 0 1 14 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 16.5V10.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.5" r="1.75" fill="currentColor" />
    </svg>
  )
}

type ConditionStress = 'none' | 'caution' | 'garage' | 'severe'

type ConditionAlertLevel =
  | 'ok'
  | 'warn30'
  | 'garage20'
  | 'terrible10'
  | 'broken5'

function conditionAlertLevel(c: number): ConditionAlertLevel {
  const n = normalizeCondition(c)
  if (n <= CONDITION_BROKEN_AT) return 'broken5'
  if (n <= CONDITION_TERRIBLE_AT) return 'terrible10'
  if (n <= CONDITION_GARAGE_WARNING_AT) return 'garage20'
  if (n <= CONDITION_WARN_AT) return 'warn30'
  return 'ok'
}

function stressFromAlert(level: ConditionAlertLevel): ConditionStress {
  if (level === 'warn30') return 'caution'
  if (level === 'garage20') return 'garage'
  if (level === 'terrible10' || level === 'broken5') return 'severe'
  return 'none'
}

/** Non-blocking HUD cues (3D world keeps running until breakdown). */
function ConditionRideOverlays({ level }: { level: ConditionAlertLevel }) {
  if (level === 'ok') return null

  const vignetteClass =
    level === 'warn30'
      ? 'bg-[radial-gradient(ellipse_at_center,transparent_0%,transparent_55%,rgba(180,83,9,0.22)_100%)]'
      : level === 'garage20'
        ? 'bg-[radial-gradient(ellipse_at_center,transparent_0%,transparent_48%,rgba(234,88,12,0.32)_100%)]'
        : level === 'terrible10'
          ? 'bg-[radial-gradient(ellipse_at_center,transparent_0%,transparent_42%,rgba(220,38,38,0.42)_100%)]'
          : 'bg-[radial-gradient(ellipse_at_center,transparent_0%,transparent_38%,rgba(127,29,29,0.55)_100%)]'

  const showEdge =
    level === 'garage20' ||
    level === 'terrible10' ||
    level === 'broken5'
  const edgeFast = level === 'terrible10' || level === 'broken5'
  const edgeFrom =
    level === 'garage20'
      ? 'from-orange-600/55'
      : 'from-red-600/70'

  return (
    <>
      <div
        className={`pointer-events-none fixed inset-0 z-12 ${vignetteClass}`}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
        role="status"
      >
        <div
          className={
            level === 'warn30'
              ? 'max-w-lg rounded-b-xl border border-t-0 border-amber-600/50 bg-amber-950/88 px-3 py-2 text-center shadow-lg ring-1 ring-amber-500/25 backdrop-blur-sm'
              : level === 'garage20'
                ? 'max-w-lg rounded-b-xl border border-t-0 border-orange-500/55 bg-orange-950/90 px-3 py-2 text-center shadow-lg ring-1 ring-orange-400/30 backdrop-blur-sm'
                : level === 'terrible10'
                  ? 'max-w-lg animate-pulse rounded-b-xl border border-t-0 border-red-600/60 bg-red-950/92 px-3 py-2 text-center shadow-lg ring-1 ring-red-500/35 backdrop-blur-sm'
                  : 'max-w-lg rounded-b-xl border border-t-0 border-red-700/65 bg-red-950/95 px-3 py-2.5 text-center shadow-[0_0_24px_rgba(220,38,38,0.35)] ring-2 ring-red-500/40 backdrop-blur-sm'
          }
        >
          <p
            className={
              level === 'warn30'
                ? 'text-[11px] font-black uppercase leading-snug tracking-wide text-amber-100'
                : level === 'garage20'
                  ? 'text-[11px] font-black uppercase leading-snug tracking-wide text-orange-100'
                  : 'text-[11px] font-black uppercase leading-snug tracking-wide text-red-100'
            }
          >
            {level === 'warn30'
              ? 'Condition warning — service the bike before long rides.'
              : level === 'garage20'
                ? 'Low condition — open Repair bike (garage) before you get stranded.'
                : level === 'terrible10'
                  ? 'Terrible state — repair now! The bike may break down.'
                  : 'Breakdown — bike will not move. Repair to resume.'}
          </p>
        </div>
      </div>
      {showEdge ? (
        <>
          <div
            className={`pointer-events-none fixed bottom-0 left-0 top-0 z-12 w-6 bg-linear-to-r ${edgeFrom} to-transparent sm:w-8 ${edgeFast ? 'animate-pulse' : ''}`}
            aria-hidden
          />
          <div
            className={`pointer-events-none fixed bottom-0 right-0 top-0 z-12 w-6 bg-linear-to-l ${edgeFrom} to-transparent sm:w-8 ${edgeFast ? 'animate-pulse' : ''}`}
            aria-hidden
          />
        </>
      ) : null}
    </>
  )
}

/** Brief red splatter / vignette when the bike hits a pedestrian or is struck by a car. */
function BloodImpactOverlay() {
  const nonce = useGameStore((s) => s.bloodImpactNonce)
  const kind = useGameStore((s) => s.bloodImpactKind)
  const [alpha, setAlpha] = useState(0)

  const fadeMs = kind === 'vehicle' ? 560 : 380

  useEffect(() => {
    if (nonce === 0 || kind === null) return
    const peak = kind === 'vehicle' ? 0.54 : 0.36
    const holdMs = kind === 'vehicle' ? 90 : 70
    setAlpha(peak)
    const t = window.setTimeout(() => setAlpha(0), holdMs)
    return () => window.clearTimeout(t)
  }, [nonce, kind])

  if (nonce === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-25 transition-opacity ease-out"
      style={{
        opacity: alpha,
        transitionDuration: `${fadeMs}ms`,
      }}
      aria-hidden
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_40%_36%,rgba(220,38,38,0.72)_0%,rgba(120,20,20,0.35)_42%,transparent_68%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_82%_58%,rgba(185,28,28,0.5)_0%,transparent_58%)]" />
      <div className="absolute inset-x-0 top-0 h-[44%] bg-linear-to-b from-red-950/60 via-red-900/18 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-red-950/40 to-transparent" />
      {kind === 'vehicle' ? (
        <div
          className="absolute inset-0 opacity-70 mix-blend-multiply"
          style={{
            backgroundImage:
              'repeating-linear-gradient(108deg, transparent, transparent 3px, rgba(90,10,10,0.12) 3px, rgba(90,10,10,0.12) 5px)',
          }}
        />
      ) : null}
    </div>
  )
}

function ConditionArcadeTile({
  value,
  stress,
}: {
  value: number
  stress: ConditionStress
}) {
  const pct = Math.max(0, Math.min(100, value))
  const barTone =
    pct <= 25
      ? {
          fill:
            'bg-linear-to-r from-red-500 to-rose-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
          ring: 'ring-red-500/65',
        }
      : pct <= 55
        ? {
            fill:
              'bg-linear-to-r from-amber-400 to-yellow-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]',
            ring: 'ring-amber-400/55',
          }
        : {
            fill:
              'bg-linear-to-r from-emerald-400 to-teal-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]',
            ring: 'ring-emerald-400/45',
          }

  const hubShell =
    stress === 'severe'
      ? 'border-red-500/70 border-b-red-950 bg-linear-to-b from-red-600/75 to-red-950 shadow-[0_4px_0_rgba(127,29,29,0.9)] ring-2 ring-red-400/70 animate-pulse'
      : stress === 'garage'
        ? 'border-orange-500/60 border-b-orange-950 bg-linear-to-b from-orange-600/65 to-orange-950 shadow-[0_4px_0_rgba(154,52,18,0.88)] ring-2 ring-orange-400/55'
        : stress === 'caution'
          ? 'border-amber-500/55 border-b-amber-950 bg-linear-to-b from-amber-600/60 to-amber-950 shadow-[0_4px_0_rgba(120,53,15,0.85)] ring-2 ring-amber-300/50'
          : 'border-emerald-400/50 border-b-emerald-950 bg-linear-to-b from-emerald-500/65 to-emerald-950 shadow-[0_4px_0_rgba(6,78,59,0.88)] ring-1 ring-emerald-200/35'

  const iconClass =
    stress === 'severe'
      ? 'text-red-50'
      : stress === 'garage'
        ? 'text-orange-50'
        : stress === 'caution'
          ? 'text-amber-50'
          : 'text-emerald-50'

  return (
    <div className="relative flex gap-3">
      <div
        className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border-2 border-b-4 ${hubShell}`}
        aria-hidden
      >
        <ConditionGaugeIcon
          className={`h-7 w-7 drop-shadow-[0_1px_0_rgba(0,0,0,0.65)] ${iconClass}`}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 pt-0.5">
        <p className="text-[10px] font-black uppercase italic tracking-[0.2em] text-emerald-100/95 drop-shadow-[0_1px_0_rgba(0,0,0,0.85)]">
          Condition
          {stress === 'garage' || stress === 'severe' ? (
            <span className="ml-1.5 inline-block text-[8px] font-black tracking-widest text-orange-300">
              ▲ garage
            </span>
          ) : null}
        </p>
        <div
          className={`h-2.5 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-inset ring-black/80 ${barTone.ring}`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${barTone.fill}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="font-mono text-xl font-black tabular-nums leading-none text-emerald-50 drop-shadow-[0_2px_0_rgba(0,0,0,0.55)]">
          {pct.toFixed(0)}
          <span className="ml-0.5 text-sm font-black text-emerald-300/90">%</span>
        </p>
      </div>
    </div>
  )
}

function parseWholePoints(s: string): { valid: true; pts: number } | { valid: false } {
  const t = s.trim().replace(/,/g, '')
  if (t === '') return { valid: false }
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return { valid: false }
  return { valid: true, pts: Math.floor(n) }
}

function clampPoints(pts: number, max: number): number {
  if (max < 1) return 0
  return Math.min(Math.max(1, Math.floor(pts)), max)
}

export function Hud() {
  const money = useGameStore((s) => s.money)
  const fuel = useGameStore((s) => s.fuel)
  const condition = useGameStore((s) => s.condition)
  const speedKmh = useGameStore((s) => s.speedKmh)
  const ledger = useGameStore((s) => s.ledger)
  const buyFuel = useGameStore((s) => s.buyFuel)
  const buyRepair = useGameStore((s) => s.buyRepair)

  const [refuelOpen, setRefuelOpen] = useState(false)
  /** Whole tank points to buy (slider + Pay). Starts at max when you open Refuel. */
  const [pointsToAdd, setPointsToAdd] = useState(1)
  const [pointsStr, setPointsStr] = useState('1')

  const [repairOpen, setRepairOpen] = useState(false)
  const [repairPointsToAdd, setRepairPointsToAdd] = useState(1)
  const [repairPointsStr, setRepairPointsStr] = useState('1')

  const maxUgxTank = maxUgxToFillRemaining(fuel)
  const canRefuel = maxUgxTank > 0 && money > 0

  const condNorm = normalizeCondition(condition)
  const maxUgxRepair = maxUgxToRepairRemaining(condition)
  const canRepair = maxUgxRepair > 0 && money > 0
  const conditionAlert = conditionAlertLevel(condition)
  const conditionStress = stressFromAlert(conditionAlert)
  const repairMandatory = isBikeBrokenDown(condition)

  const maxWholePoints = useMemo(
    () => Math.floor(maxUgxTank / UGX_PER_FUEL_UNIT + Number.EPSILON),
    [maxUgxTank],
  )

  const openRefuel = useCallback(() => {
    const m = Math.floor(maxUgxTank / UGX_PER_FUEL_UNIT + Number.EPSILON)
    if (m >= 1) {
      setPointsToAdd(m)
      setPointsStr(String(m))
    } else {
      setPointsToAdd(0)
      setPointsStr('')
    }
    if (!repairMandatory) setRepairOpen(false)
    setRefuelOpen(true)
  }, [maxUgxTank, repairMandatory])

  const closeRefuel = useCallback(() => {
    setRefuelOpen(false)
    if (isBikeBrokenDown(useGameStore.getState().condition)) setRepairOpen(true)
  }, [])

  const maxWholeRepairPoints = useMemo(
    () => Math.floor(maxUgxRepair / UGX_PER_CONDITION_UNIT + Number.EPSILON),
    [maxUgxRepair],
  )

  const openRepair = useCallback(() => {
    const m = Math.floor(maxUgxRepair / UGX_PER_CONDITION_UNIT + Number.EPSILON)
    if (m >= 1) {
      setRepairPointsToAdd(m)
      setRepairPointsStr(String(m))
    } else {
      setRepairPointsToAdd(0)
      setRepairPointsStr('')
    }
    setRefuelOpen(false)
    setRepairOpen(true)
  }, [maxUgxRepair])

  useEffect(() => {
    if (repairMandatory) setRepairOpen(true)
  }, [repairMandatory])

  useEffect(() => {
    if (!refuelOpen) return
    if (maxWholePoints < 1) {
      setPointsToAdd(0)
      return
    }
    setPointsToAdd((p) => clampPoints(p, maxWholePoints))
  }, [refuelOpen, maxWholePoints])

  useEffect(() => {
    if (!repairOpen) return
    if (maxWholeRepairPoints < 1) {
      setRepairPointsToAdd(0)
      return
    }
    setRepairPointsToAdd((p) => clampPoints(p, maxWholeRepairPoints))
  }, [repairOpen, maxWholeRepairPoints])

  const pointsDraft = useMemo(() => parseWholePoints(pointsStr), [pointsStr])

  const committedPoints = useMemo(
    () => (maxWholePoints < 1 ? 0 : clampPoints(pointsToAdd, maxWholePoints)),
    [maxWholePoints, pointsToAdd],
  )

  /** Points used for price preview (typed value if valid, else slider/committed). */
  const previewPoints = useMemo(() => {
    if (maxWholePoints < 1) return 0
    const d = parseWholePoints(pointsStr)
    if (d.valid) return clampPoints(d.pts, maxWholePoints)
    return committedPoints
  }, [maxWholePoints, pointsStr, committedPoints])

  const purchasePreview = useMemo(() => {
    if (previewPoints < 1) return null
    return previewFuelPurchase(
      previewPoints * UGX_PER_FUEL_UNIT,
      money,
      fuel,
    )
  }, [previewPoints, money, fuel])

  const repairPointsDraft = useMemo(
    () => parseWholePoints(repairPointsStr),
    [repairPointsStr],
  )

  const committedRepairPoints = useMemo(
    () =>
      maxWholeRepairPoints < 1
        ? 0
        : clampPoints(repairPointsToAdd, maxWholeRepairPoints),
    [maxWholeRepairPoints, repairPointsToAdd],
  )

  const previewRepairPts = useMemo(() => {
    if (maxWholeRepairPoints < 1) return 0
    const d = parseWholePoints(repairPointsStr)
    if (d.valid) return clampPoints(d.pts, maxWholeRepairPoints)
    return committedRepairPoints
  }, [maxWholeRepairPoints, repairPointsStr, committedRepairPoints])

  const repairPurchasePreview = useMemo(() => {
    if (previewRepairPts < 1) return null
    return previewRepairPurchase(
      previewRepairPts * UGX_PER_CONDITION_UNIT,
      money,
      condition,
    )
  }, [previewRepairPts, money, condition])

  const canPayPoints =
    previewPoints >= 1 &&
    purchasePreview != null &&
    purchasePreview.spendUgx > 0

  const canPayRepairPoints =
    previewRepairPts >= 1 &&
    repairPurchasePreview != null &&
    repairPurchasePreview.spendUgx > 0

  const rangeLeftM = formatDistanceShort(approxMetersForFuelPoints(fuel))

  const fillPreview = useMemo(
    () => previewFuelPurchase(Number.MAX_SAFE_INTEGER, money, fuel),
    [money, fuel],
  )

  const partialOnly =
    canRefuel && maxWholePoints < 1 && maxUgxTank > 0

  const repairPartialOnly =
    canRepair && maxWholeRepairPoints < 1 && maxUgxRepair > 0

  const fillRepairPreview = useMemo(
    () => previewRepairPurchase(Number.MAX_SAFE_INTEGER, money, condition),
    [money, condition],
  )

  const onPaySubmit = useCallback(() => {
    if (maxWholePoints < 1) return
    let pts = clampPoints(pointsToAdd, maxWholePoints)
    const d = parseWholePoints(pointsStr)
    if (d.valid) {
      pts = clampPoints(d.pts, maxWholePoints)
      setPointsToAdd(pts)
      setPointsStr(String(pts))
    }
    if (pts < 1) return
    buyFuel(pts * UGX_PER_FUEL_UNIT)
  }, [buyFuel, maxWholePoints, pointsStr, pointsToAdd])

  const buyWholePoints = useCallback(
    (pts: number) => {
      const p = Math.min(
        Math.max(1, Math.floor(pts)),
        maxWholePoints,
      )
      if (p < 1) return
      buyFuel(p * UGX_PER_FUEL_UNIT)
    },
    [buyFuel, maxWholePoints],
  )

  const onRepairPaySubmit = useCallback(() => {
    if (maxWholeRepairPoints < 1) return
    let pts = clampPoints(repairPointsToAdd, maxWholeRepairPoints)
    const d = parseWholePoints(repairPointsStr)
    if (d.valid) {
      pts = clampPoints(d.pts, maxWholeRepairPoints)
      setRepairPointsToAdd(pts)
      setRepairPointsStr(String(pts))
    }
    if (pts < 1) return
    buyRepair(pts * UGX_PER_CONDITION_UNIT)
  }, [buyRepair, maxWholeRepairPoints, repairPointsStr, repairPointsToAdd])

  const buyWholeRepairPoints = useCallback(
    (pts: number) => {
      const p = Math.min(
        Math.max(1, Math.floor(pts)),
        maxWholeRepairPoints,
      )
      if (p < 1) return
      buyRepair(p * UGX_PER_CONDITION_UNIT)
    },
    [buyRepair, maxWholeRepairPoints],
  )

  const onClearAllAndReload = useCallback(() => {
    if (
      !window.confirm(
        'Clear all progress (wallet, fuel, condition, trip history), wipe saved data and caches, and reload?',
      )
    ) {
      return
    }
    fullNuclearResetAndReload()
  }, [])

  useEffect(() => {
    if (!refuelOpen && !repairOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (refuelOpen) {
        closeRefuel()
        return
      }
      if (repairOpen && repairMandatory) return
      if (repairOpen) setRepairOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [refuelOpen, repairOpen, repairMandatory, closeRefuel])

  const fuelWarn = fuelLowLevel(fuel)

  return (
    <div className="pointer-events-none fixed inset-0 z-10 font-sans">
      <ConditionRideOverlays level={conditionAlert} />
      <BloodImpactOverlay />
      <div
        className="absolute left-4 top-4 max-w-[min(100vw-2rem,300px)] overflow-hidden rounded-xl border-2 border-amber-500/45 border-b-4 border-b-amber-950 bg-linear-to-b from-amber-600/30 via-zinc-950/92 to-black/90 px-3 py-3 shadow-[0_6px_0_rgba(92,45,10,0.82)] ring-1 ring-amber-400/25 backdrop-blur-md"
        style={{
          marginTop: 'max(0px, env(safe-area-inset-top))',
          marginLeft: 'max(0px, env(safe-area-inset-left))',
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-300/55 to-transparent" />
        <div className="relative flex gap-3">
          <div
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border-2 border-amber-400/50 border-b-4 border-b-amber-950 bg-linear-to-b from-amber-500/70 to-amber-950 shadow-[0_4px_0_rgba(69,26,3,0.88)] ring-1 ring-amber-200/35"
            aria-hidden
          >
            <WalletIcon className="h-7 w-7 text-amber-50 drop-shadow-[0_1px_0_rgba(0,0,0,0.65)]" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-100/95 drop-shadow-[0_1px_0_rgba(0,0,0,0.85)]">
                Wallet
              </p>
              <UgandaFlagBadge
                className="h-4 w-6 shrink-0 rounded-sm"
                title="Uganda"
              />
            </div>
            <p className="mt-1 font-mono text-2xl font-black tabular-nums leading-none text-amber-50 drop-shadow-[0_2px_0_rgba(0,0,0,0.55)]">
              {money.toLocaleString()}
            </p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.28em] text-amber-400/85">
              UGX
            </p>
          </div>
        </div>
      </div>

      <div
        className="absolute z-10 flex flex-col items-center gap-2"
        style={{
          top: 'max(1rem, env(safe-area-inset-top))',
          right: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {fuelWarn === 'critical' ? (
          <span
            className="pointer-events-auto inline-flex items-center justify-center rounded-lg bg-red-950/90 p-2 ring-2 ring-red-500/80 shadow-[0_0_14px_rgba(239,68,68,0.55)] animate-pulse"
            title="Low fuel — refuel soon"
            role="img"
            aria-label="Low fuel critical — refuel soon"
          >
            <FuelPumpIcon className="h-6 w-6 text-red-400" />
          </span>
        ) : fuelWarn === 'low' ? (
          <span
            className="pointer-events-auto inline-flex items-center justify-center rounded-lg bg-orange-950/85 p-2 ring-2 ring-orange-400/70 shadow-[0_0_12px_rgba(251,146,60,0.45)]"
            title="Low fuel"
            role="img"
            aria-label="Low fuel warning"
          >
            <FuelPumpIcon className="h-6 w-6 text-orange-400" />
          </span>
        ) : (
          <span
            className="pointer-events-auto inline-flex items-center justify-center rounded-lg bg-zinc-900/90 p-2 ring-2 ring-zinc-500/50 shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
            title="Fuel OK"
            role="img"
            aria-label="Fuel level OK"
          >
            <FuelPumpIcon className="h-6 w-6 text-zinc-100" />
          </span>
        )}
        <div className="rounded-xl border border-white/10 bg-black/50 px-2 pb-1 pt-1 shadow-lg ring-1 ring-white/5 backdrop-blur-md">
          <TenorSpeedometerEmbed speedKmh={speedKmh} />
        </div>
      </div>

      <div
        className="pointer-events-auto absolute bottom-4 left-4 max-w-[min(100vw-2rem,300px)] overflow-hidden rounded-xl border-2 border-emerald-500/45 border-b-4 border-b-emerald-950 bg-linear-to-b from-emerald-700/28 via-zinc-950/92 to-black/90 px-3 py-3 shadow-[0_6px_0_rgba(6,78,59,0.78)] ring-1 ring-emerald-400/22 backdrop-blur-md"
        style={{
          marginBottom: 'max(0px, env(safe-area-inset-bottom))',
          marginLeft: 'max(0px, env(safe-area-inset-left))',
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-emerald-300/55 to-transparent" />
        <ConditionArcadeTile
          value={condNorm}
          stress={conditionStress}
        />
        <button
          type="button"
          onClick={openRepair}
          className={`${gameArcadeBtn} mt-2.5 flex w-full items-center justify-center gap-2 border-teal-500/50 border-b-[6px] border-b-teal-950 bg-linear-to-b from-teal-600 via-teal-700 to-teal-950 py-2.5 text-[11px] text-teal-50 shadow-[0_6px_0_rgba(15,118,110,0.9)] active:border-b-[3px] active:shadow-[0_3px_0_rgba(15,118,110,0.9)] ring-1 ring-teal-300/30`}
        >
          <WrenchIcon className="h-4 w-4 shrink-0" />
          Repair bike
        </button>
      </div>

      <div className="pointer-events-auto absolute bottom-4 right-4 z-10 flex w-[min(100vw-2rem,288px)] flex-col gap-2">
        <div className="rounded-xl border-2 border-white/10 bg-linear-to-b from-zinc-900/90 to-black/80 px-3 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.55)] ring-1 ring-white/5 backdrop-blur-md">
          <FuelGameButtons
            fuel={fuel}
            rangeKmLabel={rangeLeftM}
            onRefuel={openRefuel}
          />
          <details className="mt-2 border-t border-white/10 pt-2 text-left">
            <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              History ({ledger.length})
            </summary>
            <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1 text-[11px]">
              {ledger.length === 0 ? (
                <li className="text-zinc-600">No transactions yet.</li>
              ) : (
                ledger.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-0.5 rounded-md bg-black/30 px-2 py-1 ring-1 ring-white/5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={
                          row.kind === 'earn'
                            ? 'font-mono text-emerald-400'
                            : 'font-mono text-rose-300'
                        }
                      >
                        {row.kind === 'earn' ? '+' : '−'}
                        UGX {row.amountUgx.toLocaleString()}
                      </span>
                      <time
                        className="shrink-0 text-[10px] text-zinc-600"
                        dateTime={new Date(row.at).toISOString()}
                      >
                        {new Date(row.at).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>
                    </div>
                    <p className="wrap-break-word text-zinc-500">{row.label}</p>
                  </li>
                ))
              )}
            </ul>
          </details>
          <div className="mt-2 border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={onClearAllAndReload}
              className={`${gameArcadeBtn} w-full border-rose-800/60 border-b-4 border-b-rose-950 bg-linear-to-b from-rose-950/80 to-black py-2 text-[10px] text-rose-200/95 shadow-[0_4px_0_rgba(69,10,10,0.85)] active:border-b-2 active:shadow-[0_2px_0_rgba(69,10,10,0.85)]`}
            >
              Clear all & reload
            </button>
          </div>
        </div>
      </div>

      {refuelOpen ? (
        <>
          <button
            type="button"
            aria-label="Close refuel"
            className="pointer-events-auto fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            onClick={closeRefuel}
          />
          <div
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
            style={{
              paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
            }}
          >
            <div
              className="pointer-events-auto flex max-h-[min(90dvh,680px)] w-full max-w-[380px] flex-col overflow-hidden rounded-2xl border-2 border-amber-500/35 bg-linear-to-b from-indigo-950/95 via-zinc-950 to-black shadow-[0_0_48px_rgba(251,191,36,0.12),0_16px_48px_rgba(0,0,0,0.65)] ring-2 ring-amber-400/15"
              role="dialog"
              aria-modal="true"
              aria-labelledby="refuel-modal-title"
            >
            <div className="relative shrink-0 bg-linear-to-r from-amber-600/25 via-amber-500/10 to-transparent px-3 py-2">
              <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-300/50 to-transparent" />
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <UgandaFlagBadge
                    className="h-9 w-[54px] shrink-0 rounded-md"
                    title="Uganda"
                  />
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-amber-200/70">
                      Pit stop
                    </p>
                    <h2
                      id="refuel-modal-title"
                      className="text-base font-black uppercase italic tracking-wide text-amber-100 drop-shadow-[0_2px_0_rgba(0,0,0,0.85)]"
                    >
                      Refuel
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeRefuel}
                  className={`${gameArcadeBtn} border-rose-700/80 border-b-4 border-b-rose-950 bg-linear-to-b from-rose-600 to-rose-900 px-2.5 py-1 text-base leading-none text-rose-100 shadow-[0_4px_0_rgba(69,10,10,0.9)] active:border-b-2 active:shadow-[0_2px_0_rgba(69,10,10,0.9)]`}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 overflow-hidden px-3 pb-3 pt-1.5 text-left">
              <div className="grid shrink-0 grid-cols-2 gap-1.5">
                <div className="rounded-lg border-2 border-sky-600/35 border-b-4 border-b-sky-950 bg-linear-to-b from-sky-900/50 to-black/80 px-2 py-1.5 shadow-[0_3px_0_rgba(8,47,73,0.75)] ring-1 ring-sky-400/15">
                  <p className="text-[7px] font-black uppercase tracking-widest text-sky-300/80">
                    Tank max
                  </p>
                  <p className="font-mono text-base font-black tabular-nums leading-tight text-sky-100">
                    {FUEL_MAX}
                  </p>
                  <p className="mt-0.5 text-[7px] font-bold uppercase leading-tight text-sky-400/70">
                    {UGX_PER_FUEL_UNIT.toLocaleString()} UGX = +1 pt
                  </p>
                </div>
                <div className="rounded-lg border-2 border-amber-600/40 border-b-4 border-b-amber-950 bg-linear-to-b from-amber-900/40 to-black/80 px-2 py-1.5 shadow-[0_3px_0_rgba(120,53,15,0.8)] ring-1 ring-amber-400/20">
                  <p className="text-[7px] font-black uppercase tracking-widest text-amber-300/80">
                    Wallet
                  </p>
                  <p className="font-mono text-xs font-black leading-tight tabular-nums text-amber-100">
                    {money.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[7px] font-bold uppercase text-amber-500/75">
                    UGX
                  </p>
                </div>
              </div>

              <div className="shrink-0 rounded-lg border-2 border-emerald-600/35 border-b-4 border-b-emerald-950 bg-linear-to-b from-emerald-950/60 to-black/85 px-2 py-1.5 shadow-[0_3px_0_rgba(6,78,59,0.75)] ring-1 ring-emerald-400/15">
                <p className="text-[7px] font-black uppercase tracking-[0.15em] text-emerald-400/85">
                  Room in tank
                </p>
                <p className="font-mono text-sm font-black leading-tight text-emerald-100">
                  {(Math.round((FUEL_MAX - normalizeTankFuel(fuel)) * 10) / 10).toFixed(1)}{' '}
                  <span className="text-xs font-bold text-emerald-400/90">pts</span>
                </p>
                {maxUgxTank > 0 ? (
                  <p className="mt-0.5 text-[8px] font-bold uppercase leading-tight text-emerald-300/75">
                    Fill cap{' '}
                    <span className="font-mono text-emerald-100">
                      UGX {maxUgxTank.toLocaleString()}
                    </span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-[9px] font-black uppercase text-zinc-500">
                    Tank full
                  </p>
                )}
              </div>

              {!canRefuel ? (
                <div className="shrink-0 rounded-lg border-2 border-zinc-600 bg-zinc-950/90 px-2 py-3 text-center">
                  <p className="text-xs font-black uppercase italic tracking-wide text-zinc-400">
                    {maxUgxTank <= 0 ? 'Tank full' : 'No cash'}
                  </p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                    {maxUgxTank <= 0
                      ? 'Ride on!'
                      : 'Earn UGX to refuel'}
                  </p>
                </div>
              ) : partialOnly ? (
                <div className="flex shrink-0 flex-col gap-1">
                  <p className="text-center text-[9px] font-bold uppercase tracking-wide text-amber-200/80">
                    Partial top-up only
                  </p>
                  <button
                    type="button"
                    onClick={() => buyFuel(maxUgxTank)}
                    className={`${gameArcadeBtn} w-full border-cyan-500/50 border-b-[5px] border-b-cyan-950 bg-linear-to-b from-cyan-500 to-cyan-800 py-2 text-xs text-cyan-950 shadow-[0_5px_0_rgba(8,51,68,0.9)] active:border-b-2 active:shadow-[0_2px_0_rgba(8,51,68,0.9)]`}
                  >
                    Pay {maxUgxTank.toLocaleString()} UGX
                    <span className="mt-0.5 block text-[9px] font-mono font-black normal-case tracking-normal">
                      +{(maxUgxTank / UGX_PER_FUEL_UNIT).toFixed(2)} pts
                    </span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1 overflow-hidden">
                  <RefuelSectionTitle>Fuel load</RefuelSectionTitle>
                  <p className="shrink-0 text-center text-[8px] font-bold uppercase leading-tight tracking-wide text-zinc-500">
                    Slide left · less fuel · lower cost
                  </p>
                  {maxWholePoints >= 1 ? (
                    <div className="shrink-0 rounded-lg border-2 border-violet-600/30 border-b-4 border-b-violet-950 bg-linear-to-b from-violet-950/50 to-black/90 px-2 py-1.5 shadow-[0_3px_0_rgba(49,46,129,0.75)] ring-1 ring-violet-400/15">
                      <div className="flex items-center justify-between font-mono text-xs font-black text-violet-200">
                        <span className="text-[8px] font-black uppercase tracking-widest text-violet-400/90">
                          Points
                        </span>
                        <span className="tabular-nums">
                          {previewPoints}{' '}
                          <span className="text-violet-500/80">/</span>{' '}
                          {maxWholePoints}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={maxWholePoints}
                        step={1}
                        value={committedPoints}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setPointsToAdd(v)
                          setPointsStr(String(v))
                        }}
                        className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-black/60 accent-violet-400 ring-1 ring-inset ring-violet-500/25 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-amber-300 [&::-webkit-slider-thumb]:bg-amber-400"
                      />
                    </div>
                  ) : null}

                  <RefuelSectionTitle>Manual entry</RefuelSectionTitle>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={`1 – ${maxWholePoints}`}
                    value={pointsStr}
                    onChange={(e) =>
                      setPointsStr(e.target.value.replace(/[^\d,]/g, ''))
                    }
                    onBlur={() => {
                      const d = parseWholePoints(pointsStr)
                      if (maxWholePoints < 1) {
                        setPointsStr('')
                        return
                      }
                      if (!d.valid || pointsStr.trim() === '') {
                        setPointsStr(String(clampPoints(pointsToAdd, maxWholePoints)))
                        return
                      }
                      const v = clampPoints(d.pts, maxWholePoints)
                      setPointsToAdd(v)
                      setPointsStr(String(v))
                    }}
                    className="shrink-0 w-full rounded-lg border-2 border-b-4 border-zinc-600 border-b-zinc-900 bg-zinc-900/90 px-2 py-1.5 text-center font-mono text-base font-black tabular-nums text-amber-100 shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)] outline-none ring-1 ring-zinc-500/30 placeholder:text-zinc-600 focus:border-amber-500/50 focus:ring-amber-400/30"
                  />
                  {!pointsDraft.valid && pointsStr.trim() !== '' ? (
                    <p className="shrink-0 text-center text-[9px] font-black uppercase text-rose-400">
                      Whole numbers only
                    </p>
                  ) : null}

                  {purchasePreview && previewPoints >= 1 ? (
                    <div className="shrink-0 rounded-lg border-2 border-amber-500/40 border-b-4 border-b-amber-950 bg-linear-to-b from-amber-950/40 to-black/90 px-2 py-1.5 shadow-[0_3px_0_rgba(120,53,15,0.65)] ring-1 ring-amber-400/25">
                      <p className="text-center font-mono text-xs font-black text-amber-100">
                        +{purchasePreview.fuelAdd.toFixed(2)}{' '}
                        <span className="text-[10px] uppercase text-amber-400/80">
                          pts
                        </span>
                        <span className="mx-0.5 text-amber-600">→</span>~
                        {formatDistanceShort(purchasePreview.approxMeters)}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                        <span>
                          Cost{' '}
                          <span className="font-mono text-amber-200">
                            {purchasePreview.spendUgx.toLocaleString()}
                          </span>
                        </span>
                        <span className="text-zinc-700">|</span>
                        <span>
                          After{' '}
                          <span className="font-mono text-emerald-400">
                            {purchasePreview.balanceAfter.toLocaleString()}
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={!canPayPoints}
                    onClick={onPaySubmit}
                    className={`${gameArcadeBtn} shrink-0 border-lime-500/60 border-b-[5px] border-b-lime-950 bg-linear-to-b from-lime-400 via-lime-500 to-lime-700 py-2 text-xs text-lime-950 shadow-[0_5px_0_rgba(54,83,20,0.95)] active:border-b-2 active:shadow-[0_2px_0_rgba(54,83,20,0.95)] disabled:translate-y-0 disabled:border-b-[5px] disabled:opacity-40 disabled:shadow-[0_5px_0_rgba(54,83,20,0.95)]`}
                  >
                    {purchasePreview && purchasePreview.spendUgx > 0
                      ? `Pay ${purchasePreview.spendUgx.toLocaleString()} UGX`
                      : 'Pay'}
                  </button>

                  <RefuelSectionTitle>Quick buy</RefuelSectionTitle>
                  <div className="grid shrink-0 grid-cols-4 gap-1">
                    {FUEL_POINT_PRESETS.map((pts) => {
                      const capped = Math.min(pts, maxWholePoints)
                      const p = previewFuelPurchase(
                        capped * UGX_PER_FUEL_UNIT,
                        money,
                        fuel,
                      )
                      const title = `${capped} pts · UGX ${p.spendUgx.toLocaleString()}`
                      return (
                        <button
                          key={pts}
                          type="button"
                          title={title}
                          onClick={() => buyWholePoints(pts)}
                          disabled={!canRefuel || capped < 1 || p.spendUgx <= 0}
                          className={`${gameArcadeBtn} border-fuchsia-600/45 border-b-4 border-b-fuchsia-950 bg-linear-to-b from-fuchsia-800/80 to-fuchsia-950 px-1 py-1.5 text-[10px] text-fuchsia-100 shadow-[0_4px_0_rgba(74,4,78,0.85)] active:border-b-2 active:shadow-[0_2px_0_rgba(74,4,78,0.85)] disabled:opacity-35`}
                        >
                          +{pts}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={!canRefuel || fillPreview.spendUgx <= 0}
                    onClick={() => {
                      buyFuel(Number.MAX_SAFE_INTEGER)
                      if (maxWholePoints >= 1) {
                        setPointsToAdd(maxWholePoints)
                        setPointsStr(String(maxWholePoints))
                      }
                    }}
                    title={
                      fillPreview.spendUgx > 0
                        ? `Pay UGX ${fillPreview.spendUgx.toLocaleString()} to fill remaining space`
                        : undefined
                    }
                    className={`${gameArcadeBtn} shrink-0 border-sky-500/50 border-b-4 border-b-sky-950 bg-linear-to-b from-sky-500 to-sky-800 py-1.5 text-[10px] text-sky-50 shadow-[0_4px_0_rgba(8,47,73,0.9)] active:border-b-2 active:shadow-[0_2px_0_rgba(8,47,73,0.9)] disabled:opacity-35`}
                  >
                    Fill —{' '}
                    {fillPreview.spendUgx > 0
                      ? `${fillPreview.spendUgx.toLocaleString()} UGX`
                      : '—'}
                  </button>
                  <p className="shrink-0 text-center text-[7px] font-bold uppercase leading-tight tracking-wider text-zinc-600">
                    × {UGX_PER_FUEL_UNIT.toLocaleString()} UGX/pt · capped by tank and
                    wallet
                  </p>
                </div>
              )}
            </div>
            </div>
          </div>
        </>
      ) : null}

      {repairOpen ? (
        <>
          <button
            type="button"
            aria-label="Close repair"
            className="pointer-events-auto fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px]"
            onClick={() => {
              if (!repairMandatory) setRepairOpen(false)
            }}
          />
          <div
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4"
            style={{
              paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
            }}
          >
            <div
              className="pointer-events-auto flex max-h-[min(90dvh,680px)] w-full max-w-[380px] flex-col overflow-hidden rounded-2xl border-2 border-teal-500/35 bg-linear-to-b from-teal-950/95 via-zinc-950 to-black shadow-[0_0_48px_rgba(45,212,191,0.12),0_16px_48px_rgba(0,0,0,0.65)] ring-2 ring-teal-400/15"
              role="dialog"
              aria-modal="true"
              aria-labelledby="repair-modal-title"
            >
              <div className="relative shrink-0 bg-linear-to-r from-teal-600/25 via-teal-500/10 to-transparent px-3 py-2">
                <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-teal-300/50 to-transparent" />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-teal-400/40 bg-teal-950/80">
                      <WrenchIcon className="h-5 w-5 text-teal-200" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-teal-200/70">
                        Workshop
                      </p>
                      <h2
                        id="repair-modal-title"
                        className="text-base font-black uppercase italic tracking-wide text-teal-100 drop-shadow-[0_2px_0_rgba(0,0,0,0.85)]"
                      >
                        Repair bike
                      </h2>
                    </div>
                  </div>
                  {repairMandatory ? (
                    <span className="shrink-0 rounded-md border border-red-500/50 bg-red-950/90 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-red-200">
                      Required
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRepairOpen(false)}
                      className={`${gameArcadeBtn} border-rose-700/80 border-b-4 border-b-rose-950 bg-linear-to-b from-rose-600 to-rose-900 px-2.5 py-1 text-base leading-none text-rose-100 shadow-[0_4px_0_rgba(69,10,10,0.9)] active:border-b-2 active:shadow-[0_2px_0_rgba(69,10,10,0.9)]`}
                      aria-label="Close"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {repairMandatory ? (
                <div className="shrink-0 border-b border-red-600/45 bg-red-950/85 px-3 py-2">
                  <p className="text-center text-[10px] font-black uppercase leading-snug tracking-wide text-red-100">
                    Breakdown — ride is stopped and the city is frozen. Repair above{' '}
                    {CONDITION_BROKEN_AT}% to continue.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5 overflow-hidden px-3 pb-3 pt-1.5 text-left">
                <div className="grid shrink-0 grid-cols-2 gap-1.5">
                  <div className="rounded-lg border-2 border-teal-600/35 border-b-4 border-b-teal-950 bg-linear-to-b from-teal-900/50 to-black/80 px-2 py-1.5 shadow-[0_3px_0_rgba(15,118,110,0.75)] ring-1 ring-teal-400/15">
                    <p className="text-[7px] font-black uppercase tracking-widest text-teal-300/80">
                      Condition max
                    </p>
                    <p className="font-mono text-base font-black tabular-nums leading-tight text-teal-100">
                      {CONDITION_MAX}%
                    </p>
                    <p className="mt-0.5 text-[7px] font-bold uppercase leading-tight text-teal-400/70">
                      {UGX_PER_CONDITION_UNIT.toLocaleString()} UGX = +1 pt
                    </p>
                  </div>
                  <div className="rounded-lg border-2 border-amber-600/40 border-b-4 border-b-amber-950 bg-linear-to-b from-amber-900/40 to-black/80 px-2 py-1.5 shadow-[0_3px_0_rgba(120,53,15,0.8)] ring-1 ring-amber-400/20">
                    <p className="text-[7px] font-black uppercase tracking-widest text-amber-300/80">
                      Wallet
                    </p>
                    <p className="font-mono text-xs font-black leading-tight tabular-nums text-amber-100">
                      {money.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[7px] font-bold uppercase text-amber-500/75">
                      UGX
                    </p>
                  </div>
                </div>

                <div className="shrink-0 rounded-lg border-2 border-emerald-600/35 border-b-4 border-b-emerald-950 bg-linear-to-b from-emerald-950/60 to-black/85 px-2 py-1.5 shadow-[0_3px_0_rgba(6,78,59,0.75)] ring-1 ring-emerald-400/15">
                  <p className="text-[7px] font-black uppercase tracking-[0.15em] text-emerald-400/85">
                    Can still restore
                  </p>
                  <p className="font-mono text-sm font-black leading-tight text-emerald-100">
                    {(Math.round((CONDITION_MAX - condNorm) * 10) / 10).toFixed(1)}{' '}
                    <span className="text-xs font-bold text-emerald-400/90">pts</span>
                  </p>
                  {maxUgxRepair > 0 ? (
                    <p className="mt-0.5 text-[8px] font-bold uppercase leading-tight text-emerald-300/75">
                      Full fix cap{' '}
                      <span className="font-mono text-emerald-100">
                        UGX {maxUgxRepair.toLocaleString()}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[9px] font-black uppercase text-zinc-500">
                      Bike mint
                    </p>
                  )}
                </div>

                {!canRepair ? (
                  <div className="shrink-0 rounded-lg border-2 border-zinc-600 bg-zinc-950/90 px-2 py-3 text-center">
                    <p className="text-xs font-black uppercase italic tracking-wide text-zinc-400">
                      {maxUgxRepair <= 0 ? 'Condition full' : 'No cash'}
                    </p>
                    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                      {maxUgxRepair <= 0
                        ? 'Ride on!'
                        : 'Earn UGX to repair'}
                    </p>
                  </div>
                ) : repairPartialOnly ? (
                  <div className="flex shrink-0 flex-col gap-1">
                    <p className="text-center text-[9px] font-bold uppercase tracking-wide text-teal-200/80">
                      Partial repair only
                    </p>
                    <button
                      type="button"
                      onClick={() => buyRepair(maxUgxRepair)}
                      className={`${gameArcadeBtn} w-full border-cyan-500/50 border-b-[5px] border-b-cyan-950 bg-linear-to-b from-cyan-500 to-cyan-800 py-2 text-xs text-cyan-950 shadow-[0_5px_0_rgba(8,51,68,0.9)] active:border-b-2 active:shadow-[0_2px_0_rgba(8,51,68,0.9)]`}
                    >
                      Pay {maxUgxRepair.toLocaleString()} UGX
                      <span className="mt-0.5 block text-[9px] font-mono font-black normal-case tracking-normal">
                        +{(maxUgxRepair / UGX_PER_CONDITION_UNIT).toFixed(2)} pts
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <RefuelSectionTitle>Repair load</RefuelSectionTitle>
                    <p className="shrink-0 text-center text-[8px] font-bold uppercase leading-tight tracking-wide text-zinc-500">
                      Slide left · less repair · lower cost
                    </p>
                    {maxWholeRepairPoints >= 1 ? (
                      <div className="shrink-0 rounded-lg border-2 border-violet-600/30 border-b-4 border-b-violet-950 bg-linear-to-b from-violet-950/50 to-black/90 px-2 py-1.5 shadow-[0_3px_0_rgba(49,46,129,0.75)] ring-1 ring-violet-400/15">
                        <div className="flex items-center justify-between font-mono text-xs font-black text-violet-200">
                          <span className="text-[8px] font-black uppercase tracking-widest text-violet-400/90">
                            Points
                          </span>
                          <span className="tabular-nums">
                            {previewRepairPts}{' '}
                            <span className="text-violet-500/80">/</span>{' '}
                            {maxWholeRepairPoints}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={maxWholeRepairPoints}
                          step={1}
                          value={committedRepairPoints}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setRepairPointsToAdd(v)
                            setRepairPointsStr(String(v))
                          }}
                          className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-black/60 accent-violet-400 ring-1 ring-inset ring-violet-500/25 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-teal-300 [&::-webkit-slider-thumb]:bg-teal-400"
                        />
                      </div>
                    ) : null}

                    <RefuelSectionTitle>Manual entry</RefuelSectionTitle>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={`1 – ${maxWholeRepairPoints}`}
                      value={repairPointsStr}
                      onChange={(e) =>
                        setRepairPointsStr(e.target.value.replace(/[^\d,]/g, ''))
                      }
                      onBlur={() => {
                        const d = parseWholePoints(repairPointsStr)
                        if (maxWholeRepairPoints < 1) {
                          setRepairPointsStr('')
                          return
                        }
                        if (!d.valid || repairPointsStr.trim() === '') {
                          setRepairPointsStr(
                            String(
                              clampPoints(
                                repairPointsToAdd,
                                maxWholeRepairPoints,
                              ),
                            ),
                          )
                          return
                        }
                        const v = clampPoints(d.pts, maxWholeRepairPoints)
                        setRepairPointsToAdd(v)
                        setRepairPointsStr(String(v))
                      }}
                      className="shrink-0 w-full rounded-lg border-2 border-b-4 border-zinc-600 border-b-zinc-900 bg-zinc-900/90 px-2 py-1.5 text-center font-mono text-base font-black tabular-nums text-teal-100 shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)] outline-none ring-1 ring-zinc-500/30 placeholder:text-zinc-600 focus:border-teal-500/50 focus:ring-teal-400/30"
                    />
                    {!repairPointsDraft.valid && repairPointsStr.trim() !== '' ? (
                      <p className="shrink-0 text-center text-[9px] font-black uppercase text-rose-400">
                        Whole numbers only
                      </p>
                    ) : null}

                    {repairPurchasePreview && previewRepairPts >= 1 ? (
                      <div className="shrink-0 rounded-lg border-2 border-teal-500/40 border-b-4 border-b-teal-950 bg-linear-to-b from-teal-950/40 to-black/90 px-2 py-1.5 shadow-[0_3px_0_rgba(15,118,110,0.65)] ring-1 ring-teal-400/25">
                        <p className="text-center font-mono text-xs font-black text-teal-100">
                          +{repairPurchasePreview.conditionAdd.toFixed(2)}{' '}
                          <span className="text-[10px] uppercase text-teal-400/80">
                            % condition
                          </span>
                        </p>
                        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                          <span>
                            Cost{' '}
                            <span className="font-mono text-teal-200">
                              {repairPurchasePreview.spendUgx.toLocaleString()}
                            </span>
                          </span>
                          <span className="text-zinc-700">|</span>
                          <span>
                            After{' '}
                            <span className="font-mono text-emerald-400">
                              {repairPurchasePreview.balanceAfter.toLocaleString()}
                            </span>
                          </span>
                        </div>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      disabled={!canPayRepairPoints}
                      onClick={onRepairPaySubmit}
                      className={`${gameArcadeBtn} shrink-0 border-lime-500/60 border-b-[5px] border-b-lime-950 bg-linear-to-b from-lime-400 via-lime-500 to-lime-700 py-2 text-xs text-lime-950 shadow-[0_5px_0_rgba(54,83,20,0.95)] active:border-b-2 active:shadow-[0_2px_0_rgba(54,83,20,0.95)] disabled:translate-y-0 disabled:border-b-[5px] disabled:opacity-40 disabled:shadow-[0_5px_0_rgba(54,83,20,0.95)]`}
                    >
                      {repairPurchasePreview && repairPurchasePreview.spendUgx > 0
                        ? `Pay ${repairPurchasePreview.spendUgx.toLocaleString()} UGX`
                        : 'Pay'}
                    </button>

                    <RefuelSectionTitle>Quick buy</RefuelSectionTitle>
                    <div className="grid shrink-0 grid-cols-4 gap-1">
                      {REPAIR_POINT_PRESETS.map((pts) => {
                        const capped = Math.min(pts, maxWholeRepairPoints)
                        const p = previewRepairPurchase(
                          capped * UGX_PER_CONDITION_UNIT,
                          money,
                          condition,
                        )
                        const title = `${capped} pts · UGX ${p.spendUgx.toLocaleString()}`
                        return (
                          <button
                            key={pts}
                            type="button"
                            title={title}
                            onClick={() => buyWholeRepairPoints(pts)}
                            disabled={
                              !canRepair || capped < 1 || p.spendUgx <= 0
                            }
                            className={`${gameArcadeBtn} border-fuchsia-600/45 border-b-4 border-b-fuchsia-950 bg-linear-to-b from-fuchsia-800/80 to-fuchsia-950 px-1 py-1.5 text-[10px] text-fuchsia-100 shadow-[0_4px_0_rgba(74,4,78,0.85)] active:border-b-2 active:shadow-[0_2px_0_rgba(74,4,78,0.85)] disabled:opacity-35`}
                          >
                            +{pts}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={!canRepair || fillRepairPreview.spendUgx <= 0}
                      onClick={() => {
                        buyRepair(Number.MAX_SAFE_INTEGER)
                        if (maxWholeRepairPoints >= 1) {
                          setRepairPointsToAdd(maxWholeRepairPoints)
                          setRepairPointsStr(String(maxWholeRepairPoints))
                        }
                      }}
                      title={
                        fillRepairPreview.spendUgx > 0
                          ? `Pay UGX ${fillRepairPreview.spendUgx.toLocaleString()} to max condition`
                          : undefined
                      }
                      className={`${gameArcadeBtn} shrink-0 border-sky-500/50 border-b-4 border-b-sky-950 bg-linear-to-b from-sky-500 to-sky-800 py-1.5 text-[10px] text-sky-50 shadow-[0_4px_0_rgba(8,47,73,0.9)] active:border-b-2 active:shadow-[0_2px_0_rgba(8,47,73,0.9)] disabled:opacity-35`}
                    >
                      Full fix —{' '}
                      {fillRepairPreview.spendUgx > 0
                        ? `${fillRepairPreview.spendUgx.toLocaleString()} UGX`
                        : '—'}
                    </button>
                    <p className="shrink-0 text-center text-[7px] font-bold uppercase leading-tight tracking-wider text-zinc-600">
                      × {UGX_PER_CONDITION_UNIT.toLocaleString()} UGX/pt · capped by
                      100% condition and wallet
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
