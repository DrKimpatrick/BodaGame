import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ewHalf, nsHalf } from '@game/cityGrid'
import {
  segmentRandom,
  SIDEWALK_HORIZONTAL_SLOTS,
  SIDEWALK_VERTICAL_SLOTS,
  ZEBRA_HORIZONTAL_SITES,
  ZEBRA_VERTICAL_SITES,
} from '@game/roadDecorPlacements'
import { bikeTelemetry, emitPedestrianStrike, worldClock } from '../roadRules/world/telemetry'
import { shouldApplyBikePedestrianInteraction } from '../store/useGameStore'
import { useSettingsStore } from '../store/useSettingsStore'

/**
 * Kampala street crowd: human figures (women in gomesi / busuuti dresses with headwraps, men in shirts
 * and trousers) with a walk cycle, drawn as a handful of InstancedMeshes driven from one frame loop.
 * Replaces ~380 box-figure rigid bodies (one draw call per body part each). Bike hits are detected by
 * distance to the bike, not physics.
 *
 * Pavement walkers stroll along the murram strip and turn round at the ends. Zebra crossers wait at the
 * kerb, cross, wait, and cross back.
 */

type Walker = {
  kind: 'walk' | 'cross'
  /** Path start/end (XZ) and lateral offset. */
  ax: number
  az: number
  bx: number
  bz: number
  speed: number
  /** Seconds offset into the cycle. */
  phase: number
  /** Seconds waiting at each end (crossers). */
  wait: number
  female: boolean
  gomesi: boolean
  height: number
  skin: THREE.Color
  top: THREE.Color
  bottom: THREE.Color
  hair: THREE.Color
}

/** Knockdown state per walker: world time it happened (-1 = standing) and the frozen pose. */
type KnockState = { at: Float32Array; x: Float32Array; z: Float32Array; yaw: Float32Array }

const SKINS = ['#5b3a26', '#6b4423', '#7a4b2a', '#4a2f1f', '#8d5524', '#3f281b'].map((c) => new THREE.Color(c))
const DRESSES = ['#b91c1c', '#7c3aed', '#0e7490', '#ca8a04', '#be185d', '#15803d', '#ea580c', '#1d4ed8', '#9d174d'].map((c) => new THREE.Color(c))
const SHIRTS = ['#f8fafc', '#1d4ed8', '#047857', '#b45309', '#334155', '#7f1d1d', '#e2e8f0', '#0f766e'].map((c) => new THREE.Color(c))
const TROUSERS = ['#1e293b', '#292524', '#3f3f46', '#1f2937', '#57534e', '#78716c'].map((c) => new THREE.Color(c))
const WRAPS = ['#facc15', '#dc2626', '#16a34a', '#9333ea', '#f97316', '#0ea5e9', '#111111'].map((c) => new THREE.Color(c))
const HAIR = new THREE.Color('#15100c')

const KNOCK_RECOVER_S = 5
const WALKERS_PER_SEGMENT = 3
const DENSITY = { low: 0.3, medium: 0.55, high: 1 } as const
/** People farther than this from the camera aren't drawn (they'd be a few pixels tall in the haze). */
const DRAW_RADIUS = { low: 80, medium: 120, high: 170 } as const
const HIT_RADIUS = 0.95

function pick<T>(arr: T[], r: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]!
}

function makeWalker(kind: Walker['kind'], ax: number, az: number, bx: number, bz: number, seed: number): Walker {
  const r = (salt: number) => segmentRandom(seed, salt, 911)
  const female = r(1) < 0.55
  return {
    kind,
    ax,
    az,
    bx,
    bz,
    speed: kind === 'cross' ? 1.15 + r(2) * 0.3 : 1.0 + r(2) * 0.45,
    phase: r(3) * 60,
    wait: 2.5 + r(4) * 6,
    female,
    gomesi: female && r(5) < 0.55,
    height: (female ? 0.94 : 1) * (0.94 + r(6) * 0.12),
    skin: pick(SKINS, r(7)),
    top: female ? pick(DRESSES, r(8)) : pick(SHIRTS, r(8)),
    bottom: female ? pick(DRESSES, r(8)) : pick(TROUSERS, r(9)),
    hair: female && r(10) < 0.7 ? pick(WRAPS, r(11)) : HAIR,
  }
}

