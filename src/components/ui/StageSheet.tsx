import {
  FUEL_MAX,
  maxUgxToFillRemaining,
  maxUgxToRepairRemaining,
  UGX_PER_CONDITION_UNIT,
  UGX_PER_FUEL_UNIT,
  useGameStore,
} from '../../store/useGameStore'
import { playCashRegister } from '../../roadRules/fx/sfx'
import { Bar, Button, Modal } from './primitives'
import { fmtUgx } from './format'

/** Fuel station + mechanic: buy fuel and repairs from the wallet. */
export function StageSheet({ onClose }: { onClose: () => void }) {
  const money = useGameStore((s) => s.money)
  const fuel = useGameStore((s) => s.fuel)
  const condition = useGameStore((s) => s.condition)
  const buyFuel = useGameStore((s) => s.buyFuel)
  const buyRepair = useGameStore((s) => s.buyRepair)
  const ledger = useGameStore((s) => s.ledger)

  const fullTank = maxUgxToFillRemaining(fuel)
  const fullRepair = maxUgxToRepairRemaining(condition)
  const fuelOptions = [2_000, 5_000, fullTank].filter((v, i, a) => v > 0 && a.indexOf(v) === i && v <= fullTank)
  const repairOptions = [2_000, 5_000, fullRepair].filter((v, i, a) => v > 0 && a.indexOf(v) === i && v <= fullRepair)

  const pay = (fn: (n: number) => void, n: number) => {
    fn(n)
    playCashRegister()
  }

  return (
    <Modal labelledBy="stage-title">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="stage-title" className="text-2xl font-black">Fuel &amp; repairs</h2>
        <span className="font-mono text-lg font-black text-[#f5c518]">{fmtUgx(money)}</span>
      </div>

      <section className="rounded-2xl bg-white/5 p-4">
        <div className="mb-2 flex items-center justify-between font-bold">
          <span>⛽ Fuel</span>
          <span className="tabular-nums">{Math.round((fuel / FUEL_MAX) * 100)}%</span>
        </div>
        <Bar value={fuel} max={FUEL_MAX} />
        <p className="mt-2 text-sm text-zinc-400">Petrol costs {fmtUgx(UGX_PER_FUEL_UNIT)} per 1% of the tank.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {fuelOptions.length === 0 ? <span className="text-sm text-zinc-400">Tank is full.</span> : null}
          {fuelOptions.map((v) => (
            <Button key={v} tone="ghost" className="flex-1 text-sm" disabled={money < 1} onClick={() => pay(buyFuel, v)}>
              {v === fullTank ? `Fill up · ${fmtUgx(Math.min(v, money))}` : fmtUgx(v)}
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-3 rounded-2xl bg-white/5 p-4">
        <div className="mb-2 flex items-center justify-between font-bold">
          <span>🔧 Bike condition</span>
          <span className="tabular-nums">{Math.round(condition)}%</span>
        </div>
        <Bar value={condition} />
        <p className="mt-2 text-sm text-zinc-400">The mechanic charges {fmtUgx(UGX_PER_CONDITION_UNIT)} per 1%. Potholes and crashes wear the bike.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {repairOptions.length === 0 ? <span className="text-sm text-zinc-400">Bike is in perfect shape.</span> : null}
          {repairOptions.map((v) => (
            <Button key={v} tone="ghost" className="flex-1 text-sm" disabled={money < 1} onClick={() => pay(buyRepair, v)}>
              {v === fullRepair ? `Full service · ${fmtUgx(Math.min(v, money))}` : fmtUgx(v)}
            </Button>
          ))}
        </div>
      </section>

      {ledger.length > 0 ? (
        <details className="mt-3 rounded-2xl bg-white/5 p-4">
          <summary className="cursor-pointer font-bold">Money in and out ({ledger.length})</summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
            {ledger.slice(0, 40).map((t) => (
              <li key={t.id} className="flex justify-between gap-3 border-b border-white/5 py-1">
                <span className="min-w-0 truncate text-zinc-300">{t.label}</span>
                <span className={`shrink-0 font-mono font-bold ${t.kind === 'earn' ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {t.kind === 'earn' ? '+' : '−'}
                  {t.amountUgx.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Button className="mt-5 w-full" onClick={onClose} autoFocus>
        Back to the road
      </Button>
    </Modal>
  )
}
