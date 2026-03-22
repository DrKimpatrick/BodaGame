import { useId, useState } from 'react'
import { useGameStore } from '../store/useGameStore'

type LandingOverlayProps = {
  artSrc: string
  splashImageReady: boolean
  onStart: () => void
}

const ABOUT_TABS = [
  {
    id: 'fuel' as const,
    label: 'Fuel',
    short: 'GAS',
    accent: 'text-emerald-300',
    border: 'border-emerald-500/50',
    glow: 'shadow-[0_0_14px_rgba(52,211,153,0.2)]',
    body: (
      <>
        Your tank drains while you ride. Orange and red warnings mean you’re running low—don’t get
        caught empty. Pull into a fuel stop, pay <span className="font-bold text-amber-200">UGX</span>
        , and fill up so you can keep moving.
      </>
    ),
  },
  {
    id: 'condition' as const,
    label: 'Car condition',
    short: 'HP',
    accent: 'text-orange-300',
    border: 'border-orange-500/45',
    glow: 'shadow-[0_0_14px_rgba(251,146,60,0.18)]',
    body: (
      <>
        Potholes and rough riding wear the bike down. Watch the condition meter—when it gets ugly,
        hit the garage and pay for repairs. Let it hit zero and you’re in{' '}
        <span className="font-bold text-red-300">breakdown</span> territory.
      </>
    ),
  },
  {
    id: 'navigation' as const,
    label: 'Navigation',
    short: 'GPS',
    accent: 'text-sky-300',
    border: 'border-sky-500/45',
    glow: 'shadow-[0_0_14px_rgba(56,189,248,0.2)]',
    body: (
      <>
        Follow the painted line on the road:{' '}
        <span className="font-bold text-red-300">solid red</span> to your pickup, then{' '}
        <span className="font-bold text-sky-300">solid blue</span> to the drop-off. The HUD minimap
        and compass keep you pointed the right way through the grid.
      </>
    ),
  },
  {
    id: 'passengers' as const,
    label: 'Passengers',
    short: 'JOB',
    accent: 'text-violet-300',
    border: 'border-violet-500/45',
    glow: 'shadow-[0_0_14px_rgba(167,139,250,0.2)]',
    body: (
      <>
        You’re a <span className="font-bold text-amber-200">boda boda</span> rider: collect
        passengers, let them on the bike, and deliver them for a fare. Toasts tell you who’s next and
        where to go—chain jobs and stay on the route.
      </>
    ),
  },
  {
    id: 'wallet' as const,
    label: 'Wallet',
    short: '$',
    accent: 'text-amber-300',
    border: 'border-amber-500/50',
    glow: 'shadow-[0_0_14px_rgba(251,191,36,0.22)]',
    body: (
      <>
        Fares pay into your wallet in <span className="font-bold text-amber-200">UGX</span>. Spend
        it on fuel and repairs—balance the grind so you always have enough to finish the next run.
      </>
    ),
  },
]

type TabId = (typeof ABOUT_TABS)[number]['id']

function DecorativeSpeedometer() {
  return (
    <div
      className="rounded-2xl border border-amber-500/45 bg-zinc-950/80 px-3 py-2 shadow-lg ring-1 ring-amber-400/20 backdrop-blur-md"
      aria-hidden
    >
      <p className="mb-0.5 text-center text-[9px] font-black uppercase tracking-[0.2em] text-amber-200/90">
        Speed
      </p>
      <svg viewBox="0 0 100 88" className="mx-auto h-[72px] w-[100px]" aria-hidden>
        <defs>
          <linearGradient id="splash-gauge" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <path
          d="M 14 78 A 50 50 0 0 1 86 78"
          fill="none"
          stroke="url(#splash-gauge)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const t = i / 5
          const a = Math.PI * (1.12 - t * 1.24)
          const cx = 50 + Math.cos(a) * 40
          const cy = 78 + Math.sin(a) * 40
          return <circle key={i} cx={cx} cy={cy} r="1.6" className="fill-zinc-400/90" />
        })}
        <text
          x="50"
          y="26"
          textAnchor="middle"
          className="fill-amber-100/90 text-[11px] font-black"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        >
          km/h
        </text>
        <g className="splash-speed-needle">
          <line
            x1="50"
            y1="78"
            x2="50"
            y2="34"
            className="stroke-amber-300"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="50" cy="78" r="4" className="fill-zinc-800 stroke-amber-500" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  )
}

