import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { roadKindAt } from '@game/roadSpatial'
import { driveInput } from '../input/driveInput'
import { bikeTelemetry } from '../roadRules/world/telemetry'
import { emitSmoke, type Puff } from './realism/smokePool'

/** The tip of the silencer on the bike's right, in bike space (forward is −Z, y from the wheel centre). */
const PIPE_X = 0.18
const PIPE_Y = -0.02
const PIPE_Z = 0.78
/** Between the rear tyre and the road. */
const TYRE_Z = 0.82
const TYRE_Y = -0.25

const exhaust: Puff = { size: 0.1, grow: 0.5, alpha: 0.2, life: 0.75, r: 0.74, g: 0.75, b: 0.77 }
const dust: Puff = { size: 0.2, grow: 1.1, alpha: 0.26, life: 0.85, r: 0.62, g: 0.42, b: 0.28 }

/** Exhaust from the silencer, more when accelerating; red dust from the rear tyre on murram or rough ground. */
export function BikeSmoke({ offroadRef }: { offroadRef: RefObject<boolean> }) {
  const exhaustDue = useRef(0)
  const dustDue = useRef(0)
  useFrame((_, delta) => {
    const b = bikeTelemetry
    const dt = Math.min(delta, 0.05)
    const fx = -Math.sin(b.yaw)
    const fz = -Math.cos(b.yaw)
    // Right of forward (fx, fz) is (−fz, fx) in this world's handedness.
    const rx = -fz
    const rz = fx
    const speed = Math.max(0, b.speed)
    const accelerating = driveInput.forward && speed < 16
    exhaustDue.current += dt * (accelerating ? 17 : 6)
    while (exhaustDue.current >= 1) {
      exhaustDue.current -= 1
      // Starts nearly at the bike's own speed, so it leaves the pipe rather than appearing metres behind it.
      const carry = speed * 0.75
      const spread = Math.random() - 0.5
      emitSmoke(
        b.x - fx * PIPE_Z + rx * PIPE_X,
        0.32 + PIPE_Y,
        b.z - fz * PIPE_Z + rz * PIPE_X,
        fx * carry - fx * 0.7 + rx * spread * 0.2,
        0.14 + Math.random() * 0.14,
        fz * carry - fz * 0.7 + rz * spread * 0.2,
        exhaust,
      )
    }
    const rough = offroadRef.current || roadKindAt(b.x, b.z) === 'murram'
    if (rough && speed > 2) {
      dustDue.current += dt * Math.min(22, 4 + speed * 1.4)
      while (dustDue.current >= 1) {
        dustDue.current -= 1
        const side = (Math.random() - 0.5) * 0.5
        const carry = speed * 0.45
        emitSmoke(
          b.x - fx * TYRE_Z + rx * side,
          0.32 + TYRE_Y,
          b.z - fz * TYRE_Z + rz * side,
          fx * carry + rx * side,
          0.35 + Math.random() * 0.35,
          fz * carry + rz * side,
          dust,
        )
      }
    } else {
      dustDue.current = 0
    }
  })
  return null
}
