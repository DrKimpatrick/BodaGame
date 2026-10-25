import { calcPosFromAngles } from '@react-three/drei'
import * as THREE from 'three'

/** Slightly hazy equatorial afternoon — clear horizon, readable cumulus. */
export const INCLINATION = 0.52
export const AZIMUTH = 0.42

export type SkyWeather = 'clear' | 'rain' | 'dusk'

/** Sun height per shift condition (0.5 = horizon). */
export function sunInclination(weather: SkyWeather = 'clear') {
  return weather === 'dusk' ? 0.503 : INCLINATION
}

/** Sun direction for matching directional lights to the sky dome. */
export function getSunDirection(out = new THREE.Vector3(), weather: SkyWeather = 'clear') {
  return out.copy(calcPosFromAngles(sunInclination(weather), AZIMUTH)).normalize()
}

let cloudUrl: string | null = null

/** Soft cloud puff generated locally (drei's default sprite is fetched from a CDN, which fails offline). */
export function cloudTextureUrl(): string {
  if (cloudUrl) return cloudUrl
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  for (let i = 0; i < 14; i++) {
    const x = 32 + Math.sin(i * 2.3) * 22 + 32
    const y = 64 + Math.cos(i * 1.7) * 16
    const r = 20 + ((i * 37) % 18)
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(255,255,255,0.55)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  cloudUrl = c.toDataURL('image/png')
  return cloudUrl
}