function SplashWalletBalance({ money }: { money: number }) {
  return (
    <div
      className="min-w-21 rounded-2xl border border-amber-500/50 bg-zinc-950/85 px-2.5 py-2 text-center shadow-lg ring-1 ring-amber-400/25 backdrop-blur-md"
      aria-label={`Wallet balance ${money.toLocaleString()} Ugandan shillings`}
    >
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200/90">Wallet</p>
      <p className="mt-1 font-mono text-[11px] font-black tabular-nums leading-none text-amber-100 sm:text-xs">
        {money.toLocaleString()}
      </p>
      <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-500">UGX</p>
    </div>
  )
}

function DecorativeFuelIcon() {
  return (
    <div
      className="rounded-2xl border border-emerald-500/40 bg-zinc-950/80 px-3 py-2 shadow-lg ring-1 ring-emerald-400/15 backdrop-blur-md"
      aria-hidden
    >
      <p className="mb-1 text-center text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200/90">
        Fuel
      </p>
      <svg viewBox="0 0 56 72" className="mx-auto h-[76px] w-14" aria-hidden>
        <rect
          x="12"
          y="8"
          width="24"
          height="48"
          rx="4"
          className="fill-zinc-900 stroke-emerald-600/70"
          strokeWidth="2"
        />
        <rect
          x="16"
          y="40"
          width="16"
          height="12"
          rx="1"
          className="splash-fuel-fill fill-emerald-500/90"
        />
        <rect x="36" y="18" width="10" height="8" rx="1" className="fill-zinc-700 stroke-zinc-500" strokeWidth="1" />
        <path
          d="M 40 26 L 46 32 L 46 44 L 40 44 Z"
          className="fill-zinc-800 stroke-emerald-700/60"
          strokeWidth="1.2"
        />
        <text
          x="28"
          y="66"
          textAnchor="middle"
          className="fill-emerald-200/85 text-[10px] font-bold"
        >
          F
        </text>
      </svg>
    </div>
  )
}

const RIGHT_PANEL_ORBS: { l: string; t: string; d: string; s: number; cls: string }[] = [
  { l: '3%', t: '5%', d: '0s', s: 0.5, cls: 'bg-amber-400/20' },
  { l: '88%', t: '8%', d: '0.4s', s: 0.35, cls: 'bg-amber-300/18' },
  { l: '12%', t: '22%', d: '1.1s', s: 0.42, cls: 'bg-emerald-400/15' },
  { l: '72%', t: '18%', d: '0.8s', s: 0.38, cls: 'bg-sky-400/14' },
  { l: '48%', t: '4%', d: '1.6s', s: 0.28, cls: 'bg-amber-500/22' },
  { l: '6%', t: '42%', d: '2s', s: 0.4, cls: 'bg-violet-400/12' },
  { l: '92%', t: '38%', d: '0.2s', s: 0.33, cls: 'bg-amber-400/16' },
  { l: '22%', t: '58%', d: '1.4s', s: 0.48, cls: 'bg-emerald-300/14' },
  { l: '78%', t: '52%', d: '2.3s', s: 0.36, cls: 'bg-amber-300/20' },
  { l: '52%', t: '48%', d: '0.9s', s: 0.3, cls: 'bg-sky-300/12' },
  { l: '8%', t: '78%', d: '1.8s', s: 0.44, cls: 'bg-amber-500/18' },
  { l: '65%', t: '72%', d: '0.6s', s: 0.4, cls: 'bg-orange-400/14' },
  { l: '38%', t: '88%', d: '2.1s', s: 0.34, cls: 'bg-amber-400/15' },
  { l: '94%', t: '82%', d: '1.2s', s: 0.32, cls: 'bg-zinc-400/12' },
]

const RIGHT_PANEL_SPARKS: { l: string; t: string; d: string }[] = [
  { l: '18%', t: '14%', d: '0s' },
  { l: '55%', t: '28%', d: '0.4s' },
  { l: '32%', t: '66%', d: '0.9s' },
  { l: '84%', t: '58%', d: '0.2s' },
  { l: '44%', t: '92%', d: '1.1s' },
  { l: '70%', t: '12%', d: '0.7s' },
]

