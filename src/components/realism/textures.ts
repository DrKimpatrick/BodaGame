import * as THREE from 'three'

/**
 * Procedural, tileable textures generated once on a canvas: no downloads, consistent on every device.
 * Each function caches its texture; callers share it (so StaticBatch can merge meshes that use it).
 */

const cache = new Map<string, THREE.CanvasTexture>()

/** Deterministic hash → [0,1). */
function hash(x: number, y: number, seed: number) {
  const t = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return t - Math.floor(t)
}

/** Tileable value noise on a `period`×`period` lattice. */
function noise(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const w = (i: number) => ((i % period) + period) % period
  const a = hash(w(xi), w(yi), seed)
  const b = hash(w(xi + 1), w(yi), seed)
  const c = hash(w(xi), w(yi + 1), seed)
  const d = hash(w(xi + 1), w(yi + 1), seed)
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Fractal noise, tileable over the canvas. */
function fbm(px: number, py: number, size: number, base: number, octaves: number, seed: number) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    const period = base * 2 ** o
    sum += noise((px / size) * period, (py / size) * period, period, seed + o * 13) * amp
    norm += amp
    amp *= 0.5
  }
  return sum / norm
}

function makeTexture(
  key: string,
  size: number,
  paint: (img: ImageData, size: number) => void,
  repeat: [number, number] = [1, 1],
): THREE.CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const img = g.createImageData(size, size)
  paint(img, size)
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat[0], repeat[1])
  tex.anisotropy = 8
  cache.set(key, tex)
  return tex
}

function put(img: ImageData, i: number, r: number, g: number, b: number) {
  img.data[i] = Math.max(0, Math.min(255, r))
  img.data[i + 1] = Math.max(0, Math.min(255, g))
  img.data[i + 2] = Math.max(0, Math.min(255, b))
  img.data[i + 3] = 255
}

/** Patchy roadside grass with worn red-soil patches (Kampala verges, not a golf lawn). */
export function grassTexture(): THREE.CanvasTexture {
  return makeTexture('grass', 512, (img, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const clump = fbm(x, y, s, 5, 4, 1)
        // Fine directional streaks, like blades seen from above, rather than speckle.
        const blades = fbm(x, y * 0.28, s, 48, 3, 3)
        const cross = fbm(x * 0.28, y, s, 48, 2, 5)
        const fine = hash(x, y, 9)
        const soil = Math.max(0, fbm(x, y, s, 7, 4, 7) - 0.66) * 5
        const dry = Math.max(0, fbm(x, y, s, 9, 3, 11) - 0.5) * 1.6
        const light = 0.72 + clump * 0.32 + (blades + cross) * 0.22 + (fine - 0.5) * 0.09
        let r = (58 + dry * 62) * light
        let g = (92 + dry * 26) * light
        let b = (40 + dry * 6) * light
        const k = Math.min(1, soil)
        r = r * (1 - k) + (112 + clump * 26) * k
        g = g * (1 - k) + (84 + clump * 18) * k
        b = b * (1 - k) + (56 + clump * 12) * k
        put(img, (y * s + x) * 4, r, g, b)
      }
    }
  })
}

/** Worn asphalt: dark binder, light aggregate speckle, tar patches and tyre polish. */
export function asphaltTexture(): THREE.CanvasTexture {
  return makeTexture('asphalt', 512, (img, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = fbm(x, y, s, 6, 5, 21)
        const speck = hash(x, y, 22)
        const patch = fbm(x, y, s, 2, 3, 23)
        // Weathered grey tarmac: aged binder with lighter stone showing through, not fresh black.
        let v = 74 + n * 30
        if (speck > 0.9) v += 34 * (speck - 0.9) * 10
        if (speck < 0.05) v -= 16
        if (patch > 0.68) v -= 15 // fresher tar patches
        put(img, (y * s + x) * 4, v, v, v + 3)
      }
    }
  })
}

/** Red laterite murram for shoulders and unpaved ground. */
export function murramTexture(): THREE.CanvasTexture {
  return makeTexture('murram', 256, (img, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = fbm(x, y, s, 5, 5, 31)
        const peb = hash(x, y, 32)
        let r = 150 + n * 50
        let g = 82 + n * 30
        let b = 52 + n * 18
        if (peb > 0.94) {
          r += 30
          g += 28
          b += 26
        }
        put(img, (y * s + x) * 4, r, g, b)
      }
    }
  })
}

/** Painted plaster: near-white so the wall colour tints it; rain streaks and a dirty skirting band. */
export function plasterTexture(): THREE.CanvasTexture {
  return makeTexture('plaster', 256, (img, s) => {
    for (let y = 0; y < s; y++) {
      const fromBottom = 1 - y / s
      for (let x = 0; x < s; x++) {
        const n = fbm(x, y, s, 8, 4, 41)
        const streak = fbm(x, y * 0.08, s, 16, 2, 42)
        let v = 232 + n * 22 - Math.max(0, streak - 0.6) * 60
        // Splash-back grime along the bottom tenth.
        if (fromBottom < 0.1) v -= (0.1 - fromBottom) * 380 * (0.6 + n * 0.6)
        put(img, (y * s + x) * 4, v, v * 0.98, v * 0.95)
      }
    }
  })
}

/** Corrugated iron sheet with rust blooms (tinted by material colour). */
export function corrugatedTexture(): THREE.CanvasTexture {
  return makeTexture('corrugated', 256, (img, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const ridge = 0.5 + 0.5 * Math.cos((x / s) * Math.PI * 2 * 16)
        const rust = Math.max(0, fbm(x, y, s, 4, 4, 51) - 0.55) * 2.6
        const v = 150 + ridge * 80
        put(img, (y * s + x) * 4, v * (1 - rust) + 150 * rust, v * (1 - rust) + 80 * rust, v * (1 - rust) + 40 * rust)
      }
    }
  })
}

