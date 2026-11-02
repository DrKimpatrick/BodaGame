/** Vehicle kinds, collision boxes and nose distances (shared by traffic AI and the models). */

export type VehicleKind =
  | 'sedan'
  | 'taxi'
  | 'suv'
  | 'van'
  | 'pickup'
  | 'matatu'
  | 'bus'
  | 'trailer'
  | 'motorbike'
  | 'bicycle'

/** Traffic is modelled at real size, then trimmed to sit well on the game's roads from a chase camera. */
export function vehicleScale(kind: VehicleKind): number {
  switch (kind) {
    case 'bus':
    case 'trailer':
      return 0.8
    case 'motorbike':
    case 'bicycle':
      return 1
    default:
      return 0.9
  }
}

const PAINT = ['#e5e7eb', '#9ca3af', '#111827', '#f8fafc', '#1e3a8a', '#7f1d1d', '#374151', '#d1d5db', '#14532d']

/** Body paint for this vehicle. Kampala's shared taxis are always white. */
export function vehiclePaint(kind: VehicleKind, seed: number): string {
  if (kind === 'taxi' || kind === 'matatu') return '#f8fafc'
  return PAINT[Math.abs(seed * 7 + kind.length) % PAINT.length]!
}

/** Collision boxes (half extents, centre) matching the models in Vehicles.tsx, in vehicle space (ground y = 0). */
export function vehicleCollider(kind: VehicleKind): { args: [number, number, number]; pos: [number, number, number] } {
  const c = fullSizeCollider(kind)
  const k = vehicleScale(kind)
  return { args: [c.args[0] * k, c.args[1] * k, c.args[2] * k], pos: [c.pos[0] * k, c.pos[1] * k, c.pos[2] * k] }
}

function fullSizeCollider(kind: VehicleKind): { args: [number, number, number]; pos: [number, number, number] } {
  switch (kind) {
    case 'sedan':
      return { args: [0.86, 0.6, 2.25], pos: [0, 0.7, 0] }
    case 'suv':
      return { args: [0.93, 0.85, 2.35], pos: [0, 0.95, 0] }
    case 'taxi':
    case 'matatu':
    case 'van':
      return { args: [0.88, 0.95, 2.45], pos: [0, 1.1, 0] }
    case 'pickup':
      return { args: [0.9, 0.7, 2.6], pos: [0, 0.95, 0] }
    case 'bus':
      return { args: [1.15, 1.3, 4.5], pos: [0, 1.6, 0] }
    case 'trailer':
      return { args: [1.17, 1.3, 4.4], pos: [0, 1.5, -0.3] }
    case 'motorbike':
      return { args: [0.32, 0.6, 0.95], pos: [0, 0.65, 0] }
    case 'bicycle':
      return { args: [0.3, 0.6, 0.6], pos: [0, 0.65, 0] }
  }
}

/** Front bumper distance from the centre (traffic stops with its nose at the line). */
export function vehicleNose(kind: VehicleKind): number {
  switch (kind) {
    case 'bus':
      return 4.5 * vehicleScale(kind)
    case 'trailer':
      return 4.1 * vehicleScale(kind)
    case 'motorbike':
    case 'bicycle':
      return 1.0
    default:
      return 2.4 * vehicleScale(kind)
  }
}

