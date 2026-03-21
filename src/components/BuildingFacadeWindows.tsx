import type { ReactNode } from 'react'
import * as THREE from 'three'

/** Shared materials — one instance each, safe for many buildings. */
export const sharedWindowGlass = new THREE.MeshPhysicalMaterial({
  color: '#b4cde8',
  metalness: 0.22,
  roughness: 0.14,
  transmission: 0.45,
  thickness: 0.1,
  transparent: true,
  opacity: 0.88,
  envMapIntensity: 1.05,
})

export const sharedWindowGlassLit = new THREE.MeshPhysicalMaterial({
  color: '#f0e6a8',
  metalness: 0.08,
  roughness: 0.22,
  emissive: '#2a2410',
  emissiveIntensity: 0.35,
  transmission: 0.28,
  thickness: 0.08,
  transparent: true,
  opacity: 0.82,
  envMapIntensity: 0.65,
})

type BoxFace = 'pz' | 'nz' | 'px' | 'nx'

/**
 * Window grid on vertical faces of an axis-aligned box (local space).
 * Box extends x ∈ [-w/2,w/2], z ∈ [-d/2,d/2], y ∈ [baseY, baseY+height].
 */
export function BoxBuildingWindowGrids({
  width: w,
  depth: d,
  height,
  baseY,
  rows,
  eps = 0.022,
  litFraction = 0.28,
}: {
  width: number
  depth: number
  height: number
  baseY: number
  rows: number
  eps?: number
  /** Fraction of panes that use slightly “lit” glass for variety. */
  litFraction?: number
}) {
  const colsX = Math.max(2, Math.min(10, Math.floor(w / 0.52)))
  const colsZ = Math.max(2, Math.min(10, Math.floor(d / 0.52)))
  const rowH = height / rows
  const winWz = Math.min(0.36, (w - 0.28) / colsX - 0.08)
  const winHz = Math.min(0.48, rowH - 0.14)
  const winWx = Math.min(0.36, (d - 0.28) / colsZ - 0.08)
  const winHx = Math.min(0.48, rowH - 0.14)

  const panes: ReactNode[] = []
  let idx = 0

  const addPane = (
    key: string,
    position: [number, number, number],
    rotation: [number, number, number],
    gw: number,
    gh: number,
    salt: number,
  ) => {
    const lit = (Math.sin(idx * 12.9898 + salt) * 0.5 + 0.5) < litFraction
    const mat = lit ? sharedWindowGlassLit : sharedWindowGlass
    panes.push(
      <mesh key={key} position={position} rotation={rotation} material={mat}>
        <planeGeometry args={[gw, gh]} />
      </mesh>,
    )
    idx += 1
  }

  const faces: { id: BoxFace; salt: number }[] = [
    { id: 'pz', salt: 1 },
    { id: 'nz', salt: 2 },
    { id: 'px', salt: 3 },
    { id: 'nx', salt: 4 },
  ]

  for (const { id, salt } of faces) {
    if (id === 'pz' || id === 'nz') {
      const z = (id === 'pz' ? 1 : -1) * (d / 2 + eps)
      const rot: [number, number, number] = id === 'pz' ? [0, 0, 0] : [0, Math.PI, 0]
      for (let r = 0; r < rows; r++) {
        const y = baseY + r * rowH + rowH / 2
        for (let c = 0; c < colsX; c++) {
          const t = colsX <= 1 ? 0 : c / (colsX - 1)
          const x = (t - 0.5) * (w - winWz - 0.2)
          addPane(`${id}-${r}-${c}`, [x, y, z], rot, winWz, winHz, salt + r * 17 + c)
        }
      }
    } else {
      const x = (id === 'px' ? 1 : -1) * (w / 2 + eps)
      const rot: [number, number, number] = id === 'px' ? [0, Math.PI / 2, 0] : [0, -Math.PI / 2, 0]
      for (let r = 0; r < rows; r++) {
        const y = baseY + r * rowH + rowH / 2
        for (let c = 0; c < colsZ; c++) {
          const t = colsZ <= 1 ? 0 : c / (colsZ - 1)
          const z = (t - 0.5) * (d - winWx - 0.2)
          addPane(`${id}-${r}-${c}`, [x, y, z], rot, winWx, winHx, salt + r * 19 + c)
        }
      }
    }
  }

  return <group>{panes}</group>
}

