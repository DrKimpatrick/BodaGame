import { useEffect, useState } from 'react'

/** Whether this is a touch screen (updates to true on the first touch, for hybrid laptops). */
export function useIsTouch() {
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
