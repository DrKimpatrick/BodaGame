import { Environment, Lightformer, useProgress } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { isBikeBrokenDown, isTankEmpty, useGameStore } from '../store/useGameStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { GameScene } from './GameScene'
import { sceneStatus } from '../roadRules/world/telemetry'

/** Resolution caps: phones often report DPR 3; rendering at that size costs 9× the pixels. */
const DPR = { low: [0.75, 1], medium: [1, 1.25], high: [1, 1.75] } as const

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

export default function GameCanvas({ onReady }: { onReady: () => void }) {
  const condition = useGameStore((s) => s.condition)
  const fuel = useGameStore((s) => s.fuel)
  const modalFreeze = useGameStore((s) => s.hudModalFreezesWorld)
  const quality = useSettingsStore((s) => s.quality)
  const frozen = isBikeBrokenDown(condition) || modalFreeze || isTankEmpty(fuel)
  // Bumped after a lost WebGL context (GPU memory pressure on phones): remounts a fresh canvas.
  const [contextNonce, setContextNonce] = useState(0)

  return (
    <Canvas
      key={`${quality}-${contextNonce}`}
      shadows={quality !== 'low'}
      className="h-full w-full"
      camera={{ fov: 62, near: 0.15, far: 1600, position: [0, 3, 6] }}
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
