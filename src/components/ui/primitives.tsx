import type { ReactNode } from 'react'
import { isOfficialSign, signDataUrl } from '../../roadRules/signs'

/** Shared UI pieces for the Women on Wheels screens. Mobile-first: tap targets are 44 px or more. */

export function SignImg({ sign, className = 'h-16 w-16', label }: { sign: string; className?: string; label?: string }) {
  return (
    <figure className="flex shrink-0 flex-col items-center gap-1">
      <img src={signDataUrl(sign)} alt="" className={`${className} drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]`} draggable={false} />
      {label ?? (!isOfficialSign(sign) ? <figcaption className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Road rule</figcaption> : null)}
    </figure>
  )
}

type ButtonProps = {
  children: ReactNode
  onClick?: () => void
  tone?: 'primary' | 'ghost' | 'danger' | 'good'
  className?: string
  disabled?: boolean
  autoFocus?: boolean
}

const TONES = {
  primary: 'bg-[#f5c518] text-zinc-950 hover:bg-[#ffd53a] active:bg-[#e2b30f] shadow-[0_4px_0_#9a7a06]',
  ghost: 'bg-white/5 text-zinc-100 ring-1 ring-white/15 hover:bg-white/10',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 shadow-[0_4px_0_#7f1d1d]',
  good: 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-[0_4px_0_#065f46]',
} as const

export function Button({ children, onClick, tone = 'primary', className = '', disabled, autoFocus }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`min-h-12 rounded-xl px-5 py-3 text-base font-extrabold transition active:translate-y-0.5 disabled:opacity-40 ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  )
}

/** Full-screen dim + centred panel that scrolls on small screens. */
export function Modal({
  children,
  labelledBy,
  wide = false,
  tone = 'default',
}: {
  children: ReactNode
  labelledBy?: string
  wide?: boolean
  tone?: 'default' | 'bad' | 'good'
}) {
  const ring = tone === 'bad' ? 'ring-rose-500/50' : tone === 'good' ? 'ring-emerald-400/50' : 'ring-white/10'
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className={`max-h-[100dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-[#17181d] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-zinc-100 shadow-2xl ring-1 sm:max-h-[92dvh] sm:rounded-3xl ${ring} ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        {children}
      </div>
    </div>
  )
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = tone ?? (pct > 55 ? 'bg-emerald-400' : pct > 25 ? 'bg-amber-400' : 'bg-rose-500')
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-[15px] font-bold text-zinc-100">{label}</span>
        {hint ? <span className="block text-[13px] leading-snug text-zinc-400">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-[#f5c518] peer-focus-visible:ring-2 peer-focus-visible:ring-[#f5c518] after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  )
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'up' | 'down' }) {
  const c = tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-rose-300' : 'text-zinc-200'
  return <span className={`rounded-full bg-white/8 px-3 py-1.5 text-sm font-extrabold ${c}`}>{children}</span>
}
