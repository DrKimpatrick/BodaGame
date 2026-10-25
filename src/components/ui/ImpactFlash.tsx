import { useEffect, useState } from 'react'
import { useGameStore, type BloodImpactKind } from '../../store/useGameStore'

/** Brief red vignette and a phone buzz when the bike hits something. */
export function ImpactFlash() {
  const [kind, setKind] = useState<BloodImpactKind | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useGameStore.subscribe((s, p) => {
      if (s.bloodImpactNonce === p.bloodImpactNonce || !s.bloodImpactKind) return
      const k = s.bloodImpactKind
      setKind(k)
      // Browsers block vibration until the user has interacted with the page.
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(k === 'vehicle' ? [60, 40, 90] : 40)
      clearTimeout(timer)
      timer = setTimeout(() => setKind(null), k === 'restricted' ? 250 : 550)
    })
    return () => {
      unsub()
      clearTimeout(timer)
    }
  }, [])
  if (!kind) return null
  const strength = kind === 'vehicle' ? 0.7 : kind === 'pedestrian' ? 0.5 : 0.22
  return (
    <div
      className="pointer-events-none fixed inset-0 z-10"
      style={{ background: `radial-gradient(ellipse at center, transparent 45%, rgba(190,18,60,${strength}) 100%)` }}
      aria-hidden
    />
  )
}