/** Midrise / tall box: tighter vertical rhythm, optional skip of Z faces (photo mall). */
export function MidriseWindowGrids({
  footprintW,
  footprintD,
  totalHeight,
  floors,
  meshCenterY,
  skipZFaces = false,
  eps = 0.024,
}: {
  footprintW: number
  footprintD: number
  totalHeight: number
  floors: number
  meshCenterY: number
  skipZFaces?: boolean
  eps?: number
}) {
  const w = footprintW
  const d = footprintD
  const baseY = meshCenterY - totalHeight / 2
  const rowH = totalHeight / floors
  const colsX = Math.max(3, Math.min(14, Math.floor(w / 0.42)))
  const colsZ = Math.max(3, Math.min(14, Math.floor(d / 0.42)))
  const winW = Math.min(0.3, (w - 0.35) / colsX - 0.06)
  const winH = Math.min(0.38, rowH - 0.12)

  const panes: ReactNode[] = []
  let idx = 0

  const addPane = (
    key: string,
    position: [number, number, number],
    rotation: [number, number, number],
    gw: number,
    gh: number,
  ) => {
    const lit = (Math.sin(idx * 9.123 + floors) * 0.5 + 0.5) < 0.22
    const mat = lit ? sharedWindowGlassLit : sharedWindowGlass
    panes.push(
      <mesh key={key} position={position} rotation={rotation} material={mat}>
        <planeGeometry args={[gw, gh]} />
      </mesh>,
    )
    idx += 1
  }

  const zFaces: ('pz' | 'nz')[] = skipZFaces ? [] : ['pz', 'nz']
  for (const id of zFaces) {
    const z = (id === 'pz' ? 1 : -1) * (d / 2 + eps)
    const rot: [number, number, number] = id === 'pz' ? [0, 0, 0] : [0, Math.PI, 0]
    for (let f = 0; f < floors; f++) {
      const y = baseY + f * rowH + rowH / 2
      for (let c = 0; c < colsX; c++) {
        const t = colsX <= 1 ? 0.5 : c / (colsX - 1)
        const x = (t - 0.5) * (w - winW - 0.25)
        addPane(`z${id}-${f}-${c}`, [x, y, z], rot, winW, winH)
      }
    }
  }

  for (const id of ['px', 'nx'] as const) {
    const x = (id === 'px' ? 1 : -1) * (w / 2 + eps)
    const rot: [number, number, number] = id === 'px' ? [0, Math.PI / 2, 0] : [0, -Math.PI / 2, 0]
    const winW2 = Math.min(0.3, (d - 0.35) / colsZ - 0.06)
    for (let f = 0; f < floors; f++) {
      const y = baseY + f * rowH + rowH / 2
      for (let c = 0; c < colsZ; c++) {
        const t = colsZ <= 1 ? 0.5 : c / (colsZ - 1)
        const z = (t - 0.5) * (d - winW2 - 0.25)
        addPane(`x${id}-${f}-${c}`, [x, y, z], rot, winW2, winH)
      }
    }
  }

  return <group>{panes}</group>
}

/** Vertical window strips on ±Z of a box tower (local space at tower center). */
export function TowerFaceWindowGrid({
  towerH,
  halfW,
  halfD,
  eps = 0.03,
}: {
  towerH: number
  halfW: number
  halfD: number
  eps?: number
}) {
  const rows = Math.max(6, Math.floor(towerH / 2.4))
  const cols = 3
  const winW = Math.min(0.42, (2 * halfW - 0.35) / cols - 0.08)
  const innerH = towerH - 0.32
  const rowPitch = innerH / rows
  const winH = Math.min(0.52, rowPitch - 0.14)
  const y0 = -towerH / 2 + 0.16 + rowPitch / 2
  const panes: ReactNode[] = []
  let k = 0
  for (const sign of [1, -1] as const) {
    const z = sign * (halfD + eps)
    const rot: [number, number, number] = sign > 0 ? [0, 0, 0] : [0, Math.PI, 0]
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * rowPitch
      for (let c = 0; c < cols; c++) {
        const t = cols <= 1 ? 0.5 : c / (cols - 1)
        const x = (t - 0.5) * (2 * halfW - winW - 0.2)
        const lit = (Math.sin(k++ * 7.1) * 0.5 + 0.5) < 0.25
        panes.push(
          <mesh
            key={`${sign}-${r}-${c}`}
            position={[x, y, z]}
            rotation={rot}
            material={lit ? sharedWindowGlassLit : sharedWindowGlass}
          >
            <planeGeometry args={[winW, winH]} />
          </mesh>,
        )
      }
    }
  }
  return <group>{panes}</group>
}

/** Vertical glass strips around a cylinder (Y up). */
export function CylinderCurtainPanels({
  radius,
  centerY,
  height,
  segments = 22,
}: {
  radius: number
  centerY: number
  height: number
  segments?: number
}) {
  const panes: ReactNode[] = []
  const r = radius + 0.04
  const w = ((2 * Math.PI * r) / segments) * 0.72
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const lit = (Math.sin(i * 2.7) * 0.5 + 0.5) < 0.3
    panes.push(
      <mesh
        key={i}
        position={[x, centerY, z]}
        rotation={[0, -a + Math.PI / 2, 0]}
        material={lit ? sharedWindowGlassLit : sharedWindowGlass}
      >
        <planeGeometry args={[w, height * 0.94]} />
      </mesh>,
    )
  }
  return <group>{panes}</group>
}

const mullionMat = new THREE.MeshStandardMaterial({
  color: '#0c4a6e',
  roughness: 0.35,
  metalness: 0.55,
})

/** Horizontal spandrels on front/back of a glass box (+Z / -Z) and shallow bands on sides. */
export function GlassTowerMullions({
  width,
  height,
  depth,
  centerY,
}: {
  width: number
  height: number
  depth: number
  centerY: number
}) {
  const hw = width / 2
  const hd = depth / 2
  const bands = 6
  const t = 0.06
  const ys: number[] = []
  for (let b = 1; b < bands; b++) {
    ys.push(centerY - height / 2 + (b / bands) * height)
  }
  const out: ReactNode[] = []
  let k = 0
  for (const y of ys) {
    out.push(
      <mesh key={`hzp-${k}`} position={[0, y, hd + 0.02]} material={mullionMat}>
        <boxGeometry args={[width * 0.98, t, 0.04]} />
      </mesh>,
    )
    out.push(
      <mesh key={`hzn-${k}`} position={[0, y, -hd - 0.02]} material={mullionMat}>
        <boxGeometry args={[width * 0.98, t, 0.04]} />
      </mesh>,
    )
    out.push(
      <mesh key={`vxp-${k}`} position={[hw + 0.02, y, 0]} material={mullionMat}>
        <boxGeometry args={[0.04, t, depth * 0.98]} />
      </mesh>,
    )
    out.push(
      <mesh key={`vxn-${k}`} position={[-hw - 0.02, y, 0]} material={mullionMat}>
        <boxGeometry args={[0.04, t, depth * 0.98]} />
      </mesh>,
    )
    k += 1
  }
  return <group>{out}</group>
}
