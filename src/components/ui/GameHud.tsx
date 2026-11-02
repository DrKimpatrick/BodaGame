import { useEffect, useState } from 'react'
import { DELIVERIES_PER_SHIFT } from '../../roadRules/constants'
import { bikeTelemetry } from '../../roadRules/world/telemetry'
import { emitDriveAction } from '../../input/driveInput'
import { manhattanTravelMeters } from '../../game/passengerJobs'
import { CONDITION_WARN_AT, isBikeBrokenDown, useGameStore } from '../../store/useGameStore'
import { useRoadRulesStore } from '../../store/useRoadRulesStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Bar, SignImg } from './primitives'
import { fmtUgx } from './format'
import { KeyStrip, RideCoach } from './RideGuide'

/**
 * In-ride HUD. Each widget subscribes to only the values it shows, so a km/h change re-renders the
 * speedometer and nothing else.
 */

const WEATHER_LABEL = { clear: '☀️ Day', rain: '🌧️ Rain', dusk: '🌆 Dusk' } as const

function Wallet() {
  const money = useGameStore((s) => s.money)
  const streak = useRoadRulesStore((s) => s.rr?.streak ?? 0)
  return (
    <div className="rounded-2xl bg-black/55 px-3 py-2 ring-1 ring-white/10 backdrop-blur-md">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Cash</p>
      <p className="font-mono text-lg font-black tabular-nums leading-tight text-[#f5c518] sm:text-xl">{fmtUgx(money)}</p>
      {streak >= 2 ? <p className="text-[11px] font-bold text-emerald-300">🔥 Streak {streak}{streak >= 3 ? ' · fares ×1.5' : ''}</p> : null}
    </div>
  )
}

