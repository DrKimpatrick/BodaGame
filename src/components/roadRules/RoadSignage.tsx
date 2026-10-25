import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ewHalf, MEDIAN_W, NUM_BLOCKS, nsHalf, roadStripCenterX, roadStripCenterZ } from '../../game/cityGrid'
import { segmentRandom } from '../../game/roadDecorPlacements'
import { ROAD_TOP_Y } from '../../game/roadSurfaceFeatures'
import { roadTextSvg, signSvg } from '../../roadRules/signs'
import {
  axisOf,
  CONTROLLED_APPROACHES,
  faceOncomingYaw,
  approachHalf,
  headingVec,
  isSchoolSegment,
  leftVec,
  mustYield,
  SCHOOL_SEGMENTS,
  stopLineEdge,
  ZEBRAS,
  type Heading,
  type Segment,
} from '../../roadRules/world/junctions'
import { svgTexture } from './svgTexture'

/**
 * Regulatory and warning signs, stop lines, give-way markings and painted legends for the whole city.
 * Each kind is one InstancedMesh, so the whole set costs about a dozen draw calls.
 */

type SignKind = 'stop' | 'giveway' | 'speed50' | 'speed30' | 'school' | 'zebra' | 'roundabout'
type SignPlacement = { kind: SignKind; x: number; z: number; yaw: number; y: number }
type Flat = { x: number; z: number; yaw: number; sx?: number }

const SIGN_SIZE: Record<SignKind, number> = {
  stop: 0.78,
  giveway: 0.86,
  speed50: 0.72,
  speed30: 0.72,
  school: 0.82,
  zebra: 0.7,
  roundabout: 0.72,
}
const SIGN_KINDS = Object.keys(SIGN_SIZE) as SignKind[]
const LINE_Y = ROAD_TOP_Y + 0.006

const barYaw: Record<Heading, number> = { N: 0, S: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }

function segmentStart(seg: Segment, h: Heading): { x: number; z: number } {
  // Junction the traveller has just left on this segment.
  if (seg.axis === 'ns') {
    const x = roadStripCenterX(seg.strip)
    const z = h === 'N' ? roadStripCenterZ(seg.block) : roadStripCenterZ(seg.block + 1)
    return { x, z }
  }
  const z = roadStripCenterZ(seg.strip)
  const x = h === 'E' ? roadStripCenterX(seg.block) : roadStripCenterX(seg.block + 1)
  return { x, z }
}

/** Half width of the segment's own road, and of the road crossed at its start junction (for heading h). */
function segHalves(seg: Segment, h: Heading): { own: number; startCross: number } {
  if (seg.axis === 'ns') return { own: nsHalf(seg.strip), startCross: ewHalf(h === 'N' ? seg.block : seg.block + 1) }
  return { own: ewHalf(seg.strip), startCross: nsHalf(h === 'E' ? seg.block : seg.block + 1) }
}

