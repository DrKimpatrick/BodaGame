import { Environment, Lightformer, useProgress } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { isBikeBrokenDown, isTankEmpty, useGameStore } from '../store/useGameStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { GameScene } from './GameScene'
import { sceneStatus } from '../roadRules/world/telemetry'

/** Resolution caps: phones often report DPR 3; rendering at that size costs 9× the pixels. */
const DPR = { low: [0.75, 1], medium: [0.85, 1.25], high: [1, 1.5] } as const

/** After `frameloop="demand"`, nudge one frame when unfreezing so the loop reliably restarts. */
function ThawInvalidate({ frozen }: { frozen: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const prevFrozen = useRef(frozen)
  useLayoutEffect(() => {
    if (prevFrozen.current && !frozen) invalidate()
    prevFrozen.current = frozen
  }, [frozen, invalidate])
  return null
}

/**
 * Holds the frame rate on any screen: slower than ~42 fps lowers the render resolution a step, and steady spare
 * time raises it again. Fill rate is the first limit on big laptop screens and phones.
 */
function AdaptiveResolution({ min, max }: { min: number; max: number }) {
  const setDpr = useThree((s) => s.setDpr)
  const dpr = useRef(max)
  const window_ = useRef({ t: 0, n: 0, calm: 0 })
  useFrame((_, delta) => {
    const w = window_.current
    // Skip stalls (tab switch, loading): they say nothing about the sustained rate.
    if (delta > 0.25) return
    w.t += delta
    w.n++
    if (w.t < 1) return
    const ms = (w.t / w.n) * 1000
    w.t = 0
    w.n = 0
    if (ms > 24 && dpr.current > min) {
      dpr.current = Math.max(min, dpr.current - 0.15)
      w.calm = 0
      setDpr(dpr.current)
    } else if (ms < 17.5 && dpr.current < max && ++w.calm >= 6) {
      dpr.current = Math.min(max, dpr.current + 0.1)
      w.calm = 0
      setDpr(dpr.current)
    }
  })
  return null
}

export default function GameCanvas({ onReady }: { onReady: () => void }) {
  // A boolean, not the raw values: fuel changes every frame while riding.
  const frozen = useGameStore((s) => isBikeBrokenDown(s.condition) || s.hudModalFreezesWorld || isTankEmpty(s.fuel))
  const quality = useSettingsStore((s) => s.quality)
  // Bumped after a lost WebGL context (GPU memory pressure on phones): remounts a fresh canvas.
  const [contextNonce, setContextNonce] = useState(0)

  return (
    <Canvas
      key={`${quality}-${contextNonce}`}
      shadows={quality !== 'low'}
      className="h-full w-full"
      // Near plane not too close: depth precision falls with it, and far-off road layers then flicker through each other.
      camera={{ fov: 62, near: 0.4, far: 1600, position: [0, 3, 6] }}
      dpr={[...DPR[quality]]}
      frameloop={frozen ? 'demand' : 'always'}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl, scene, camera, raycaster }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        if (import.meta.env.DEV) Object.assign(window, { __wowGl: gl, __wowScene: scene, __wowCam: camera, __wowRay: raycaster })
        const el = gl.domElement
        let timer: ReturnType<typeof setTimeout> | undefined
        el.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          // Give the browser a moment to restore it; otherwise start over with a new canvas.
          timer = setTimeout(() => setContextNonce((n) => n + 1), 1500)
        })
        el.addEventListener('webglcontextrestored', () => {
          clearTimeout(timer)
          setContextNonce((n) => n + 1)
        })
      }}
    >
      <ThawInvalidate frozen={frozen} />
      <AdaptiveResolution min={DPR[quality][0]} max={Math.min(DPR[quality][1], window.devicePixelRatio || 1)} />
      <ReadyWhenLoaded onReady={onReady} />
      {/* Local light-former environment: no HDR download (works offline), cheap on phones. */}
      <Environment resolution={quality === 'low' ? 32 : 128} frames={1} environmentIntensity={0.55}>
        <Lightformer intensity={1.6} color="#dfeaf5" position={[0, 6, -9]} scale={[20, 6, 1]} />
        <Lightformer intensity={0.8} color="#ffe2b8" position={[10, 3, 4]} rotation={[0, -Math.PI / 2, 0]} scale={[10, 4, 1]} />
        <Lightformer intensity={0.5} color="#a7c3d9" position={[-10, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[10, 4, 1]} />
        <Lightformer form="ring" intensity={1.2} color="#ffffff" position={[0, 12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={6} />
      </Environment>
      <GameScene />
    </Canvas>
  )
}


/** Calls `onReady` once the city is built and batched and a couple of frames have rendered. */
function ReadyWhenLoaded({ onReady }: { onReady: () => void }) {
  const { active } = useProgress()
  const frames = useRef(0)
  const done = useRef(false)
  useFrame(() => {
    if (done.current || active || !sceneStatus.cityBuilt) return
    if (++frames.current < 3) return
    done.current = true
    onReady()
  })
  return null
}