/** Full-bleed ambient motion behind landing copy (pointer-events none). */
function LandingRightMotion() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="landing-panel-grid absolute inset-0 opacity-100" />
      <div className="landing-panel-stripes absolute inset-0 opacity-[0.95]" />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 100% 55% at 50% -10%, rgba(251,191,36,0.14), transparent 52%), radial-gradient(ellipse 70% 45% at 100% 100%, rgba(52,211,153,0.06), transparent 50%)',
        }}
      />
      <div className="landing-panel-sheen absolute -left-[20%] top-0 h-full w-[55%] bg-linear-to-r from-transparent via-amber-400/14 to-transparent" />
      <div
        className="landing-panel-scan absolute left-0 right-0 top-0 h-[min(38vh,200px)] bg-linear-to-b from-transparent via-amber-300/10 to-transparent"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="landing-panel-scan absolute left-0 right-0 top-0 h-[min(38vh,200px)] bg-linear-to-b from-transparent via-amber-200/8 to-transparent"
        style={{ animationDelay: '2.75s' }}
      />
      {RIGHT_PANEL_ORBS.map((o, i) => (
        <div
          key={`o-${i}`}
          className={`landing-panel-orb absolute rounded-full blur-[1.5px] ${o.cls}`}
          style={{
            left: o.l,
            top: o.t,
            width: `${o.s * 52}px`,
            height: `${o.s * 52}px`,
            animationDelay: o.d,
          }}
        />
      ))}
      {RIGHT_PANEL_SPARKS.map((s, i) => (
        <div
          key={`s-${i}`}
          className="landing-panel-twinkle absolute h-1 w-1 rotate-45 bg-amber-200/50 shadow-[0_0_6px_rgba(251,191,36,0.45)]"
          style={{ left: s.l, top: s.t, animationDelay: s.d }}
        />
      ))}
      <div
        className="splash-road-layer absolute bottom-0 left-0 right-0 h-16 opacity-[0.18]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent 0 14px, rgba(251,191,36,0.28) 14px 17px)',
          backgroundSize: '42px 100%',
        }}
      />
    </div>
  )
}