function buildCrowd(density: number): Walker[] {
  const out: Walker[] = []
  for (const s of ZEBRA_VERTICAL_SITES) {
    if (segmentRandom(s.vi, s.j, 848) > 0.45) continue
    const n = 1 + Math.floor(segmentRandom(s.vi, s.j, 849) * 3)
    const halfCross = nsHalf(s.vi) + 0.55
    for (let p = 0; p < n; p++) {
      const dz = (p - 1) * 0.5
      out.push(makeWalker('cross', s.cx - halfCross, s.z + dz, s.cx + halfCross, s.z + dz, s.vi * 131 + s.j * 17 + p))
    }
  }
  for (const s of ZEBRA_HORIZONTAL_SITES) {
    if (segmentRandom(s.i, s.hj, 858) > 0.45) continue
    const n = 1 + Math.floor(segmentRandom(s.i, s.hj, 859) * 3)
    const halfCross = ewHalf(s.hj) + 0.55
    for (let p = 0; p < n; p++) {
      const dx = (p - 1) * 0.5
      out.push(makeWalker('cross', s.x + dx, s.cz - halfCross, s.x + dx, s.cz + halfCross, s.i * 137 + s.hj * 19 + p + 5000))
    }
  }
  for (const s of SIDEWALK_VERTICAL_SLOTS) {
    for (let w = 0; w < WALKERS_PER_SEGMENT; w++) {
      if (segmentRandom(s.vi, s.j, 870 + w) > density) continue
      const off = (w - 1) * 0.32
      out.push(makeWalker('walk', s.x + off, s.zMin, s.x + off, s.zMax, s.vi * 227 + s.j * 53 + w * 59))
    }
  }
  for (const s of SIDEWALK_HORIZONTAL_SLOTS) {
    for (let w = 0; w < WALKERS_PER_SEGMENT; w++) {
      if (segmentRandom(s.i, s.hj, 880 + w) > density) continue
      const off = (w - 1) * 0.32
      out.push(makeWalker('walk', s.xMin, s.z + off, s.xMax, s.z + off, s.i * 229 + s.hj * 61 + w * 67 + 9000))
    }
  }
  return out
}

/** Position along the path (0 = A, 1 = B), whether walking, and direction (+1 towards B). */
function pathState(w: Walker, t: number): { u: number; moving: boolean; dir: number } {
  const len = Math.hypot(w.bx - w.ax, w.bz - w.az)
  const travel = len / w.speed
  const wait = w.kind === 'cross' ? w.wait : 0.6
  const cycle = 2 * (travel + wait)
  let c = (t + w.phase) % cycle
  if (c < wait) return { u: 0, moving: false, dir: 1 }
  c -= wait
  if (c < travel) return { u: c / travel, moving: true, dir: 1 }
  c -= travel
  if (c < wait) return { u: 1, moving: false, dir: -1 }
  c -= wait
  return { u: 1 - c / travel, moving: true, dir: -1 }
}

/* ---------- Geometry (unit parts, positioned per instance) ---------- */

const PARTS = {
  // Low segment counts: figures are seen at street distance; ~700 triangles per person.
  legL: new THREE.CapsuleGeometry(0.068, 0.66, 2, 6).translate(0, -0.4, 0),
  legR: new THREE.CapsuleGeometry(0.068, 0.66, 2, 6).translate(0, -0.4, 0),
  torso: new THREE.CapsuleGeometry(0.15, 0.32, 3, 9).scale(1.08, 1, 0.72),
  dress: new THREE.CylinderGeometry(0.17, 0.32, 0.86, 10, 1, true).translate(0, -0.43, 0),
  armL: new THREE.CapsuleGeometry(0.05, 0.5, 2, 6).translate(0, -0.3, 0),
  armR: new THREE.CapsuleGeometry(0.05, 0.5, 2, 6).translate(0, -0.3, 0),
  head: new THREE.SphereGeometry(0.105, 10, 8).scale(0.92, 1.05, 1),
  hair: new THREE.SphereGeometry(0.112, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.9, 1),
  /** Gomesi puffed shoulders (2 per walker). */
  puff: new THREE.SphereGeometry(0.085, 7, 5).scale(1.1, 0.8, 1),
}
type PartName = keyof typeof PARTS
const PART_NAMES = Object.keys(PARTS) as PartName[]

