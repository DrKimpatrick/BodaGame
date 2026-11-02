import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Shared parts for people: a sculpted head with a painted face, and body parts with real proportions (shoulders,
 * waist, neck, tapered limbs, shoes). Used by both the walking crowd and the people standing still. Faces are drawn
 * in code (no photos or downloads) into one atlas, so every person still shares a material.
 *
 * Forward is +Z. A person is about 1.7 m tall, with the ground at y = 0.
 */

const CELLS = 4
const CELL_PX = 256

export const SKIN_TONES = ['#5a3a29', '#6f4a33', '#835739', '#9a6c46']
/** Atlas columns: two women's faces, then two men's. */
export const FACE_VARIANTS = 4

function drawFace(g: CanvasRenderingContext2D, skin: string, variant: number, seed: number) {
  const s = CELL_PX
  const female = variant < 2
  const base = new THREE.Color(skin)
  const shade = base.clone().multiplyScalar(0.72).getStyle()
  const light = base.clone().lerp(new THREE.Color('#e9b98f'), 0.16).getStyle()
  g.fillStyle = skin
  g.fillRect(0, 0, s, s)
  // Form: light on the forehead and cheeks, shade along the jaw and at the temples.
  const form = g.createRadialGradient(s * 0.5, s * 0.42, s * 0.05, s * 0.5, s * 0.5, s * 0.5)
  form.addColorStop(0, light)
  form.addColorStop(0.6, skin)
  form.addColorStop(1, shade)
  g.fillStyle = form
  g.fillRect(0, 0, s, s)

  const eyeY = s * 0.47
  const eyeX = s * 0.185
  const eyeW = s * (female ? 0.066 : 0.06)
  const eyeH = s * (female ? 0.026 : 0.022)
  // Eye sockets: soft shade, which is what gives a face depth
  for (const d of [-1, 1]) {
    const cx = s / 2 + d * eyeX
    const socket = g.createRadialGradient(cx, eyeY, 0, cx, eyeY, eyeW * 1.9)
    socket.addColorStop(0, 'rgba(25,12,6,0.42)')
    socket.addColorStop(1, 'rgba(25,12,6,0)')
    g.fillStyle = socket
    g.fillRect(cx - eyeW * 2, eyeY - eyeW * 2, eyeW * 4, eyeW * 4)
  }
  for (const d of [-1, 1]) {
    const cx = s / 2 + d * eyeX
    // White of the eye, a little shaded so it doesn't stare
    g.save()
    g.beginPath()
    g.ellipse(cx, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2)
    g.clip()
    g.fillStyle = '#d9d0c2'
    g.fillRect(cx - eyeW, eyeY - eyeH, eyeW * 2, eyeH * 2)
    // Iris fills most of the opening, as it does on a real eye at rest
    g.fillStyle = '#1e0f08'
    g.beginPath()
    g.arc(cx, eyeY - eyeH * 0.1, eyeH * 1.15, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.85)'
    g.beginPath()
    g.arc(cx - eyeH * 0.35, eyeY - eyeH * 0.42, eyeH * 0.2, 0, Math.PI * 2)
    g.fill()
    // Shade under the upper lid
    g.fillStyle = 'rgba(15,7,3,0.4)'
    g.fillRect(cx - eyeW, eyeY - eyeH, eyeW * 2, eyeH * 0.55)
    g.restore()
    // Upper lid and lashes
    g.strokeStyle = '#0f0805'
    g.lineWidth = s * (female ? 0.015 : 0.01)
    g.lineCap = 'round'
    g.beginPath()
    g.ellipse(cx, eyeY, eyeW * 1.04, eyeH * 1.08, 0, Math.PI * 1.04, Math.PI * 1.96)
    g.stroke()
    // Eyebrow, following the socket
    g.strokeStyle = '#150c07'
    g.lineWidth = s * (female ? 0.011 : 0.02)
    g.beginPath()
    const browY = eyeY - s * (female ? 0.066 : 0.06)
    g.moveTo(cx - d * eyeW * 1.05, browY + s * 0.008)
    g.quadraticCurveTo(cx + d * eyeW * 0.15, browY - s * 0.016 - seed * s * 0.004, cx + d * eyeW * 1.3, browY + s * 0.016)
    g.stroke()
  }
  // Nose: bridge highlight, shadow beneath, nostrils
  const noseY = s * 0.62
  const bridge = g.createLinearGradient(s * 0.44, 0, s * 0.56, 0)
  bridge.addColorStop(0, 'rgba(255,225,190,0)')
  bridge.addColorStop(0.5, 'rgba(255,225,190,0.2)')
  bridge.addColorStop(1, 'rgba(255,225,190,0)')
  g.fillStyle = bridge
  g.fillRect(s * 0.44, s * 0.45, s * 0.12, s * 0.17)
  g.fillStyle = 'rgba(15,7,3,0.34)'
  g.beginPath()
  g.ellipse(s / 2, noseY + s * 0.018, s * 0.075, s * 0.024, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(10,4,2,0.75)'
  for (const d of [-1, 1]) {
    g.beginPath()
    g.ellipse(s / 2 + d * s * 0.032, noseY + s * 0.012, s * 0.015, s * 0.009, 0, 0, Math.PI * 2)
    g.fill()
  }
  // Mouth: upper and lower lip, parting line. A small upward curve reads as friendly.
  const mouthY = s * 0.745
  const mouthW = s * (female ? 0.1 : 0.092)
  g.fillStyle = female ? '#8c3c38' : base.clone().multiplyScalar(0.72).lerp(new THREE.Color('#7a3a33'), 0.55).getStyle()
  g.beginPath()
  g.moveTo(s / 2 - mouthW, mouthY)
  g.quadraticCurveTo(s / 2 - mouthW * 0.4, mouthY - s * 0.03, s / 2, mouthY - s * 0.016)
  g.quadraticCurveTo(s / 2 + mouthW * 0.4, mouthY - s * 0.03, s / 2 + mouthW, mouthY)
  g.quadraticCurveTo(s / 2, mouthY + s * (female ? 0.05 : 0.036), s / 2 - mouthW, mouthY)
  g.fill()
  g.strokeStyle = 'rgba(10,3,2,0.8)'
  g.lineWidth = s * 0.008
  g.beginPath()
  g.moveTo(s / 2 - mouthW, mouthY)
  g.quadraticCurveTo(s / 2, mouthY + s * 0.008, s / 2 + mouthW, mouthY)
  g.stroke()
  if (!female) {
    // Short beard or moustache on some men
    g.fillStyle = 'rgba(10,6,4,0.5)'
    if (variant === 3) {
      g.beginPath()
      g.ellipse(s / 2, s * 0.86, s * 0.17, s * 0.075, 0, 0, Math.PI * 2)
      g.fill()
    }
    g.fillRect(s / 2 - mouthW * 0.85, mouthY - s * 0.052, mouthW * 1.7, s * 0.015)
  }
}

let atlasTexture: THREE.CanvasTexture | null = null

/** All faces in one texture. Rows are skin tones, columns are faces; the last cell is plain white for bodies. */
export function faceAtlas(): THREE.CanvasTexture {
  if (atlasTexture) return atlasTexture
  const c = document.createElement('canvas')
  c.width = c.height = CELLS * CELL_PX
  const g = c.getContext('2d')!
  for (let row = 0; row < CELLS; row++) {
    for (let col = 0; col < CELLS; col++) {
      g.save()
      g.translate(col * CELL_PX, row * CELL_PX)
      g.beginPath()
      g.rect(0, 0, CELL_PX, CELL_PX)
      g.clip()
      if (row === CELLS - 1 && col === CELLS - 1) {
        g.fillStyle = '#ffffff'
        g.fillRect(0, 0, CELL_PX, CELL_PX)
      } else {
        drawFace(g, SKIN_TONES[row]!, col, (row * 3 + col) % 4)
      }
      g.restore()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.flipY = false
  atlasTexture = t
  return t
}

/** UV offset of a face. A tone/face pair that would land on the white cell uses its neighbour. */
export function faceCell(tone: number, face: number): [number, number] {
  const row = tone % CELLS
  let col = face % FACE_VARIANTS
  if (row === CELLS - 1 && col === CELLS - 1) col = CELLS - 2
  return [col / CELLS, row / CELLS]
}

/** UV of a white texel, for parts coloured only by vertex colour. */
const WHITE_UV: [number, number] = [(CELLS - 0.5) / CELLS, (CELLS - 0.5) / CELLS]

/**
 * Head and neck, centred on the middle of the head, with UVs in the first atlas cell. The front is a planar
 * projection of the painted face; the sides and back use the plain skin at the cell's edge (hair covers most of it).
 */
export function headGeometry(radial = 12, rings = 9): THREE.BufferGeometry {
  const sphere = new THREE.SphereGeometry(1, radial, rings)
  const pos = sphere.attributes.position!
  const uv = sphere.attributes.uv!
  const W = 0.09
  const H = 0.122
  const D = 0.105
  const inset = 0.94 / CELLS
  const centre = 0.5 / CELLS
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i)
    const ny = pos.getY(i)
    const nz = pos.getZ(i)
    // Narrow the jaw, round the chin forward, flatten the cheeks slightly.
    const jaw = ny < 0 ? 1 - 0.34 * ny * ny : 1
    const x = nx * W * jaw
    const y = ny * H
    let z = nz * D * (ny < 0 ? 1 - 0.12 * ny * ny : 1)
    // Nose and brow, only on the face
    if (nz > 0) {
      const nose = Math.exp(-(nx * nx * 42 + (ny + 0.12) * (ny + 0.12) * 18))
      z += nose * 0.024
      const brow = Math.exp(-((ny - 0.2) * (ny - 0.2) * 60)) * (1 - nx * nx)
      z += brow * 0.006
    }
    pos.setXYZ(i, x, y, z)
    if (nz >= -0.05) {
      // Canvas y runs downward and the texture isn't flipped, so v grows towards the chin.
      uv.setXY(i, centre + nx * inset * 0.5, centre - ny * inset * 0.5)
    } else {
      uv.setXY(i, centre + Math.sign(nx || 1) * inset * 0.5, centre - ny * inset * 0.5)
    }
  }
  sphere.computeVertexNormals()
  const neck = new THREE.CylinderGeometry(0.046, 0.054, 0.15, 8, 1, true).translate(0, -0.15, -0.012)
  const nUv = neck.attributes.uv!
  for (let i = 0; i < nUv.count; i++) nUv.setXY(i, centre + inset * 0.48, centre)
  const ear = (d: number) => {
    const g = new THREE.SphereGeometry(0.02, 5, 4).scale(0.5, 1.15, 0.9).translate(d * 0.088, -0.005, -0.006)
    const u = g.attributes.uv!
    for (let i = 0; i < u.count; i++) u.setXY(i, centre + inset * 0.48, centre)
    return g
  }
  return mergeGeometries([sphere.toNonIndexed(), neck.toNonIndexed(), ear(1).toNonIndexed(), ear(-1).toNonIndexed()])!
}

/** Hair: a cap sitting back on the head so the forehead shows. */
export function hairGeometry(radial = 10, rings = 5): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.1, radial, rings, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(1, 1.18, 1.1).rotateX(-0.42)
}