/** Yellow / black chevrons for speed humps. */
export function humpTexture(): THREE.CanvasTexture {
  return makeTexture('hump', 128, (img, s) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const band = Math.floor(((x + y) / s) * 4) % 2 === 0
        const n = hash(x, y, 61) * 18
        if (band) put(img, (y * s + x) * 4, 225 - n, 180 - n, 20)
        else put(img, (y * s + x) * 4, 30 + n, 30 + n, 30 + n)
      }
    }
  })
}

const SHOP_NAMES = [
  'MAMA FINA GENERAL SHOP',
  'MOBILE MONEY · AIRTIME',
  'ROLEX & CHAPATI',
  'NAKATO SALON',
  'KAWEMPE HARDWARE',
  'GOOD HOPE PHARMACY',
  'BODA SPARES',
  'FRESH MATOOKE',
  'TAILORING · GOMESI',
  'PHONE REPAIR',
  'KAMPALA BOOKSHOP',
  'BEST BUTCHERY',
  'MILK DAIRY',
  'SUNRISE HOTEL & CAFE',
]
const SIGN_COLOURS = [
  ['#facc15', '#111827'],
  ['#dc2626', '#ffffff'],
  ['#1d4ed8', '#ffffff'],
  ['#15803d', '#ffffff'],
  ['#f97316', '#111827'],
  ['#ffffff', '#b91c1c'],
  ['#7c3aed', '#ffffff'],
]

export const SHOP_SIGN_COUNT = SHOP_NAMES.length

/* ---------- Atlases: many labels, one texture, one material ---------- */

export type Atlas = { texture: THREE.CanvasTexture; geometry: (index: number, w: number, h: number) => THREE.PlaneGeometry; count: number }

/**
 * Draws `labels` as rows of one texture. `geometry(i, w, h)` returns a cached plane whose UVs show row i,
 * so every sign can share one material and be batched into a single draw call.
 */
export function makeAtlas(
  key: string,
  labels: readonly string[],
  draw: (g: CanvasRenderingContext2D, label: string, index: number, w: number, h: number) => void,
  rowW = 512,
  rowH = 96,
): Atlas {
  const rows = labels.length
  const canvas = document.createElement('canvas')
  canvas.width = rowW
  canvas.height = rowH * rows
  const g = canvas.getContext('2d')!
  labels.forEach((label, i) => {
    g.save()
    g.translate(0, i * rowH)
    g.beginPath()
    g.rect(0, 0, rowW, rowH)
    g.clip()
    draw(g, label, i, rowW, rowH)
    g.restore()
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const geoCache = new Map<string, THREE.PlaneGeometry>()
  const geometry = (index: number, w: number, h: number) => {
    const i = ((index % rows) + rows) % rows
    const k = `${key}:${i}:${w.toFixed(2)}:${h.toFixed(2)}`
    let geo = geoCache.get(k)
    if (!geo) {
      geo = new THREE.PlaneGeometry(w, h)
      const uv = geo.attributes.uv!
      const v0 = 1 - (i + 1) / rows
      const v1 = 1 - i / rows
      for (let n = 0; n < uv.count; n++) uv.setY(n, uv.getY(n) > 0.5 ? v1 : v0)
      geoCache.set(k, geo)
    }
    return geo
  }
  return { texture, geometry, count: rows }
}

let shopAtlas: Atlas | null = null

/** All shop signboards in one atlas (generic names, no real brands). */
export function shopSignAtlas(): Atlas {
  if (shopAtlas) return shopAtlas
  shopAtlas = makeAtlas('shops', SHOP_NAMES, (g, name, i, w, h) => {
    const [bg, fg] = SIGN_COLOURS[i % SIGN_COLOURS.length]!
    g.fillStyle = bg!
    g.fillRect(0, 0, w, h)
    g.strokeStyle = fg!
    g.lineWidth = 5
    g.strokeRect(6, 6, w - 12, h - 12)
    g.fillStyle = fg!
    let fontSize = 44
    g.font = `bold ${fontSize}px "Arial Narrow", Arial, sans-serif`
    while (g.measureText(name).width > w - 40 && fontSize > 20) {
      fontSize -= 2
      g.font = `bold ${fontSize}px "Arial Narrow", Arial, sans-serif`
    }
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(name, w / 2, h / 2 + 2)
    const fade = g.createLinearGradient(0, 0, 0, h)
    fade.addColorStop(0, 'rgba(255,255,255,0.08)')
    fade.addColorStop(1, 'rgba(0,0,0,0.18)')
    g.fillStyle = fade
    g.fillRect(0, 0, w, h)
  })
  return shopAtlas
}

const streetAtlases = new Map<string, Atlas>()

/** Green-and-white street-name blades for the given names, one atlas. */
export function streetNameAtlas(names: readonly string[]): Atlas {
  const key = names.join('|')
  let a = streetAtlases.get(key)
  if (!a) {
    a = makeAtlas(
      `streets:${key}`,
      names,
      (g, name, _i, w, h) => {
        g.fillStyle = '#14532d'
        g.fillRect(0, 0, w, h)
        g.strokeStyle = '#f8fafc'
        g.lineWidth = 4
        g.strokeRect(5, 5, w - 10, h - 10)
        g.fillStyle = '#f8fafc'
        g.font = 'bold 50px "Arial Narrow", Arial, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(name.toUpperCase(), w / 2, h / 2 + 2)
      },
      512,
      96,
    )
    streetAtlases.set(key, a)
  }
  return a
}