const clothMat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide })
const skinMat = new THREE.MeshStandardMaterial({ roughness: 0.55 })

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const mBody = new THREE.Matrix4()
const mPart = new THREE.Matrix4()
const mLocal = new THREE.Matrix4()
const mRot = new THREE.Matrix4()
const qTmp = new THREE.Quaternion()
const eTmp = new THREE.Euler()
const vTmp = new THREE.Vector3()
const sTmp = new THREE.Vector3()

function limb(out: THREE.Matrix4, body: THREE.Matrix4, x: number, y: number, z: number, swing: number, roll = 0) {
  mLocal.makeTranslation(x, y, z)
  mRot.makeRotationFromEuler(eTmp.set(swing, 0, roll))
  return out.multiplyMatrices(body, mLocal).multiply(mRot)
}

export function Pedestrians() {
  const quality = useSettingsStore((s) => s.quality)
  const shadows = quality === 'high'
  const crowd = useMemo(() => buildCrowd(DENSITY[quality]), [quality])
  const drawRadius = DRAW_RADIUS[quality]
  const camera = useThree((s) => s.camera)
  const refs = useRef<Partial<Record<PartName, THREE.InstancedMesh | null>>>({})
  const hitCooldown = useRef(0)
  const frame = useRef(0)
  const knock = useRef<KnockState | null>(null)

  const counts: Record<PartName, number> = useMemo(() => {
    const n = crowd.length
    return { legL: n, legR: n, torso: n, dress: n, armL: n, armR: n, head: n, hair: n, puff: n * 2 }
  }, [crowd.length])

  useFrame(() => {
    const r = refs.current
    if (!r.torso) return
    const t = worldClock.t
    frame.current++
    let k = knock.current
    if (!k || k.at.length !== crowd.length) {
      const n = crowd.length
      k = knock.current = { at: new Float32Array(n).fill(-1), x: new Float32Array(n), z: new Float32Array(n), yaw: new Float32Array(n) }
    }
    const camX = camera.position.x
    const camZ = camera.position.z
    const bike = bikeTelemetry
    const bikeFast = Math.abs(bike.speed) > 0.8
    const r2 = drawRadius * drawRadius
    // Only walkers near the camera are drawn: they are packed into the first `slot` instances and the
    // meshes' counts are cut to that, so distant people cost nothing.
    let slot = 0
    for (let i = 0; i < crowd.length; i++) {
      const w = crowd[i]!

      let x: number
      let z: number
      let yaw: number
      let fall = 0
      let swing = 0
      let bob = 0
      if (k.at[i]! >= 0) {
        const since = t - k.at[i]!
        if (since > KNOCK_RECOVER_S) k.at[i] = -1
        x = k.x[i]!
        z = k.z[i]!
        yaw = k.yaw[i]!
        // Fall quickly, lie still, then get back up over the last second.
        fall = since < 0.4 ? since / 0.4 : since > KNOCK_RECOVER_S - 1 ? Math.max(0, KNOCK_RECOVER_S - since) : 1
      } else {
        const p = pathState(w, t)
        x = w.ax + (w.bx - w.ax) * p.u
        z = w.az + (w.bz - w.az) * p.u
        const dirX = (w.bx - w.ax) * p.dir
        const dirZ = (w.bz - w.az) * p.dir
        yaw = Math.atan2(dirX, dirZ)
        if (p.moving) {
          const stride = (t + w.phase) * w.speed * 2.6
          swing = Math.sin(stride) * 0.5
          bob = Math.abs(Math.cos(stride)) * 0.03
        } else {
          swing = Math.sin(t * 1.3 + w.phase) * 0.03
        }
        // Bike hit: close to the bike and the bike is moving.
        if (bikeFast && t > hitCooldown.current) {
          const bx = x - bike.x
          const bz = z - bike.z
          if (bx * bx + bz * bz < HIT_RADIUS * HIT_RADIUS && shouldApplyBikePedestrianInteraction()) {
            k.at[i] = t
            k.x[i] = x
            k.z[i] = z
            k.yaw[i] = yaw
            hitCooldown.current = t + 0.7
            emitPedestrianStrike()
          }
        }
      }

      const dxC = x - camX
      const dzC = z - camZ
      if (dxC * dxC + dzC * dzC > r2) continue
      const si = slot++
      const sleeve = w.gomesi || (!w.female && i % 3 === 0) ? w.skin : w.top
      r.legL!.setColorAt(si, w.female ? w.skin : w.bottom)
      r.legR!.setColorAt(si, w.female ? w.skin : w.bottom)
      r.torso!.setColorAt(si, w.top)
      r.dress!.setColorAt(si, w.bottom)
      r.armL!.setColorAt(si, sleeve)
      r.armR!.setColorAt(si, sleeve)
      r.head!.setColorAt(si, w.skin)
      r.hair!.setColorAt(si, w.hair)
      r.puff!.setColorAt(si * 2, w.top)
      r.puff!.setColorAt(si * 2 + 1, w.top)
      const h = w.height
      qTmp.setFromEuler(eTmp.set(-fall * 1.45, yaw, 0, 'YXZ'))
      mBody.compose(vTmp.set(x, 0.06 + bob + fall * 0.08, z), qTmp, sTmp.set(h, h, h))

      const legSwing = w.female && !w.gomesi ? swing * 0.6 : swing
      r.legL!.setMatrixAt(si, limb(mPart, mBody, 0.09, 0.86, 0, legSwing))
      r.legR!.setMatrixAt(si, limb(mPart, mBody, -0.09, 0.86, 0, -legSwing))
      mLocal.makeTranslation(0, 1.17, 0)
      r.torso!.setMatrixAt(si, mPart.multiplyMatrices(mBody, mLocal))
      if (w.female) {
        mLocal.makeTranslation(0, 0.98, 0)
        r.dress!.setMatrixAt(si, mPart.multiplyMatrices(mBody, mLocal))
      } else r.dress!.setMatrixAt(si, ZERO)
      r.armL!.setMatrixAt(si, limb(mPart, mBody, 0.2, 1.36, 0, -swing * 0.8, 0.08))
      r.armR!.setMatrixAt(si, limb(mPart, mBody, -0.2, 1.36, 0, swing * 0.8, -0.08))
      mLocal.makeTranslation(0, 1.57, 0.01)
      r.head!.setMatrixAt(si, mPart.multiplyMatrices(mBody, mLocal))
      mLocal.makeTranslation(0, 1.6, -0.005)
      r.hair!.setMatrixAt(si, mPart.multiplyMatrices(mBody, mLocal))
      if (w.gomesi) {
        mLocal.makeTranslation(0.19, 1.37, 0)
        r.puff!.setMatrixAt(si * 2, mPart.multiplyMatrices(mBody, mLocal))
        mLocal.makeTranslation(-0.19, 1.37, 0)
        r.puff!.setMatrixAt(si * 2 + 1, mPart.multiplyMatrices(mBody, mLocal))
      } else {
        r.puff!.setMatrixAt(si * 2, ZERO)
        r.puff!.setMatrixAt(si * 2 + 1, ZERO)
      }
    }
    for (const name of PART_NAMES) {
      const m = r[name]!
      m.count = name === 'puff' ? slot * 2 : slot
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  })

  return (
    <group>
      {PART_NAMES.map((name) => (
        <instancedMesh
          key={`${name}-${crowd.length}`}
          ref={(m) => {
            refs.current[name] = m
          }}
          args={[PARTS[name], name === 'head' || name === 'legL' || name === 'legR' ? skinMat : clothMat, counts[name]]}
          castShadow={shadows}
          frustumCulled={false}
        />
      ))}
    </group>
  )
}
