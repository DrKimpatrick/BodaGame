/**
 * Rules checked live from how the rider actually rides in the 3D city (not from cards).
 * Fines, life loss and jail days are game values, not legal penalties.
 */

export type LiveRuleId =
  | 'red'
  | 'stop'
  | 'giveway'
  | 'speed'
  | 'school'
  | 'zebra'
  | 'keepleft'
  | 'pavement'
  | 'lights'
  | 'roundabout'
  | 'hitPedestrian'
  | 'crash'

export type LiveRule = {
  id: LiveRuleId
  /** Sign key for the card art (see `signs.ts`). */
  sign: string
  name: string
  /** What happened, shown after the violation. */
  outcome: string
  /** The rule to learn. */
  rule: string
  fine: number
  life: number
  jail: number
  /** Short warning the instructor gives before the hazard (learner mode). */
  hint?: string
  /** Praise when the rider gets it right (only rules with a "good move"). */
  praise?: string
}

export const LIVE_RULES: Record<LiveRuleId, LiveRule> = {
  red: {
    id: 'red',
    sign: 'redlight',
    name: 'Red traffic light',
    outcome: 'You rode through a red light. A traffic officer at the junction waves you down.',
    rule: 'Red means stop behind the white line, even if the junction looks empty. Amber means stop unless you are too close to stop safely.',
    fine: 40_000,
    life: 10,
    jail: 1,
    hint: 'Traffic lights ahead. If it is red or amber, stop behind the white line.',
    praise: 'Good stop at the red light.',
  },
  stop: {
    id: 'stop',
    sign: 'stop',
    name: 'STOP sign',
    outcome: 'You rolled through a STOP sign without stopping. An officer saw it.',
    rule: 'At a STOP sign, come to a complete halt at the line, look right, left and right again, then go when it is clear. Slowing down is not stopping.',
    fine: 20_000,
    life: 5,
    jail: 0,
    hint: 'STOP sign ahead. Come to a full stop at the white line.',
    praise: 'Full stop at the STOP sign. Well done.',
  },
  giveway: {
    id: 'giveway',
    sign: 'giveway',
    name: 'Give way',
    outcome: 'You pulled out in front of a vehicle that had priority. It had to brake hard.',
    rule: 'GIVE WAY means traffic on the main road, or already going round the roundabout, goes first. Slow down, wait for a safe gap, then join.',
    fine: 15_000,
    life: 10,
    jail: 0,
    hint: 'Give way ahead. Let the cars on the main road pass first.',
    praise: 'You gave way to the main road.',
  },
  speed: {
    id: 'speed',
    sign: 'speed50',
    name: 'Speed limit 50',
    outcome: 'A police speed gun clocked you over 50 km/h in town.',
    rule: 'In built-up areas the limit is 50 km/h. A limit is a maximum, not a target: ride slower when it is busy or wet.',
    fine: 20_000,
    life: 5,
    jail: 0,
  },
  school: {
    id: 'school',
    sign: 'school',
    name: 'School zone',
    outcome: 'You rode past the school over 30 km/h. A teacher reported your number plate.',
    rule: 'Near schools, slow right down (30 km/h here). Children can run out without looking.',
    fine: 25_000,
    life: 5,
    jail: 0,
    hint: 'School zone. Slow to 30 and watch for children.',
  },
  zebra: {
    id: 'zebra',
    sign: 'zebra',
    name: 'Zebra crossing',
    outcome: 'You sped over a zebra crossing while people were crossing. A woman jumped back.',
    rule: 'Pedestrians on a zebra crossing have priority. Slow down, be ready to stop, and let them cross.',
    fine: 25_000,
    life: 5,
    jail: 0,
    hint: 'Zebra crossing ahead. Slow down and let people cross.',
  },
  keepleft: {
    id: 'keepleft',
    sign: 'keepleft',
    name: 'Keep left',
    outcome: 'You rode on the right side of the road, into oncoming traffic.',
    rule: 'In Uganda we ride on the left. Keep to the left side of the road unless you are overtaking safely.',
    fine: 20_000,
    life: 15,
    jail: 0,
  },
  pavement: {
    id: 'pavement',
    sign: 'pavement',
    name: 'Pavement',
    outcome: 'You rode along the roadside path where people walk.',
    rule: 'Pavements and road shoulders are for pedestrians. Stay on the road, even in a jam.',
    fine: 15_000,
    life: 5,
    jail: 0,
  },
  lights: {
    id: 'lights',
    sign: 'e:💡',
    name: 'Lights at dusk',
    outcome: 'It is getting dark and your headlight is off. A car nearly pulls out on you.',
    rule: 'Switch on your headlight when it is dim or dark, and wear a reflector jacket, so others can see you.',
    fine: 10_000,
    life: 10,
    jail: 0,
    hint: 'It is getting dark. Switch on your headlight (L).',
  },
  roundabout: {
    id: 'roundabout',
    sign: 'roundabout',
    name: 'Roundabout',
    outcome: 'You went the wrong way round the roundabout, against the traffic.',
    rule: 'In Uganda we keep left, so roundabouts go clockwise: give way to traffic coming from your right, turn left onto the roundabout and go round to your exit.',
    fine: 30_000,
    life: 15,
    jail: 0,
    hint: 'Roundabout ahead. Give way to traffic from your right, then go round clockwise.',
    praise: 'Good roundabout: you gave way and went round the right way.',
  },
  hitPedestrian: {
    id: 'hitPedestrian',
    sign: 'e:🚶',
    name: 'Pedestrian hit',
    outcome: 'You knocked down a pedestrian. Police arrive and take you in.',
    rule: 'Watch for people on the road and the roadside, especially at crossings, stages and markets. Slow down early.',
    fine: 40_000,
    life: 5,
    jail: 3,
  },
  crash: {
    id: 'crash',
    sign: 'e:🚗',
    name: 'Crash',
    outcome: 'You crashed into a vehicle and were thrown from the bike.',
    rule: 'Keep a safe distance, check your mirrors, signal early and never squeeze between moving vehicles.',
    fine: 0,
    life: 20,
    jail: 0,
  },
}
