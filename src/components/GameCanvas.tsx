import { Environment, Lightformer, useProgress } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { memo, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { isBikeBrokenDown, isTankEmpty, useGameStore } from '../store/useGameStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { GameScene } from './GameScene'
import { bikeTelemetry, sceneStatus } from '../roadRules/world/telemetry'

/** Resolution caps: phones often report DPR 3; rendering at that size costs 9× the pixels. */
const DPR = { low: [0.75, 1], medium: [0.85, 1.25], high: [1, 1.5] } as const

/**
 * Stops the frame loop while the world is frozen. It lives in a child so that freezing doesn't re-render <Canvas>,
 * which would re-apply its props and undo what AdaptiveResolution has chosen.
 */
function FreezeFrames() {
  const frozen = useGameStore((s) => isBikeBrokenDown(s.condition) || s.hudModalFreezesWorld || isTankEmpty(s.fuel))
  const setFrameloop = useThree((s) => s.setFrameloop)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    setFrameloop(frozen ? 'demand' : 'always')
    invalidate()
  }, [frozen, setFrameloop, invalidate])
  return null
}

/**
 * Holds the frame rate on any screen: slower than ~42 fps lowers the render resolution a step, and steady spare
 * time raises it again. Fill rate is the first limit on big laptop screens and phones.
 */
function AdaptiveResolution({ min, max }: { min: number; max: number }) {
  const setDpr = useThree((s) => s.setDpr)
  const state = useRef({ dpr: max, time: 0, frames: 0, calmSeconds: 0, calmNeeded: 6 })
  useFrame((_, delta) => {
    const a = state.current
    // Skip stalls (tab switch, loading): they say nothing about the sustained rate.
    if (delta > 0.25) return
    a.time += delta
    a.frames++
    if (a.time < 1) return
    const ms = (a.time / a.frames) * 1000
    a.time = 0
    a.frames = 0
    if (ms > 24 && a.dpr > min) {
      a.dpr = Math.max(min, a.dpr - 0.15)
      a.calmSeconds = 0
      // A device that keeps dipping waits longer each time before trying again: changing resolution is itself a hitch.
      a.calmNeeded = Math.min(120, a.calmNeeded * 2)
      setDpr(a.dpr)
    } else if (ms < 17.5 && a.dpr < max && ++a.calmSeconds >= a.calmNeeded) {
      a.dpr = Math.min(max, a.dpr + 0.1)
      a.calmSeconds = 0
      setDpr(a.dpr)
    }
  })
  return null
}

const GameCanvas = memo(function GameCanvas({ onReady }: { onReady: () => void }) {
  const quality = useSettingsStore((s) => s.quality)
  // Bumped after a lost WebGL context (GPU memory pressure on phones): remounts a fresh canvas.
  const [contextNonce, setContextNonce] = useState(0)
  // A new ride. Only a rebuilt canvas within the same ride carries the bike over (see Boda).
  useState(() => {
    bikeTelemetry.placed = false
  })

  return (
    <Canvas
      key={`${quality}-${contextNonce}`}
      shadows={quality !== 'low'}
      className="h-full w-full"
      // Near plane not too close: depth precision falls with it, and far-off road layers then flicker through each other.
      camera={{ fov: 62, near: 0.4, far: 1600, position: [0, 3, 6] }}
      dpr={[...DPR[quality]]}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl, scene, camera, raycaster }) => {
        gl.shadowMap.type = THREE.PCFShadowMap
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
      <FreezeFrames />
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
})

export default GameCanvas


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
