/** Street names on the junction blades (real Kampala roads; see `kampalaMap.ts`). */
export { STREETS_EW, STREETS_NS } from './kampalaMap'
import { STREETS_EW, STREETS_NS } from './kampalaMap'

export const ALL_STREETS: readonly string[] = [...new Set([...STREETS_EW, ...STREETS_NS])]