/** Headwrap: fuller than hair, with a knot at the back. */
export function wrapGeometry(): THREE.BufferGeometry {
  const cap = new THREE.SphereGeometry(0.108, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(1.04, 1.36, 1.16).rotateX(-0.36)
  const knot = new THREE.SphereGeometry(0.045, 6, 4).translate(0, 0.06, -0.115)
  return mergeGeometries([cap.toNonIndexed(), knot.toNonIndexed()])!
}

function lathe(profile: [number, number][], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments)
}

/** Hips to the base of the neck: waist, chest and shoulders. Origin at the middle of the body (y ≈ 1.17 m). */
export function torsoGeometry(female: boolean, segments = 10): THREE.BufferGeometry {
  const chest = female ? 0.138 : 0.15
  const hips = female ? 0.15 : 0.13
  const g = lathe(
    [
      [0.001, -0.3],
      [hips, -0.3],
      [female ? 0.112 : 0.122, -0.14],
      [chest, 0.03],
      [female ? 0.15 : 0.172, 0.15],
      [0.11, 0.235],
      [0.05, 0.27],
      [0.001, 0.275],
    ],
    segments,
  )
  return g.scale(1, 1, 0.66)
}

/** Hip to ankle, hanging down from the origin. */
export function legGeometry(segments = 6): THREE.BufferGeometry {
  return lathe(
    [
      [0.001, 0.02],
      [0.078, -0.03],
      [0.066, -0.3],
      [0.048, -0.42],
      [0.052, -0.56],
      [0.036, -0.78],
      [0.001, -0.8],
    ],
    segments,
  )
}

