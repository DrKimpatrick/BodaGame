import { useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ROAD_W, roadStripCenterX, roadStripCenterZ } from '@game/cityGrid'
import { SIDEWALK_WIDTH } from '@game/roadSpatial'

const BANNER_H = 5.2
const SETBACK = ROAD_W / 2 + SIDEWALK_WIDTH + 2.4

const RASTER_URLS = [
  '/textures/safeboda.png',
  '/textures/safeboda2.png',
  '/textures/Border-To-Boda.jpg',
  '/textures/Border-To-Boda2.jpg',
  '/textures/Border-To-Boda3.jpg',
] as const

const SVG_AD_URL = '/textures/safeboda3.svg'

type Site = {
  x: number
  z: number
  rotY: number
  texIndex: number
}

function buildSites(): Site[] {
  const out: Site[] = []
  const zLanes = [-95, -55, -18, 22, 62, 102]
  const xLanes = [-102, -58, -18, 22, 62, 98]

  const stripXs = [2, 4, 6, 8]
  for (let i = 0; i < stripXs.length; i++) {
    const rx = roadStripCenterX(stripXs[i]!)
    const z = zLanes[i % zLanes.length]!
    out.push({
      x: rx + SETBACK,
      z,
      rotY: -Math.PI / 2,
      texIndex: i % 6,
    })
    out.push({
      x: rx - SETBACK,
      z: zLanes[(i + 3) % zLanes.length]!,
      rotY: Math.PI / 2,
      texIndex: (i + 2) % 6,
    })
  }

  const stripZs = [3, 5, 7]
  for (let i = 0; i < stripZs.length; i++) {
    const rz = roadStripCenterZ(stripZs[i]!)
    const x = xLanes[i % xLanes.length]!
    out.push({
      x,
      z: rz + SETBACK,
      rotY: Math.PI,
      texIndex: (i + 4) % 6,
    })
    out.push({
      x: xLanes[(i + 2) % xLanes.length]!,
      z: rz - SETBACK,
      rotY: 0,
      texIndex: (i + 1) % 6,
    })
  }

  return out
}

const SITES = buildSites()

function useSvgAdTexture(url: string) {
  const [map, setMap] = useState<THREE.CanvasTexture | null>(null)
  const disposed = useRef(false)

  useEffect(() => {
    disposed.current = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (disposed.current) return
      const w = Math.max(64, img.naturalWidth || 512)
      const h = Math.max(64, img.naturalHeight || 512)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')
      if (!g) return
      g.drawImage(img, 0, 0, w, h)
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.needsUpdate = true
      setMap(tex)
    }
    img.onerror = () => {
      if (!disposed.current) setMap(null)
    }
    img.src = url
    return () => {
      disposed.current = true
      setMap((prev) => {
        prev?.dispose()
        return null
      })
    }
  }, [url])

  return map
}

function BannerMesh({
  map,
  x,
  z,
  rotY,
}: {
  map: THREE.Texture
  x: number
  z: number
  rotY: number
}) {
  const { w, h } = useMemo(() => {
    const img = map.image as { width?: number; height?: number } | undefined
    const iw = img?.width ?? 512
    const ih = img?.height ?? 512
    const ar = iw / Math.max(1, ih)
    return { w: BANNER_H * ar, h: BANNER_H }
  }, [map])

  const y = h * 0.5 + 0.08

  return (
    <mesh position={[x, y, z]} rotation={[0, rotY, 0]} renderOrder={2}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={map}
        transparent
        depthWrite
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/**
 * SafeBoda + Border-To-Boda creatives along strips (building-side / roadside planes).
 */
export function UrbanAdBanners() {
  const maps = useTexture([...RASTER_URLS], (loaded) => {
    for (const t of loaded) {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      t.colorSpace = THREE.SRGBColorSpace
      t.needsUpdate = true
    }
  })

  const svgMap = useSvgAdTexture(SVG_AD_URL)

  const textures = useMemo(() => {
    const sixth = svgMap ?? maps[0]!
    return [...maps, sixth] as THREE.Texture[]
  }, [maps, svgMap])

  return (
    <group name="urban-ad-banners">
      {SITES.map((s, i) => {
        const t = textures[s.texIndex % textures.length]!
        return (
          <BannerMesh key={`ad-${i}-${s.x.toFixed(1)}-${s.z.toFixed(1)}`} map={t} x={s.x} z={s.z} rotY={s.rotY} />
        )
      })}
    </group>
  )
}
