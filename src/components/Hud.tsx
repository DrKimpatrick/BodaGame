import { useGameStore } from '../store/useGameStore'

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

export function Hud() {
  const money = useGameStore((s) => s.money)
  const fuel = useGameStore((s) => s.fuel)
  const condition = useGameStore((s) => s.condition)
  const speedKmh = useGameStore((s) => s.speedKmh)

  return (
    <div className="pointer-events-none fixed inset-0 z-10 font-sans">
      <div className="absolute left-4 top-4 rounded-lg bg-black/55 px-4 py-3 ring-1 ring-zinc-600/50 backdrop-blur-sm">
        <p className="text-xs font-medium tracking-wide text-zinc-400">Money</p>
        <p className="mt-1 font-mono text-2xl text-amber-300">
          UGX {money.toLocaleString()}
        </p>
      </div>

      <div className="absolute right-4 top-4 rounded-lg bg-black/55 px-4 py-3 ring-1 ring-zinc-600/50 backdrop-blur-sm">
        <StatBar label="Fuel" value={fuel} fillClass="bg-sky-400" />
      </div>

      <div className="absolute bottom-4 left-4 rounded-lg bg-black/55 px-4 py-3 ring-1 ring-zinc-600/50 backdrop-blur-sm">
        <StatBar
          label="Condition"
          value={condition}
          fillClass="bg-emerald-400"
        />
      </div>

      <div className="absolute bottom-4 right-4 rounded-md border border-white/20 bg-black/60 px-4 py-2 text-right font-mono text-sm text-amber-200 shadow-lg backdrop-blur-sm">
        <div className="text-xs uppercase tracking-wide text-amber-100/80">
          Speed
        </div>
        <div className="text-lg font-semibold leading-tight">{speedKmh} KM/H</div>
      </div>
    </div>
  )
}
