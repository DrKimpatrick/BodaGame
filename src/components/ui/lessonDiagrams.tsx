/**
 * Small road diagrams for the lesson, seen from above with the rider travelling up the page. A rider travelling up
 * has their left on the left of the picture, so these match what they see on the road.
 */

const ROAD = '#34363b'
const LINE = '#f4f4ef'
const RIDER = '#f5c518'
const OTHER = '#9aa3ad'

function Bike({ x, y, rotate = 0, label }: { x: number; y: number; rotate?: number; label?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x={-5} y={-14} width={10} height={28} rx={5} fill={RIDER} />
      <path d="M0 -24 L7 -14 L-7 -14 Z" fill={RIDER} />
      {label ? (
        <text x={0} y={30} textAnchor="middle" fontSize={12} fontWeight={800} fill={RIDER}>
          {label}
        </text>
      ) : null}
    </g>
  )
}

export function KeepLeftDiagram() {
  return (
    <svg viewBox="0 0 300 150" className="h-36 w-full max-w-xs" role="img" aria-label="A road seen from above. You ride up the left side, with the centre line on your right. Traffic coming the other way is on the right side.">
      <rect x={70} width={160} height={150} fill={ROAD} />
      <rect x={70} width={4} height={150} fill={LINE} />
      <rect x={226} width={4} height={150} fill={LINE} />
      {[10, 50, 90, 130].map((y) => (
        <rect key={y} x={148} y={y} width={4} height={22} fill={LINE} />
      ))}
      <Bike x={110} y={84} />
      <g transform="translate(190 66)">
        <rect x={-13} y={-26} width={26} height={52} rx={6} fill={OTHER} />
        <path d="M0 40 L9 28 L-9 28 Z" fill={OTHER} />
      </g>
      <text x={110} y={136} textAnchor="middle" fontSize={13} fontWeight={800} fill={RIDER}>
        YOU
      </text>
      <text x={35} y={80} textAnchor="middle" fontSize={13} fontWeight={800} fill="#a7f3d0">
        LEFT
      </text>
      <text x={265} y={80} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fecaca">
        RIGHT
      </text>
      <text x={190} y={136} textAnchor="middle" fontSize={12} fontWeight={700} fill={OTHER}>
        oncoming
      </text>
    </svg>
  )
}

/** A left turn with the four stages numbered along it. The rider ends with the centre line on their right. */
export function BrakeTurnDiagram() {
  const stages: [number, number, string, string][] = [
    [92, 156, '1', 'Brake first, going straight'],
    [92, 112, '2', 'Slow? Now steer in'],
    [62, 88, '3', 'Keep left of the new road'],
    [18, 88, '4', 'Straighten up, then accelerate'],
  ]
  return (
    <svg viewBox="0 0 340 190" className="h-44 w-full max-w-md" role="img" aria-label="A left turn. 1: brake in a straight line before the corner. 2: steer in once slow. 3: keep left of the new road. 4: straighten up, then accelerate.">
      <rect x={70} y={0} width={90} height={190} fill={ROAD} />
      <rect x={0} y={30} width={160} height={80} fill={ROAD} />
      {/* Centre lines: the rider keeps them on the right all the way round. */}
      <rect x={114} y={112} width={3} height={78} fill={LINE} />
      <rect x={0} y={69} width={68} height={3} fill={LINE} />
      <path d="M 92 186 L 92 118 Q 92 90 62 90 L 2 90" fill="none" stroke={RIDER} strokeWidth={4} strokeDasharray="9 7" />
      {stages.map(([x, y, n]) => (
        <g key={n}>
          <circle cx={x} cy={y} r={11} fill={RIDER} />
          <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={900} fill="#111">
            {n}
          </text>
        </g>
      ))}
      {stages.map(([, , n, label], k) => (
        <text key={n} x={172} y={46 + k * 34} fontSize={12.5} fontWeight={700} fill="#f4f4f5">
          <tspan fontWeight={900} fill={RIDER}>{n} </tspan>
          {label}
        </text>
      ))}
    </svg>
  )
}

export function SignalDiagram() {
  const lamp = (cy: number, fill: string) => <circle cx={46} cy={cy} r={13} fill={fill} />
  return (
    <svg viewBox="0 0 300 130" className="h-32 w-full max-w-xs" role="img" aria-label="A traffic light. Stop behind the white line on red. Stop if you safely can on amber. Go on green if the way is clear.">
      <rect x={26} y={8} width={40} height={114} rx={8} fill="#111" />
      {lamp(30, '#ef4444')}
      {lamp(65, '#f59e0b')}
      {lamp(100, '#22c55e')}
      <text x={84} y={35} fontSize={14} fontWeight={800} fill="#fff">
        Stop behind the line
      </text>
      <text x={84} y={70} fontSize={14} fontWeight={800} fill="#fff">
        Stop if you safely can
      </text>
      <text x={84} y={105} fontSize={14} fontWeight={800} fill="#fff">
        Go, if the way is clear
      </text>
    </svg>
  )
}

export function RoundaboutDiagram() {
  return (
    <svg viewBox="0 0 300 200" className="h-44 w-full max-w-xs" role="img" aria-label="A roundabout from above. You join by turning left and go round clockwise, giving way to traffic from your right.">
      <rect x={120} width={60} height={200} fill={ROAD} />
      <rect y={70} width={300} height={60} fill={ROAD} />
      <circle cx={150} cy={100} r={70} fill={ROAD} />
      <circle cx={150} cy={100} r={28} fill="#3f6e2a" stroke={LINE} strokeWidth={2} />
      {/* Enter from the bottom in the left lane, go clockwise, leave to the right. */}
      <path d="M 136 198 L 136 158 Q 112 140 104 104 A 46 46 0 0 1 196 104" fill="none" stroke={RIDER} strokeWidth={4} strokeDasharray="9 7" />
      <path d="M 196 104 Q 212 88 296 86" fill="none" stroke={RIDER} strokeWidth={4} strokeDasharray="9 7" />
      <path d="M 290 79 L 300 86 L 290 93 Z" fill={RIDER} />
      <text x={150} y={106} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">
        clockwise
      </text>
      <text x={10} y={190} fontSize={13} fontWeight={800} fill="#a7f3d0">
        Turn left to join
      </text>
      <text x={200} y={190} fontSize={12} fontWeight={800} fill="#fecaca">
        Give way to your right
      </text>
    </svg>
  )
}
