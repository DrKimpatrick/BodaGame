/**
 * Kampala, scaled down onto the game's street grid. See docs/KAMPALA_RESEARCH.md for sources.
 *
 * The real city is built over hills with winding roads; the game keeps a grid (for traffic AI and rule
 * checks) but uses real road names in roughly their real relative positions, with Kampala Road crossing
 * Entebbe Road at the centre (Entebbe Road really starts on Kampala Road), the Clock Tower roundabout to
 * the south on Entebbe Road, Jinja Road to the east, Bombo Road (Wandegeya, Kubiri) to the north-west, and
 * the hills with their cathedrals and mosques on the horizon.
 */

/** East–west roads, south (index 0) to north (index 12). */
export const STREETS_EW = [
  'Kibuye Rd',
  'Katwe Rd',
  'Queensway',
  'Mukwano Rd',
  'Nakivubo Rd',
  'Ben Kiwanuka St',
  'Kampala Rd',
  'Nile Ave',
  'Kintu Rd',
  'Yusuf Lule Rd',
  'Bukoto St',
  'Kira Rd',
  'Ntinda Rd',
] as const

/** North–south roads, west (index 0) to east (index 12). */
export const STREETS_NS = [
  'Masaka Rd',
  'Natete Rd',
  'Namirembe Rd',
  'Mengo Hill Rd',
  'Bombo Rd',
  'Luwum St',
  'Entebbe Rd',
  'Speke Rd',
  'Parliament Ave',
  'Jinja Rd',
  'Lugogo By-pass',
  'Kololo Hill Dr',
  'Port Bell Rd',
] as const

export type RoundaboutDef = { i: number; j: number; name: string; monument: 'clocktower' | 'fountain' | 'garden' | 'crane' }

/** Junctions (strip i along X, strip j along Z) that are roundabouts. */
export const ROUNDABOUTS: readonly RoundaboutDef[] = [
  { i: 6, j: 2, name: 'Clock Tower', monument: 'clocktower' },
  { i: 9, j: 5, name: 'Jinja Rd (Kitgum House)', monument: 'fountain' },
  { i: 4, j: 9, name: 'Wandegeya', monument: 'garden' },
  { i: 4, j: 11, name: 'Kubiri', monument: 'garden' },
  { i: 10, j: 10, name: 'Kamwokya', monument: 'crane' },
  { i: 3, j: 1, name: 'Kibuye', monument: 'fountain' },
]

const roundaboutKeys = new Map(ROUNDABOUTS.map((r) => [`${r.i},${r.j}`, r]))

export function roundaboutAt(i: number, j: number): RoundaboutDef | undefined {
  return roundaboutKeys.get(`${i},${j}`)
}

/** City blocks (block i between strips i and i+1, block j likewise) given to Kampala landmarks. */
export const LANDMARK_BLOCKS = {
  independence: { i: 6, j: 6, name: 'Independence Monument' },
  taxiPark: { i: 5, j: 5, name: 'Old Taxi Park' },
  market: { i: 6, j: 7, name: 'Nakasero Market' },
  square: { i: 7, j: 5, name: 'Constitutional Square' },
  owino: { i: 4, j: 4, name: 'Owino (St Balikuddembe) Market' },
  makerere: { i: 3, j: 10, name: 'Makerere University' },
  mulago: { i: 5, j: 11, name: 'Mulago Hospital' },
  kisekka: { i: 3, j: 4, name: 'Kisekka Market' },
} as const

/** Nakivubo channel: open and walled, just south of Owino, passing under Luwum St and Entebbe Rd in culverts. */
export const CHANNEL = { halfLength: 16, halfWidth: 4, depth: 3 } as const
export const CHANNEL_BLOCKS: readonly { i: number; j: number }[] = [
  { i: 4, j: 3 },
  { i: 5, j: 3 },
  { i: 6, j: 3 },
]

/** Clock Tower flyover: runs north–south through these two blocks, crossing Queensway beside the roundabout. */
export const FLYOVER_BLOCKS: readonly { i: number; j: number }[] = [
  { i: 6, j: 1 },
  { i: 6, j: 2 },
]

export type ShopEdge = 'n' | 's' | 'e' | 'w'

/**
 * Blocks that hold a linear feature keep shop rows only on these edges, so the rows never touch it:
 * channel blocks front Nakivubo Rd and leave the channel open to Mukwano Rd; flyover blocks flank the deck.
 */
export function forcedShopEdges(i: number, j: number): readonly ShopEdge[] | undefined {
  if (CHANNEL_BLOCKS.some((b) => b.i === i && b.j === j)) return ['n']
  if (FLYOVER_BLOCKS.some((b) => b.i === i && b.j === j)) return ['w', 'e']
  return undefined
}

export function isLandmarkBlock(i: number, j: number): boolean {
  return Object.values(LANDMARK_BLOCKS).some((b) => b.i === i && b.j === j) || forcedShopEdges(i, j) !== undefined
}

/**
 * Hills on the horizon (azimuth in degrees, 0 = north, clockwise) and what stands on them. Kept beyond
 * the city's corners (≥ ~640 m) so they never poke through the streets.
 */
export const HILLS: readonly { name: string; azimuth: number; distance: number; height: number; landmark?: 'mosque' | 'cathedral' | 'twinTowers' | 'dome' | 'palace' | 'masts' }[] = [
  { name: 'Old Kampala (Gaddafi Mosque)', azimuth: 290, distance: 720, height: 69, landmark: 'mosque' },
  { name: 'Rubaga (St Mary’s Cathedral)', azimuth: 255, distance: 800, height: 78, landmark: 'twinTowers' },
  { name: 'Namirembe (St Paul’s Cathedral)', azimuth: 315, distance: 840, height: 87, landmark: 'cathedral' },
  { name: 'Mengo (Lubiri)', azimuth: 230, distance: 740, height: 57, landmark: 'palace' },
  { name: 'Kibuli (Mosque)', azimuth: 140, distance: 760, height: 66, landmark: 'mosque' },
  { name: 'Kololo (Airstrip)', azimuth: 55, distance: 760, height: 75, landmark: 'masts' },
  { name: 'Kikaya (Bahá’í House of Worship)', azimuth: 10, distance: 880, height: 81, landmark: 'dome' },
  { name: 'Nsambya', azimuth: 175, distance: 800, height: 60 },
  { name: 'Mulago', azimuth: 340, distance: 760, height: 63 },
  { name: 'Makerere', azimuth: 320, distance: 670, height: 54 },
  { name: 'Muyenga', azimuth: 155, distance: 900, height: 93 },
  { name: 'Ntinda', azimuth: 80, distance: 880, height: 51 },
]