function buildLayout() {
  const signs: SignPlacement[] = []
  const stopLines: Flat[] = []
  const giveWayDashes: Flat[] = []
  const stopText: Flat[] = []
  const schoolText: Flat[] = []

  /** Sign on the traveller's left verge, `back` metres before `base`, `roadHalf` from the road centre. */
  const add = (kind: SignKind, base: { x: number; z: number }, h: Heading, back: number, roadHalf: number, y = 2.05) => {
    const hv = headingVec(h)
    const lv = leftVec(h)
    const side = roadHalf + 0.6
    signs.push({
      kind,
      x: base.x - hv.x * back + lv.x * side,
      z: base.z - hv.z * back + lv.z * side,
      yaw: faceOncomingYaw(h),
      y,
    })
  }

  for (const { jn, h } of CONTROLLED_APPROACHES) {
    const hv = headingVec(h)
    const lv = leftVec(h)
    const d = stopLineEdge(jn, h)
    const aH = approachHalf(jn, h)
    // The line covers the traveller's half of the road (beyond the median on dual carriageways).
    const inner = aH > 7 ? MEDIAN_W / 2 : 0
    const span = aH - inner
    const mid = inner + span / 2
    const cx = jn.x - hv.x * d + lv.x * mid
    const cz = jn.z - hv.z * d + lv.z * mid
    if (jn.control === 'giveway' || jn.control === 'roundabout') {
      for (const row of [0, 0.42]) {
        const n = Math.floor((span - 0.4) / 0.5)
        for (let k = 0; k < n; k++) {
          const off = -span / 2 + 0.35 + k * 0.5
          giveWayDashes.push({
            x: cx - hv.x * row + lv.x * off,
            z: cz - hv.z * row + lv.z * off,
            yaw: barYaw[h],
          })
        }
      }
      if (jn.control === 'roundabout') {
        add('roundabout', jn, h, d + 0.6, aH, 2.42)
        add('giveway', jn, h, d + 0.6, aH, 1.62)
      } else add('giveway', jn, h, d + 0.5, aH)
    } else {
      stopLines.push({ x: cx, z: cz, yaw: barYaw[h], sx: span - 0.12 })
      if (jn.control === 'stop' && mustYield(jn, axisOf(h))) {
        add('stop', jn, h, d + 0.5, aH)
        stopText.push({ x: cx - hv.x * 2.4, z: cz - hv.z * 2.4, yaw: barYaw[h] + Math.PI })
      }
    }
  }

  for (const seg of SCHOOL_SEGMENTS) {
    const hs: Heading[] = seg.axis === 'ns' ? ['N', 'S'] : ['E', 'W']
    for (const h of hs) {
      const start = segmentStart(seg, h)
      const hv = headingVec(h)
      const lv = leftVec(h)
      const { own, startCross } = segHalves(seg, h)
      add('school', start, h, -(startCross + 2.6), own, 2.32)
      add('speed30', start, h, -(startCross + 2.6), own, 1.6)
      const along = startCross + 6.5
      schoolText.push({
        x: start.x + hv.x * along + lv.x * (own / 2),
        z: start.z + hv.z * along + lv.z * (own / 2),
        yaw: barYaw[h] + Math.PI,
      })
    }
  }

  for (let strip = 1; strip < NUM_BLOCKS; strip++) {
    for (let block = 0; block < NUM_BLOCKS; block++) {
      for (const axis of ['ns', 'ew'] as const) {
        if (isSchoolSegment(axis, strip, block)) continue
        if (segmentRandom(strip, block, axis === 'ns' ? 6161 : 6262) > 0.2) continue
        const h: Heading =
          axis === 'ns'
            ? segmentRandom(strip, block, 6363) < 0.5 ? 'N' : 'S'
            : segmentRandom(strip, block, 6464) < 0.5 ? 'E' : 'W'
        const seg = { axis, strip, block }
        const { own, startCross } = segHalves(seg, h)
        add('speed50', segmentStart(seg, h), h, -(startCross + 3.2), own)
      }
    }
  }

  for (const zb of ZEBRAS) {
    const hs: Heading[] = zb.axis === 'ns' ? ['N', 'S'] : ['E', 'W']
    const own = zb.axis === 'ns' ? nsHalf(zb.strip) : ewHalf(zb.strip)
    for (const h of hs) add('zebra', zb, h, 3.4, own, 1.95)
  }

  return { signs, stopLines, giveWayDashes, stopText, schoolText }
}

const poleGeo = new THREE.CylinderGeometry(0.035, 0.04, 1, 8)
poleGeo.translate(0, 0.5, 0)
const poleMat = new THREE.MeshStandardMaterial({ color: '#8f969d', roughness: 0.45, metalness: 0.7 })
const lineMat = new THREE.MeshStandardMaterial({
  color: '#ecebe4',
  roughness: 0.75,
  polygonOffset: true,
  polygonOffsetFactor: -2,
})

function useInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  items: { x: number; y: number; z: number; yaw: number; flat?: boolean; sy?: number; sx?: number }[],
) {
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const o = new THREE.Object3D()
    items.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z)
      o.rotation.set(it.flat ? -Math.PI / 2 : 0, it.yaw, 0, 'YXZ')
      o.scale.set(it.sx ?? 1, it.sy ?? 1, 1)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [ref, items])
}

