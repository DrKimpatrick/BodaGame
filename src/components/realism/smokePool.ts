/** The shared pool of puffs (see `Smoke.tsx`). Kept apart from the component so anything can emit into it. */

export const POOL = { low: 90, medium: 170, high: 260 } as const
export const MAX = POOL.high

export const pos = new Float32Array(MAX * 3)
export const vel = new Float32Array(MAX * 3)
export const age = new Float32Array(MAX).fill(1)
export const life = new Float32Array(MAX).fill(1)
export const startSize = new Float32Array(MAX)
export const growth = new Float32Array(MAX)
export const startAlpha = new Float32Array(MAX)
export const colour = new Float32Array(MAX * 3)
/** Written for the GPU each frame: size in metres, then opacity. */
export const look = new Float32Array(MAX * 2)
let next = 0
let poolSize: number = POOL.high

/** Fewer puffs on slower devices. */
export function setPoolSize(n: number): void {
  poolSize = n
}

export type Puff = { size: number; grow: number; alpha: number; life: number; r: number; g: number; b: number }

/** Adds a puff, reusing the oldest slot when the pool is full (so a busy road simply shows the most recent smoke). */
export function emitSmoke(x: number, y: number, z: number, vx: number, vy: number, vz: number, p: Puff): void {
  const i = next
  next = (next + 1) % poolSize
  pos[i * 3] = x
  pos[i * 3 + 1] = y
  pos[i * 3 + 2] = z
  vel[i * 3] = vx
  vel[i * 3 + 1] = vy
  vel[i * 3 + 2] = vz
  age[i] = 0
  life[i] = p.life
  startSize[i] = p.size
  growth[i] = p.grow
  startAlpha[i] = p.alpha
  colour[i * 3] = p.r
  colour[i * 3 + 1] = p.g
  colour[i * 3 + 2] = p.b
}
