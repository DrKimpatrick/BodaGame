import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { setTouch, type Axis } from '../../input/driveInput'

/**
 * On-screen controls for phones and tablets: steer left/right under the left thumb, gas and brake under
 * the right. Multi-touch via pointer events with capture, so sliding a thumb off a button releases it.
 * Shown on touch screens, or on any screen when `force` is set.
 */

function useIsTouch() {
  const [touch, setTouchDevice] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0),
  )
  useEffect(() => {
    const on = () => setTouchDevice(true)
    window.addEventListener('touchstart', on, { once: true, passive: true })
    return () => window.removeEventListener('touchstart', on)
  }, [])
  return touch
}

function Pad({
  axis,
  label,
  className,
  children,
}: {
  axis: keyof Axis
  label: string
  className: string
  children: React.ReactNode
}) {
  const [down, setDown] = useState(false)
  const pointers = useRef(new Set<number>())
  const press = (e: RPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer already gone (very quick tap); press still counts */
    }
    pointers.current.add(e.pointerId)
    setTouch({ [axis]: true })
    setDown(true)
    navigator.vibrate?.(8)
  }
  const release = (e: RPointerEvent<HTMLButtonElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) {
      setTouch({ [axis]: false })
      setDown(false)
    }
  }
  useEffect(() => () => setTouch({ [axis]: false }), [axis])
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto flex touch-none select-none items-center justify-center rounded-full font-black ring-2 backdrop-blur-md transition-transform [-webkit-touch-callout:none] ${
        down ? 'scale-95 brightness-125' : ''
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function TouchControls({ force = false }: { force?: boolean }) {
  const isTouch = useIsTouch()
  if (!isTouch && !force) return null
  const size = 'h-[clamp(64px,19vw,92px)] w-[clamp(64px,19vw,92px)] [@media(max-height:500px)]:h-[68px] [@media(max-height:500px)]:w-[68px]'
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end justify-between px-[max(0.75rem,env(safe-area-inset-left))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex gap-3">
        <Pad axis="left" label="Steer left" className={`${size} bg-black/45 text-3xl text-white ring-white/25`}>
          ◀
        </Pad>
        <Pad axis="right" label="Steer right" className={`${size} bg-black/45 text-3xl text-white ring-white/25`}>
          ▶
        </Pad>
      </div>
      <div className="flex items-end gap-3">
        <Pad axis="back" label="Brake" className={`${size} bg-rose-600/55 text-sm uppercase tracking-wider text-white ring-rose-300/50`}>
          Brake
        </Pad>
        <Pad
          axis="forward"
          label="Accelerate"
          className="h-[clamp(84px,25vw,120px)] w-[clamp(84px,25vw,120px)] bg-emerald-500/55 text-base uppercase tracking-wider text-white ring-emerald-200/60 [@media(max-height:500px)]:h-[84px] [@media(max-height:500px)]:w-[84px]"
        >
          Gas
        </Pad>
      </div>
    </div>
  )
}