function SignFaces({ kind, items }: { kind: SignKind; items: SignPlacement[] }) {
  const front = useRef<THREE.InstancedMesh>(null)
  const back = useRef<THREE.InstancedMesh>(null)
  const { geo, frontMat, backMat } = useMemo(() => {
    const s = SIGN_SIZE[kind]
    const g = new THREE.PlaneGeometry(s, s)
    g.translate(0, 0, 0.012)
    const svg = signSvg(kind)
    return {
      geo: g,
      frontMat: new THREE.MeshStandardMaterial({
        map: svgTexture(svg, 256),
        alphaTest: 0.5,
        roughness: 0.4,
        metalness: 0.05,
      }),
      backMat: new THREE.MeshStandardMaterial({
        map: svgTexture(svg, 128, 128, '#9ca3a9'),
        alphaTest: 0.5,
        roughness: 0.5,
        metalness: 0.6,
        side: THREE.BackSide,
      }),
    }
  }, [kind])
  const placed = useMemo(() => items.map((p) => ({ ...p })), [items])
  useInstances(front, placed)
  useInstances(back, placed)
  return (
    <>
      <instancedMesh ref={front} args={[geo, frontMat, items.length]} castShadow />
      <instancedMesh ref={back} args={[geo, backMat, items.length]} />
    </>
  )
}

function FlatMarks({
  items,
  geo,
  mat,
}: {
  items: Flat[]
  geo: THREE.BufferGeometry
  mat: THREE.Material
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const placed = useMemo(() => items.map((f) => ({ ...f, y: LINE_Y, flat: true })), [items])
  useInstances(ref, placed)
  if (items.length === 0) return null
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} receiveShadow />
}

function textMat(text: string) {
  return new THREE.MeshStandardMaterial({
    map: svgTexture(roadTextSvg(text), 256, 128),
    alphaTest: 0.4,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
}

export function RoadSignage() {
  const layout = useMemo(() => buildLayout(), [])
  const poleRef = useRef<THREE.InstancedMesh>(null)
  const poles = useMemo(() => {
    // One pole per sign position; stacked signs (school + 30) share the taller one.
    const byPos = new Map<string, { x: number; z: number; yaw: number; y: number; sy: number }>()
    for (const s of layout.signs) {
      const k = `${s.x.toFixed(2)},${s.z.toFixed(2)}`
      const top = s.y + SIGN_SIZE[s.kind] / 2
      const prev = byPos.get(k)
      if (!prev || prev.sy < top) byPos.set(k, { x: s.x, z: s.z, yaw: s.yaw, y: 0, sy: top })
    }
    return [...byPos.values()]
  }, [layout])
  useInstances(poleRef, poles)

  const geos = useMemo(
    () => ({
      stopLine: new THREE.PlaneGeometry(1, 0.3),
      dash: new THREE.PlaneGeometry(0.3, 0.16),
      text: new THREE.PlaneGeometry(1.5, 0.75),
    }),
    [],
  )
  const mats = useMemo(() => ({ stop: textMat('STOP'), school: textMat('SCHOOL') }), [])
  const byKind = useMemo(
    () => SIGN_KINDS.map((k) => [k, layout.signs.filter((s) => s.kind === k)] as const),
    [layout],
  )

  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeo, poleMat, poles.length]} castShadow />
      {byKind.map(([k, items]) => (items.length ? <SignFaces key={k} kind={k} items={items} /> : null))}
      <FlatMarks items={layout.stopLines} geo={geos.stopLine} mat={lineMat} />
      <FlatMarks items={layout.giveWayDashes} geo={geos.dash} mat={lineMat} />
      <FlatMarks items={layout.stopText} geo={geos.text} mat={mats.stop} />
      <FlatMarks items={layout.schoolText} geo={geos.text} mat={mats.school} />
    </group>
  )
}