/** Shoulder to fingertips, hanging down from the origin; the hand is the same mesh as the arm. */
export function armGeometry(segments = 6): THREE.BufferGeometry {
  return lathe(
    [
      [0.001, 0.03],
      [0.05, 0],
      [0.042, -0.26],
      [0.03, -0.5],
      [0.04, -0.57],
      [0.028, -0.66],
      [0.001, -0.68],
    ],
    segments,
  )
}

export function shoeGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.052, 7, 4).scale(1, 0.62, 2.1).translate(0, 0, 0.04)
}

/** Skirt of a dress, hanging from the waist. */
export function skirtGeometry(segments = 12): THREE.BufferGeometry {
  return lathe(
    [
      [0.135, 0],
      [0.19, -0.26],
      [0.25, -0.56],
      [0.29, -0.84],
    ],
    segments,
  )
}

/** Every vertex coloured the same; UVs on the atlas's white texel. Returns a non-indexed copy. */
function paint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone()
  const c = new THREE.Color(color)
  const n = out.attributes.position!.count
  const col = new Float32Array(n * 3)
  const uv = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    col.set([c.r, c.g, c.b], i * 3)
    uv.set(WHITE_UV, i * 2)
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return out
}

export type PersonLook = { female: boolean; tone: number; face: number; top: string; bottom: string; hair: string; wrap: boolean; shoes: string }

