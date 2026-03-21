import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  approxMetersForFuelPoints,
  formatDistanceShort,
  FUEL_MAX,
  maxUgxToFillRemaining,
  normalizeTankFuel,
  previewFuelPurchase,
  UGX_PER_FUEL_UNIT,
  useGameStore,
} from '../store/useGameStore'

/** Quick-buy: whole tank points (capped by room + wallet). */
const FUEL_POINT_PRESETS = [5, 10, 25, 50] as const

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

/** Display sweep 0–max km/h (needle pegs above). */
const SPEEDO_MAX_KMH = 140

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

function polarToSvg(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  }
}

/** Semicircular racing speedometer: arc, ticks, colored zones, needle. */
function RacingSpeedometer({ speedKmh }: { speedKmh: number }) {
  const cx = 100
  const cy = 92
  const rOuter = 78
  const rTicks = 68
  const rNeedle = 62
  const startDeg = -135
  const endDeg = 45
  const sweep = endDeg - startDeg
  const clamped = Math.min(
    Math.max(0, speedKmh),
    SPEEDO_MAX_KMH * 1.08,
  )
  const t = Math.min(clamped / SPEEDO_MAX_KMH, 1)
  const needleDeg = startDeg + t * sweep
  const tip = polarToSvg(cx, cy, rNeedle, needleDeg)
  const hubR = 5

  const majorEvery = 20
  const majors: number[] = []
  for (let v = 0; v <= SPEEDO_MAX_KMH; v += majorEvery) {
    majors.push(v)
  }

  const arcPath = (r: number, a0: number, a1: number) => {
    const p0 = polarToSvg(cx, cy, r, a0)
    const p1 = polarToSvg(cx, cy, r, a1)
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`
  }

  const zoneRedStart = startDeg + (100 / SPEEDO_MAX_KMH) * sweep
  const zoneAmberStart = startDeg + (80 / SPEEDO_MAX_KMH) * sweep

  return (
    <div
      className="relative mx-auto w-full max-w-[200px] select-none pb-7"
      role="img"
      aria-label={`Speed ${speedKmh} kilometres per hour`}
    >
      <svg
        viewBox="0 0 200 100"
        className="h-[100px] w-full drop-shadow-[0_4px_16px_rgba(0,0,0,0.45)]"
        aria-hidden
      >
        <defs>
          <linearGradient id="speedoFace" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#14151a" />
            <stop offset="100%" stopColor="#0a0a0c" />
          </linearGradient>
          <linearGradient id="speedoRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3f3f46" />
            <stop offset="50%" stopColor="#18181b" />
            <stop offset="100%" stopColor="#52525b" />
          </linearGradient>
        </defs>

        <path
          d={arcPath(rOuter + 4, startDeg, endDeg)}
          fill="none"
          stroke="url(#speedoRim)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d={arcPath(rOuter, startDeg, endDeg)}
          fill="none"
          stroke="#27272a"
          strokeWidth="2"
        />
        <path
          d={arcPath(rOuter - 6, startDeg, zoneAmberStart)}
          fill="none"
          stroke="#14532d"
          strokeWidth="8"
          strokeLinecap="butt"
          opacity="0.75"
        />
        <path
          d={arcPath(rOuter - 6, zoneAmberStart, zoneRedStart)}
          fill="none"
          stroke="#ca8a04"
          strokeWidth="8"
          strokeLinecap="butt"
          opacity="0.85"
        />
        <path
          d={arcPath(rOuter - 6, zoneRedStart, endDeg)}
          fill="none"
          stroke="#b91c1c"
          strokeWidth="8"
          strokeLinecap="butt"
          opacity="0.9"
        />

        {majors.map((v) => {
          const u = v / SPEEDO_MAX_KMH
          const deg = startDeg + u * sweep
          const outer = polarToSvg(cx, cy, rTicks + 6, deg)
          const inner = polarToSvg(cx, cy, rTicks - 2, deg)
          const label = polarToSvg(cx, cy, rTicks - 18, deg)
          return (
            <g key={v}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#e4e4e7"
                strokeWidth={v % 40 === 0 ? 2.2 : 1.2}
                strokeLinecap="round"
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-zinc-400"
                style={{
                  fontSize: v % 40 === 0 ? 11 : 9,
                  fontFamily: 'ui-monospace, monospace',
                  fontWeight: v % 40 === 0 ? 700 : 500,
                }}
              >
                {v}
              </text>
            </g>
          )
        })}

        {[10, 30, 50, 70, 90, 110, 130].map((v) => {
          const u = v / SPEEDO_MAX_KMH
          const deg = startDeg + u * sweep
          const outer = polarToSvg(cx, cy, rTicks + 3, deg)
          const inner = polarToSvg(cx, cy, rTicks, deg)
          return (
            <line
              key={v}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#71717a"
              strokeWidth="1"
              strokeLinecap="round"
            />
          )
        })}

        <line
          x1={cx}
          y1={cy}
          x2={tip.x}
          y2={tip.y}
          stroke="#fbbf24"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.6))' }}
        />
        <circle cx={cx} cy={cy} r={hubR} fill="#18181b" stroke="#fbbf24" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={2} fill="#fbbf24" />
      </svg>
      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 translate-y-1 flex-col items-center">
        <span className="font-mono text-lg font-bold tabular-nums tracking-tight text-amber-300">
          {speedKmh}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
          km/h
        </span>
      </div>
    </div>
  )
}

function TankBar({
  label,
  fuel,
  fillClass,
  sub,
}: {
  label: string
  fuel: number
  /** Used when fuel is above warn thresholds. */
  fillClass: string
  sub?: string
}) {
  const level = fuelLowLevel(fuel)
  const pct = Math.max(0, Math.min(100, (fuel / FUEL_MAX) * 100))
  const fillByLevel =
    level === 'critical'
      ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.45)]'
      : level === 'low'
        ? 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.35)]'
        : fillClass
  const trackRing =
    level === 'critical'
      ? 'ring-red-500/55'
      : level === 'low'
        ? 'ring-orange-400/50'
        : 'ring-zinc-600/60'

  return (
    <div className="flex min-w-[140px] flex-col gap-1 text-left">
      <span className="text-xs font-medium tracking-wide text-zinc-300">
        {label}
      </span>
      <div
        className={`h-2 w-full overflow-hidden rounded-full bg-zinc-800 ring-1 transition-shadow duration-200 ${trackRing}`}
      >
        <div
          className={`h-full rounded-full transition-[width,background-color,box-shadow] duration-200 ${fillByLevel}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`font-mono text-sm ${
          level === 'critical'
            ? 'text-red-300'
            : level === 'low'
              ? 'text-orange-200'
              : 'text-zinc-100'
        }`}
      >
        {tankReadout(fuel)}
      </span>
      {sub ? (
        <span
          className={`text-[10px] leading-tight ${
            level === 'critical'
              ? 'text-red-400/90'
              : level === 'low'
                ? 'text-orange-300/85'
                : 'text-zinc-500'
          }`}
        >
          {sub}
        </span>
      ) : null}
    </div>
  )
}

