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

/** Collision boxes (half extents, centre) matching the models in Vehicles.tsx, in vehicle space (ground y = 0). */
export function vehicleCollider(kind: VehicleKind): { args: [number, number, number]; pos: [number, number, number] } {
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
      return 4.5
    case 'trailer':
      return 4.1
    case 'motorbike':
    case 'bicycle':
      return 1.0
    default:
      return 2.4
  }
}