/** A whole standing person merged into one geometry (about 500 triangles), for scenery that doesn't move. */
export function standingPerson(look: PersonLook): THREE.BufferGeometry {
  const skin = SKIN_TONES[look.tone % SKIN_TONES.length]!
  const parts: THREE.BufferGeometry[] = []
  const place = (g: THREE.BufferGeometry, color: string, x: number, y: number, z: number, roll = 0) => {
    parts.push(paint(g.clone().rotateZ(roll).translate(x, y, z), color))
  }
  const legC = look.female ? skin : look.bottom
  place(legGeometry(5), legC, 0.085, 0.84, 0)
  place(legGeometry(5), legC, -0.085, 0.84, 0)
  place(shoeGeometry(), look.shoes, 0.085, 0.05, 0.02)
  place(shoeGeometry(), look.shoes, -0.085, 0.05, 0.02)
  place(torsoGeometry(look.female, 8), look.top, 0, 1.17, 0)
  if (look.female) place(skirtGeometry(10), look.bottom, 0, 0.98, 0)
  place(armGeometry(5), skin, look.female ? 0.178 : 0.2, 1.34, 0, 0.09)
  place(armGeometry(5), skin, look.female ? -0.178 : -0.2, 1.34, 0, -0.09)
  place(look.wrap ? wrapGeometry() : hairGeometry(8, 4), look.hair, 0, 1.6, 0)
  const head = headGeometry(10, 7).translate(0, 1.57, 0.005)
  const [u, v] = faceCell(look.tone, look.face)
  const uvA = head.attributes.uv!
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) + u, uvA.getY(i) + v)
  const white = new Float32Array(uvA.count * 3).fill(1)
  head.setAttribute('color', new THREE.BufferAttribute(white, 3))
  parts.push(head)
  for (const p of parts) {
    for (const name of Object.keys(p.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') p.deleteAttribute(name)
    }
  }
  return mergeGeometries(parts)!
}
