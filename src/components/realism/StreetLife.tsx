import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CITY_START, CITY_TOTAL, ewHalf, ewKind, NUM_BLOCKS, nsHalf, nsKind, roadStripCenterX, roadStripCenterZ } from '../../game/cityGrid'
import { segmentRandom } from '../../game/roadDecorPlacements'
import { ROUNDABOUT } from '../../roadRules/world/junctions'
import { ROUNDABOUTS, STREETS_NS } from '../../game/kampalaMap'
import { useGameStore } from '../../store/useGameStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { BodaModel } from '../BodaModel'
import { RiderModel } from '../RiderModel'
import { corrugatedTexture, makeAtlas, type Atlas } from './textures'

/**
 * Street lights along every road (instanced: 3 draw calls for ~1,300 lamps) that switch on at dusk, and
 * boda stages: clusters of parked bodas with riders waiting for customers at busy corners, as on every
 * Kampala street.
 */

const SPACING = 26

type Lamp = { x: number; z: number; yaw: number }

function buildLamps(spacing: number): Lamp[] {
  const out: Lamp[] = []
  // Keep lamps out of junction boxes: the box depth along a road is the crossing road's half width.
  const nearJunction = (along: number, crossHalf: (k: number) => number) => {
    const pitch = roadStripCenterZ(1) - roadStripCenterZ(0)
    const k = Math.round((along - roadStripCenterZ(0)) / pitch)
    const nearest = roadStripCenterZ(0) + k * pitch
    return Math.abs(along - nearest) < crossHalf(k) + 3
  }
  const nearRoundabout = (x: number, z: number) =>
    ROUNDABOUTS.some((r) => Math.hypot(x - roadStripCenterX(r.i), z - roadStripCenterZ(r.j)) < ROUNDABOUT.disc + 2)
  for (let k = 0; k <= NUM_BLOCKS; k++) {
    const c = roadStripCenterX(k)
    for (let a = CITY_START + 6; a < CITY_START + CITY_TOTAL - 6; a += spacing) {
      for (const side of [-1, 1]) {
        // Staggered sides, so lamps alternate like real streets. Murram roads have no street lights.
        const along = a + (side > 0 ? spacing / 2 : 0)
        if (nsKind(k) !== 'murram' && !nearJunction(along, ewHalf)) {
          const vx = c + side * (nsHalf(k) + 0.45)
          if (!nearRoundabout(vx, along)) out.push({ x: vx, z: along, yaw: side > 0 ? Math.PI / 2 : -Math.PI / 2 })
        }
        if (ewKind(k) !== 'murram' && !nearJunction(along, nsHalf)) {
          const hz = c + side * (ewHalf(k) + 0.45)
          if (!nearRoundabout(along, hz)) out.push({ x: along, z: hz, yaw: side > 0 ? Math.PI : 0 })
        }
        // Dual carriageways also get lamps down the median.
        if (side > 0 && nsKind(k) === 'dual' && !nearJunction(along, ewHalf) && !nearRoundabout(c, along)) out.push({ x: c, z: along, yaw: Math.PI / 2 })
        if (side > 0 && ewKind(k) === 'dual' && !nearJunction(along, nsHalf) && !nearRoundabout(along, c)) out.push({ x: along, z: c, yaw: 0 })
      }
    }
  }
  return out
}

const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 7, 8).translate(0, 3.5, 0)
const armGeo = new THREE.BoxGeometry(0.08, 0.08, 1.6).translate(0, 6.9, 0.75)
const headGeo = new THREE.BoxGeometry(0.34, 0.12, 0.6).translate(0, 6.85, 1.5)
const poleMat = new THREE.MeshStandardMaterial({ color: '#6b7178', roughness: 0.5, metalness: 0.6 })
const headMat = new THREE.MeshStandardMaterial({ color: '#e5e7eb', emissive: '#ffd9a0', emissiveIntensity: 0, roughness: 0.4 })

export function StreetLights() {
  const quality = useSettingsStore((s) => s.quality)
  const lamps = useMemo(() => buildLamps(quality === 'low' ? SPACING * 1.6 : SPACING), [quality])
  const weather = useGameStore((s) => s.weather)
  const refs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)]
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    for (const r of refs) {
      const m = r.current
      if (!m) continue
      lamps.forEach((l, i) => {
        o.position.set(l.x, 0, l.z)
        o.rotation.set(0, l.yaw, 0)
        o.updateMatrix()
        m.setMatrixAt(i, o.matrix)
      })
      m.instanceMatrix.needsUpdate = true
      m.computeBoundingSphere()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lamps])
  useLayoutEffect(() => {
    headMat.emissiveIntensity = weather === 'dusk' ? 2.4 : weather === 'rain' ? 0.6 : 0
  }, [weather])
  return (
    <group>
      <instancedMesh ref={refs[0]} args={[poleGeo, poleMat, lamps.length]} castShadow />
      <instancedMesh ref={refs[1]} args={[armGeo, poleMat, lamps.length]} />
      <instancedMesh ref={refs[2]} args={[headGeo, headMat, lamps.length]} />
    </group>
  )
}

