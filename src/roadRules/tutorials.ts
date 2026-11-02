/** The tutorials menu: each opens one lesson step on its own, shown first and then tried. Ids match the lesson's steps. */
export const TUTORIALS: readonly { id: string; icon: string; title: string; blurb: string }[] = [
  { id: 'keepleft', icon: '⬅️', title: 'Keep left', blurb: 'The first rule of the road in Uganda.' },
  { id: 'gas', icon: '🏍️', title: 'The accelerator', blurb: 'Pulling away gently and building speed.' },
  { id: 'coast', icon: '🍃', title: 'Letting go', blurb: 'The gentlest way to slow down a little.' },
  { id: 'brake', icon: '🛑', title: 'The brake', blurb: 'Stopping cleanly, in a straight line.' },
  { id: 'stayleft', icon: '↔️', title: 'Steering', blurb: 'Small, gentle presses, and staying in your lane.' },
  { id: 'turn', icon: '↰', title: 'A smooth corner', blurb: 'Slow down first, then steer, then accelerate out.' },
  { id: 'junctions', icon: '🚦', title: 'Lights and junctions', blurb: 'Red, amber, green, STOP and give way.' },
  { id: 'roundabout', icon: '🔃', title: 'Roundabouts', blurb: 'Turn left to join, and go round clockwise.' },
  { id: 'passenger', icon: '🧍', title: 'Picking up a passenger', blurb: 'Pulling in to the left kerb and stopping.' },
]