function LifeAndKids() {
  const rr = useRoadRulesStore((s) => s.rr)
  const gentle = useSettingsStore((s) => s.gentle)
  if (!rr) return null
  return (
    <div className="w-44 rounded-2xl bg-black/55 px-3 py-2 ring-1 ring-white/10 backdrop-blur-md sm:w-52">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-zinc-300">
        <span>❤️ Life</span>
        <span className="tabular-nums">{rr.life}</span>
      </div>
      <Bar value={rr.life} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        {rr.kids.map((k) => (
          <div key={k.name} className={k.present ? '' : 'opacity-50'}>
            <p className={`truncate text-[11px] font-bold ${k.present ? 'text-zinc-200' : 'text-zinc-500 line-through'}`}>
              🧒 {k.name}
              {!k.present && gentle ? ' (with relatives)' : ''}
            </p>
            <Bar value={k.care} tone={k.care > 40 ? 'bg-sky-400' : 'bg-rose-500'} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ShiftChip() {
  const shift = useRoadRulesStore((s) => s.rr?.shift)
  const done = useRoadRulesStore((s) => s.deliveriesThisShift)
  const weather = useGameStore((s) => s.weather)
  const mode = useRoadRulesStore((s) => s.mode)
  if (shift == null) return null
  return (
    <div className="rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-extrabold text-zinc-100 ring-1 ring-white/10 backdrop-blur-md">
      {mode === 'learn' ? '🎓 Learner' : `Shift ${shift}`} · {done}/{DELIVERIES_PER_SHIFT} trips · {WEATHER_LABEL[weather]}
    </div>
  )
}

function JobBanner() {
  const job = useGameStore((s) => s.rideJob)
  const bx = useGameStore((s) => s.bikeMapX)
  const bz = useGameStore((s) => s.bikeMapZ)
  if (!job) return null
  const target = job.phase === 'pickup' ? job.pickup : job.dropoff
  const dist = Math.round(manhattanTravelMeters(bx, bz, target.x, target.z))
  return (
    <div className="flex max-w-[min(92vw,420px)] items-center gap-2 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10 backdrop-blur-md">
      <span className={`h-3 w-3 shrink-0 rounded-full ${job.phase === 'pickup' ? 'bg-rose-500' : 'bg-sky-400'}`} />
      <p className="min-w-0 truncate text-[13px] font-bold text-zinc-100">
        {job.phase === 'pickup' ? 'Pick up at' : 'Drop off at'} <span className="text-white">{target.name}</span>
        <span className="text-zinc-400"> · {dist} m</span>
      </p>
      <span className="shrink-0 font-mono text-[12px] font-black text-emerald-300">{fmtUgx(job.payoutUgx)}</span>
    </div>
  )
}

function Speedo() {
  const kmh = useGameStore((s) => s.speedKmh)
  const limit = bikeTelemetry.limitKmh
  const over = kmh > limit + 3
  const pct = Math.min(1, kmh / 80)
  const r = 30
  const c = 2 * Math.PI * r
  return (
    <div className="relative flex items-center gap-2">
      <SignImg sign={limit === 30 ? 'speed30' : 'speed50'} className="h-10 w-10" label="" />
      <div className={`relative h-[76px] w-[76px] rounded-full bg-black/60 ring-1 backdrop-blur-md ${over ? 'ring-rose-500' : 'ring-white/10'}`}>
        <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-[225deg]">
          <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" strokeDasharray={`${c * 0.75} ${c}`} />
          <circle
            cx="38"
            cy="38"
            r={r}
            fill="none"
            stroke={over ? '#f43f5e' : '#f5c518'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${c * 0.75 * pct} ${c}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono text-2xl font-black tabular-nums leading-none ${over ? 'text-rose-400' : 'text-white'}`}>{kmh}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">km/h</span>
        </div>
      </div>
    </div>
  )
}

function BikeStatus({ onOpenStage }: { onOpenStage: () => void }) {
  // Whole percents: fuel changes every frame while riding, the display only once per percent.
  const fuel = useGameStore((s) => Math.round(s.fuel))
  const condition = useGameStore((s) => Math.round(s.condition))
  const low = fuel < 20 || condition < CONDITION_WARN_AT
  return (
    <button
      type="button"
      onClick={onOpenStage}
      className={`pointer-events-auto w-40 rounded-2xl bg-black/55 px-3 py-2 text-left ring-1 backdrop-blur-md transition hover:bg-black/70 ${low ? 'ring-amber-400 animate-pulse' : 'ring-white/10'}`}
      aria-label="Open fuel and repairs"
    >
      <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
        <span>⛽ Fuel</span>
        <span className="tabular-nums">{fuel}%</span>
      </div>
      <Bar value={fuel} />
      <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold text-zinc-300">
        <span>🔧 Bike</span>
        <span className="tabular-nums">{condition}%</span>
      </div>
      <Bar value={condition} />
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#f5c518]">Fuel &amp; repairs ›</p>
    </button>
  )
}

function RoundBtn({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full text-base ring-1 sm:h-12 sm:w-12 sm:text-xl backdrop-blur-md transition ${active ? 'bg-[#f5c518] text-zinc-950 ring-[#f5c518]' : 'bg-black/55 text-white ring-white/15 hover:bg-black/75'}`}
    >
      {children}
    </button>
  )
}

function Toasts() {
  const toasts = useRoadRulesStore((s) => s.toasts)
  const dismiss = useRoadRulesStore((s) => s.dismissToast)
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), t.tone === 'bad' ? 7000 : 4500))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])
  return (
    <div className="flex w-[min(94vw,440px)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto flex items-start gap-3 rounded-2xl px-3 py-2.5 text-left shadow-xl ring-1 backdrop-blur-md animate-[toastIn_.25s_ease-out] ${
            t.tone === 'bad'
              ? 'bg-rose-950/90 ring-rose-500/60'
              : t.tone === 'good'
                ? 'bg-emerald-950/90 ring-emerald-400/50'
                : 'bg-indigo-950/90 ring-indigo-300/40'
          }`}
        >
          {t.sign ? <SignImg sign={t.sign} className="h-11 w-11" label="" /> : null}
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-extrabold text-white">{t.title}</span>
            <span className="block text-[13px] leading-snug text-zinc-200">{t.body}</span>
            {t.money || t.life ? (
              <span className="mt-1 flex gap-2 text-[12px] font-black">
                {t.money ? <span className={t.money > 0 ? 'text-emerald-300' : 'text-rose-300'}>{t.money > 0 ? '+' : '−'}{fmtUgx(Math.abs(t.money))}</span> : null}
                {t.life ? <span className={t.life > 0 ? 'text-emerald-300' : 'text-rose-300'}>{t.life > 0 ? '+' : ''}{t.life} life</span> : null}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  )
}

function BrokenDownNotice({ onOpenStage }: { onOpenStage: () => void }) {
  const broken = useGameStore((s) => isBikeBrokenDown(s.condition))
  const empty = useGameStore((s) => s.fuel <= 0.0001)
  if (!broken && !empty) return null
  return (
    <div className="pointer-events-auto rounded-2xl bg-amber-950/90 px-4 py-3 text-center ring-1 ring-amber-400/60">
      <p className="font-extrabold text-amber-100">{broken ? 'Your bike has broken down.' : 'Your tank is empty.'}</p>
      <button type="button" onClick={onOpenStage} className="mt-2 rounded-xl bg-[#f5c518] px-4 py-2 font-extrabold text-zinc-950">
        {broken ? 'Pay for repairs' : 'Buy fuel'}
      </button>
    </div>
  )
}

export function GameHud({ onPause, onOpenStage, onHelp }: { onPause: () => void; onOpenStage: () => void; onHelp: () => void }) {
  const headlight = useGameStore((s) => s.headlight)
  const camera = useSettingsStore((s) => s.camera)
  const muted = useSettingsStore((s) => s.muted)
  const [compact, setCompact] = useState(() => window.innerHeight < 500)
  useEffect(() => {
    const on = () => setCompact(window.innerHeight < 500)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none font-sans">
      {/* Top row */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-[max(0.75rem,env(safe-area-inset-left))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex flex-col gap-2">
          <Wallet />
          {!compact ? <LifeAndKids /> : null}
        </div>
        <div className="hidden flex-col items-center gap-2 md:flex">
          <ShiftChip />
          <JobBanner />
          <Toasts />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1.5 sm:gap-2">
            <RoundBtn label={muted ? 'Unmute (M)' : 'Mute (M)'} onClick={() => emitDriveAction('mute')} active={muted}>
              {muted ? '🔇' : '🔊'}
            </RoundBtn>
            <RoundBtn label="How to ride (?)" onClick={onHelp}>
              <span className="font-black">?</span>
            </RoundBtn>
            <RoundBtn label="Camera view (V)" onClick={() => emitDriveAction('camera')} active={camera === 'helmet'}>
              {camera === 'helmet' ? '🪖' : '🎥'}
            </RoundBtn>
            <RoundBtn label="Headlight (L)" onClick={() => emitDriveAction('headlight')} active={headlight}>
              💡
            </RoundBtn>
            <RoundBtn label="Pause (Esc)" onClick={onPause}>
              ⏸
            </RoundBtn>
          </div>
          <Speedo />
          {compact ? <LifeAndKids /> : null}
        </div>
      </div>
      {/* Phones: centre column under the top row */}
      <div className="absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+9.5rem)] flex flex-col items-center gap-2 px-3 md:hidden landscape:top-[max(0.75rem,env(safe-area-inset-top))] landscape:left-1/2 landscape:w-[44vw] landscape:-translate-x-1/2 landscape:px-0">
        <ShiftChip />
        <JobBanner />
        <Toasts />
      </div>
      <div className="absolute inset-x-0 top-1/3 flex justify-center">
        <BrokenDownNotice onOpenStage={onOpenStage} />
      </div>
      {/* Bike status: bottom-left on laptops; above the steering buttons on touch screens */}
      <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] [@media(pointer:coarse)]:bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+9rem)] [@media(pointer:coarse)_and_(max-height:500px)]:bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+7rem)]">
        <BikeStatus onOpenStage={onOpenStage} />
      </div>
      <KeyStrip />
      <RideCoach />
    </div>
  )
}