function StatBar({
  label,
  value,
  fillClass,
}: {
  label: string
  value: number
  fillClass: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex min-w-[140px] flex-col gap-1 text-left">
      <span className="text-xs font-medium tracking-wide text-zinc-300">
        {label}
      </span>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-600/60">
        <div
          className={`h-full rounded-full transition-[width] duration-150 ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-sm text-zinc-100">{pct.toFixed(0)}</span>
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

  const [refuelOpen, setRefuelOpen] = useState(false)
  /** Whole tank points to buy (slider + Pay). Starts at max when you open Refuel. */
  const [pointsToAdd, setPointsToAdd] = useState(1)
  const [pointsStr, setPointsStr] = useState('1')

  const maxUgxTank = maxUgxToFillRemaining(fuel)
  const canRefuel = maxUgxTank > 0 && money > 0

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
    setRefuelOpen(true)
  }, [maxUgxTank])

  useEffect(() => {
    if (!refuelOpen) return
    if (maxWholePoints < 1) {
      setPointsToAdd(0)
      return
    }
    setPointsToAdd((p) => clampPoints(p, maxWholePoints))
  }, [refuelOpen, maxWholePoints])

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

  const canPayPoints =
    previewPoints >= 1 &&
    purchasePreview != null &&
    purchasePreview.spendUgx > 0

  const rangeLeftM = formatDistanceShort(approxMetersForFuelPoints(fuel))

  const fillPreview = useMemo(
    () => previewFuelPurchase(Number.MAX_SAFE_INTEGER, money, fuel),
    [money, fuel],
  )

  const partialOnly =
    canRefuel && maxWholePoints < 1 && maxUgxTank > 0

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

  useEffect(() => {
    if (!refuelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRefuelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [refuelOpen])

  const fuelWarn = fuelLowLevel(fuel)

  return (
    <div className="pointer-events-none fixed inset-0 z-10 font-sans">
      <div className="absolute left-4 top-4 max-w-[min(100vw-2rem,280px)] rounded-lg bg-black/55 px-4 py-3 ring-1 ring-zinc-600/50 backdrop-blur-sm">
        <p className="text-xs font-medium tracking-wide text-zinc-400">Wallet</p>
        <p className="mt-1 font-mono text-2xl text-amber-300">
          UGX {money.toLocaleString()}
        </p>
      </div>

      <div
        className="absolute z-10 flex items-center justify-center"
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
      </div>

      <div className="absolute bottom-4 left-4 rounded-lg bg-black/55 px-4 py-3 ring-1 ring-zinc-600/50 backdrop-blur-sm">
        <StatBar
          label="Condition"
          value={condition}
          fillClass="bg-emerald-400"
        />
      </div>

      <div className="pointer-events-auto absolute bottom-4 right-4 z-10 flex w-[min(100vw-2rem,260px)] flex-col gap-2">
        <div className="rounded-lg border border-white/15 bg-black/65 px-3 py-3 shadow-lg backdrop-blur-md">
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
              Speed
            </div>
            <RacingSpeedometer speedKmh={speedKmh} />
          </div>
          <div className="mt-3 border-t border-white/10 pt-3">
            <TankBar
              label="Fuel"
              fuel={fuel}
              fillClass="bg-sky-400"
              sub={`~${rangeLeftM} range left (est.)`}
            />
          </div>
          <button
            type="button"
            onClick={openRefuel}
            className="mt-3 w-full rounded-md bg-sky-500/35 py-2.5 text-sm font-semibold text-sky-50 ring-1 ring-sky-400/40 transition hover:bg-sky-500/48"
          >
            Refuel
          </button>
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
        </div>
      </div>

      {refuelOpen ? (
        <>
          <button
            type="button"
            aria-label="Close refuel"
            className="pointer-events-auto fixed inset-0 z-20 bg-black/45"
            onClick={() => setRefuelOpen(false)}
          />
          <div
            className="pointer-events-auto fixed z-30 flex max-h-[min(520px,55vh)] w-[min(100vw-2rem,320px)] flex-col overflow-hidden rounded-xl border border-white/20 bg-[#12141a] shadow-2xl ring-1 ring-white/10"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))', right: 'max(1rem, env(safe-area-inset-right))' }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2.5">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
                Refuel
              </h2>
              <button
                type="button"
                onClick={() => setRefuelOpen(false)}
                className="rounded-md px-2 py-1 text-lg leading-none text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-left">
              <p className="text-[11px] leading-snug text-zinc-500">
                Tank capacity {FUEL_MAX} (points). {UGX_PER_FUEL_UNIT.toLocaleString()}{' '}
                UGX = +1 point. Wallet:{' '}
                <span className="font-mono text-zinc-300">
                  UGX {money.toLocaleString()}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-zinc-400">
                Room in tank:{' '}
                <span className="font-mono text-zinc-200">
                  {(Math.round((FUEL_MAX - normalizeTankFuel(fuel)) * 10) / 10).toFixed(1)} pts
                </span>
                {' · '}
                {maxUgxTank > 0 ? (
                  <>
                    Up to{' '}
                    <span className="font-mono text-sky-300/90">
                      UGX {maxUgxTank.toLocaleString()}
                    </span>{' '}
                    to fill completely
                  </>
                ) : (
                  <span className="text-zinc-500">Tank full — no more fuel fits.</span>
                )}
              </p>

              {!canRefuel ? (
                <p className="mt-3 rounded-md bg-white/5 px-2 py-2 text-sm text-zinc-400">
                  {maxUgxTank <= 0
                    ? 'Tank is full.'
                    : 'No cash — earn UGX to refuel.'}
                </p>
              ) : partialOnly ? (
                <>
                  <p className="mt-3 text-[11px] text-zinc-400">
                    Not enough room for a full point — one partial top-up only:
                  </p>
                  <button
                    type="button"
                    onClick={() => buyFuel(maxUgxTank)}
                    className="mt-2 w-full rounded-md bg-sky-500/45 py-2 text-sm font-semibold text-white ring-1 ring-sky-400/45"
                  >
                    Pay UGX {maxUgxTank.toLocaleString()} (+
                    {(maxUgxTank / UGX_PER_FUEL_UNIT).toFixed(2)} pts)
                  </button>
                </>
              ) : (
                <>
                  <label className="mt-3 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Fuel to add (tank points)
                  </label>
                  <p className="mt-0.5 text-[10px] text-zinc-600">
                    Starts at the max you can buy. Slide{' '}
                    <span className="text-zinc-400">left</span> to buy less — cost
                    goes down with fewer points.
                  </p>
                  {maxWholePoints >= 1 ? (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>Points</span>
                        <span className="font-mono text-sky-300/90">
                          {previewPoints} / {maxWholePoints}
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
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-sky-400"
                      />
                    </div>
                  ) : null}

                  <label className="mt-3 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Or type points (whole numbers)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={`1–${maxWholePoints}`}
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
                    className="mt-1 w-full rounded-md border border-white/15 bg-zinc-900/80 px-2.5 py-2 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500/50"
                  />
                  {!pointsDraft.valid && pointsStr.trim() !== '' ? (
                    <p className="mt-1 text-[11px] text-rose-400/90">
                      Enter a valid whole number of points.
                    </p>
                  ) : null}

                  {purchasePreview && previewPoints >= 1 ? (
                    <div className="mt-2 rounded-md bg-white/5 px-2.5 py-2 text-[11px] leading-snug text-zinc-400">
                      <span className="text-sky-300/90">
                        +{purchasePreview.fuelAdd.toFixed(2)} pts → ~
                        {formatDistanceShort(purchasePreview.approxMeters)} range
                      </span>
                      <br />
                      <span className="text-zinc-500">Cost </span>
                      <span className="font-mono text-zinc-200">
                        UGX {purchasePreview.spendUgx.toLocaleString()}
                      </span>
                      <span className="text-zinc-500"> · balance </span>
                      <span className="font-mono text-emerald-300/90">
                        UGX {purchasePreview.balanceAfter.toLocaleString()}
                      </span>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={!canPayPoints}
                    onClick={onPaySubmit}
                    className="mt-2 w-full rounded-md bg-sky-500/45 py-2 text-sm font-semibold text-white ring-1 ring-sky-400/45 transition hover:bg-sky-500/58 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {purchasePreview && purchasePreview.spendUgx > 0
                      ? `Pay UGX ${purchasePreview.spendUgx.toLocaleString()}`
                      : 'Pay'}
                  </button>

                  <div className="mt-2 flex flex-wrap gap-1.5">
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
                          className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-medium text-zinc-100 ring-1 ring-white/15 transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-35"
                          disabled={!canRefuel || capped < 1 || p.spendUgx <= 0}
                        >
                          +{pts} pts
                        </button>
                      )
                    })}
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
                      className="rounded-md bg-sky-500/25 px-2.5 py-1.5 text-xs font-semibold text-sky-100 ring-1 ring-sky-400/35 transition hover:bg-sky-500/35 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Fill tank
                      {fillPreview.spendUgx > 0 ? (
                        <span className="ml-1 font-mono text-[10px] opacity-90">
                          (UGX {fillPreview.spendUgx.toLocaleString()})
                        </span>
                      ) : null}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-zinc-600">
                    +N pts charges N × {UGX_PER_FUEL_UNIT.toLocaleString()} UGX (capped
                    by tank space and wallet). Fill tops up exactly what fits.
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