export function LandingOverlay({ artSrc, splashImageReady, onStart }: LandingOverlayProps) {
  const money = useGameStore((s) => s.money)
  const [tab, setTab] = useState<TabId>('fuel')
  const baseId = useId()
  const tabPanelId = `${baseId}-panel`

  const dots = [
    { l: '8%', t: '18%', d: '0s', s: 0.55 },
    { l: '78%', t: '22%', d: '0.6s', s: 0.4 },
    { l: '22%', t: '58%', d: '1.1s', s: 0.5 },
    { l: '88%', t: '48%', d: '0.3s', s: 0.35 },
    { l: '45%', t: '12%', d: '1.8s', s: 0.45 },
    { l: '62%', t: '68%', d: '2.2s', s: 0.38 },
  ]

  const active = ABOUT_TABS.find((t) => t.id === tab) ?? ABOUT_TABS[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Left: hero art — capped height on mobile so the right panel can fill remaining space */}
      <div className="relative h-[min(42vh,320px)] min-h-[200px] shrink-0 lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-[1.25]">
        <img
          src={artSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[50%_28%] lg:object-[42%_center]"
          draggable={false}
        />
        <div
          className="absolute inset-0 bg-linear-to-r from-black/55 via-transparent to-black/70 lg:from-black/40 lg:via-black/15 lg:to-black/80"
          aria-hidden
        />

        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div
            className="splash-road-layer absolute -bottom-2 left-0 right-0 h-24 opacity-25"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, transparent 0 18px, rgba(251,191,36,0.35) 18px 22px)',
              backgroundSize: '56px 100%',
            }}
          />
          {dots.map((d, i) => (
            <div
              key={i}
              className="splash-drift-dot absolute rounded-full bg-amber-400/25 blur-[1px]"
              style={{
                left: d.l,
                top: d.t,
                width: `${d.s * 44}px`,
                height: `${d.s * 44}px`,
                animationDelay: d.d,
              }}
            />
          ))}
          <div className="splash-mini-bike absolute bottom-[22%] right-[12%] text-4xl opacity-30 drop-shadow-lg lg:bottom-[30%] lg:right-[8%]">
            🏍️
          </div>
        </div>

        <div className="pointer-events-none absolute left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex items-start justify-between gap-2 sm:gap-3">
          <DecorativeSpeedometer />
          <SplashWalletBalance money={money} />
          <DecorativeFuelIcon />
        </div>
      </div>

      {/* Right: full-height column, motion bed fills area behind UI */}
      <div className="relative flex min-h-0 w-full flex-1 flex-col border-t-[5px] border-amber-600/80 bg-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:min-h-0 lg:border-l-[5px] lg:border-t-0 lg:py-0">
        <LandingRightMotion />
        {/* bezel corners */}
        <div
          className="pointer-events-none absolute left-2 top-2 h-6 w-6 border-l-2 border-t-2 border-amber-500/50"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute right-2 top-2 h-6 w-6 border-r-2 border-t-2 border-amber-500/50"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-2 left-2 h-6 w-6 border-b-2 border-l-2 border-amber-500/40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-2 right-2 h-6 w-6 border-b-2 border-r-2 border-amber-500/40"
          aria-hidden
        />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 lg:justify-center lg:py-4">
          {!splashImageReady ? (
            <p className="text-center text-sm font-semibold tracking-wide text-zinc-500">Loading…</p>
          ) : null}

          <div className="shrink-0 text-center">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.32em] text-amber-500/90">
              Field manual
            </p>
            <h2 className="mt-0.5 bg-linear-to-b from-amber-200 to-amber-600 bg-clip-text text-lg font-black uppercase tracking-widest text-transparent drop-shadow-sm sm:text-xl">
              About the game
            </h2>
            <div className="mx-auto mt-1.5 h-0.5 w-20 rounded-full bg-linear-to-r from-transparent via-amber-500/80 to-transparent" />
          </div>

          <div
            className="flex shrink-0 flex-col rounded-xl border-2 border-zinc-700/90 bg-linear-to-b from-zinc-900/95 to-black/90 p-1.5 shadow-[0_4px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-amber-900/30"
            role="region"
            aria-label="Game guide tabs"
          >
            <div
              role="tablist"
              aria-label="Topics"
              className="flex gap-1 overflow-x-auto pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {ABOUT_TABS.map((t) => {
                const selected = tab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`${baseId}-tab-${t.id}`}
                    aria-selected={selected}
                    aria-controls={tabPanelId}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setTab(t.id)}
                    className={`flex min-w-18 shrink-0 flex-col items-center gap-0.5 rounded-md border-2 px-2 py-1.5 text-center transition ${
                      selected
                        ? `${t.border} ${t.glow} bg-zinc-950/90 ${t.accent}`
                        : 'border-zinc-600/70 bg-zinc-950/60 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                    } `}
                  >
                    <span className="font-mono text-[9px] font-black uppercase tracking-wider opacity-80">
                      {t.short}
                    </span>
                    <span className="text-[10px] font-black uppercase leading-tight tracking-wide">
                      {t.label}
                    </span>
                  </button>
                )
              })}
            </div>

            <div
              id={tabPanelId}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-${active.id}`}
              className={`rounded-md border-2 ${active.border} bg-black/50 px-2.5 py-2 shadow-inner sm:px-3 sm:py-2.5`}
            >
              <p className="text-left text-[12px] font-semibold leading-snug text-zinc-200/95 sm:text-[13px] sm:leading-relaxed">
                {active.body}
              </p>
            </div>

            <p className="mt-1.5 text-center font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              70% skill · 40% dodging potholes
            </p>
          </div>

          <button
            type="button"
            disabled={!splashImageReady}
            onClick={onStart}
            className="w-full shrink-0 rounded-xl border-2 border-amber-400/80 bg-linear-to-b from-amber-400 to-amber-600 py-2.5 text-center text-sm font-black uppercase tracking-[0.18em] text-amber-950 shadow-[0_4px_0_rgb(120,53,15),0_0_18px_rgba(251,191,36,0.22)] transition enabled:hover:brightness-110 enabled:active:translate-y-0.5 enabled:active:shadow-[0_2px_0_rgb(120,53,15)] disabled:cursor-not-allowed disabled:opacity-40 sm:py-3 sm:text-base sm:tracking-[0.2em]"
          >
            Start
          </button>

          <p className="shrink-0 text-center text-[9px] font-semibold leading-snug text-zinc-500 sm:text-[10px]">
            If the menu track is silent, tap anywhere, press a key, or use Start—Chrome and Safari
            require one interaction before they allow sound.
          </p>
        </div>
      </div>
    </div>
  )
}