/** Boda stages on the shoulder near some junction corners. */
/* ---------- Boda stage shelters: a painted board with the stage name, a tin roof on poles, a bench ---------- */

const STAGE_NAMES = STREETS_NS.map((n) => n.replace(/ (Rd|St|Ave|Dr|By-pass)$/, '').toUpperCase())
let stageAtlas: Atlas | null = null
function stageSigns(): Atlas {
  stageAtlas ??= makeAtlas(
    'stages',
    STAGE_NAMES,
    (g, name, _i, w, h) => {
      g.fillStyle = '#facc15'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#111827'
      g.fillRect(0, 0, w, 34)
      g.fillStyle = '#facc15'
      g.font = 'bold 24px "Arial Narrow", Arial, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('BODA BODA STAGE', w / 2, 18)
      g.fillStyle = '#111827'
      let size = 52
      g.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`
      while (g.measureText(name).width > w - 30 && size > 24) {
        size -= 2
        g.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`
      }
      g.fillText(name, w / 2, 34 + (h - 34) / 2 + 2)
      g.strokeStyle = '#111827'
      g.lineWidth = 4
      g.strokeRect(2, 2, w - 4, h - 4)
    },
    512,
    128,
  )
  return stageAtlas
}

const tinRoof = (() => {
  const t = corrugatedTexture().clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.35, side: THREE.DoubleSide })
})()
const shelterPoleMat = new THREE.MeshStandardMaterial({ color: '#3f3f46', roughness: 0.6, metalness: 0.5 })
const benchMat = new THREE.MeshStandardMaterial({ color: '#7c4a21', roughness: 0.9 })
let stageSignMat: THREE.MeshStandardMaterial | null = null

/** Shelter over a stage of `n` bikes. Local x points away from the road (`side` = ±1), z runs along the bikes. */
function StageShelter({ n, side, sign }: { n: number; side: number; sign: number }) {
  const atlas = stageSigns()
  stageSignMat ??= new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.7 })
  const len = n * 1.1 + 1.2
  const zc = (n - 1) * 0.55
  const front = -0.8 * side
  const back = 1.7 * side
  return (
    <group>
      {[front, back].flatMap((x) =>
        [zc - len / 2 + 0.1, zc + len / 2 - 0.1].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, x === front ? 1.3 : 1.15, z]} material={shelterPoleMat}>
            <boxGeometry args={[0.06, x === front ? 2.6 : 2.3, 0.06]} />
          </mesh>
        )),
      )}
      {/* Tin roof falling away from the road */}
      <mesh position={[(front + back) / 2, 2.45, zc]} rotation={[0, 0, side * -0.12]} material={tinRoof} castShadow>
        <boxGeometry args={[2.7, 0.03, len]} />
      </mesh>
      <mesh position={[front - side * 0.02, 2.95, zc]} rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]} geometry={atlas.geometry(sign, Math.min(3, len), 0.75)} material={stageSignMat} />
      <mesh position={[back - side * 0.25, 0.45, zc]} material={benchMat}>
        <boxGeometry args={[0.35, 0.06, len - 0.6]} />
      </mesh>
    </group>
  )
}

export function BodaStages() {
  const stages = useMemo(() => {
    const out: { x: number; z: number; yaw: number; n: number; side: number; sign: number; key: string }[] = []
    for (let i = 1; i < NUM_BLOCKS; i++) {
      for (let j = 1; j < NUM_BLOCKS; j++) {
        if (segmentRandom(i, j, 8801) > 0.14) continue
        if (ROUNDABOUTS.some((r) => r.i === i && r.j === j)) continue
        const sx = segmentRandom(i, j, 8802) < 0.5 ? 1 : -1
        const sz = segmentRandom(i, j, 8803) < 0.5 ? 1 : -1
        // On the pavement of the N–S road, just past the junction corner.
        out.push({
          x: roadStripCenterX(i) + sx * (nsHalf(i) + 1.1),
          z: roadStripCenterZ(j) + sz * (ewHalf(j) + 7),
          yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2,
          n: 2 + Math.floor(segmentRandom(i, j, 8804) * 3),
          side: sx,
          sign: i,
          key: `stage-${i}-${j}`,
        })
      }
    }
    return out
  }, [])
  return (
    <group>
      {stages.map((s) => (
        <group key={s.key} position={[s.x, 0, s.z]}>
          <StageShelter n={s.n} side={s.side} sign={s.sign} />
          {Array.from({ length: s.n }, (_, k) => (
            <group key={k} position={[0, 0, k * 1.1]} rotation={[0, s.yaw + (segmentRandom(k, s.n, 8805) - 0.5) * 0.4, 0]}>
              <BodaModel spin={false} low />
              {/* Most bikes have their rider sitting on them, waiting for a fare */}
              {segmentRandom(k, s.n, 8806) < 0.7 ? (
                <group position={[0, 0.21, 0]}>
                  <RiderModel />
                </group>
              ) : null}
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}
