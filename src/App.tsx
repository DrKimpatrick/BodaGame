import { Environment, useProgress } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GameScene } from './components/GameScene'
import { Hud } from './components/Hud'
import {
  onGameStartButtonClicked,
  pauseAllMusic,
  playIntroFromUserGesture,
  resumeGameplayMusicIfNeeded,
  resumeIntroMusicIfNeeded,
  startGameplayMusic,
  trySplashIntroAutoplay,
} from './audio/gameMusic'
import {
  isBikeBrokenDown,
  isProgressPristine,
  useGameStore,
} from './store/useGameStore'

const SPLASH_ART = encodeURI('/textures/BorderTo-Boda23.jpg')

type BootPhase = 'splash' | 'loading' | 'playing'

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

function GameCanvas({ onWebglReady }: { onWebglReady?: () => void }) {
  const condition = useGameStore((s) => s.condition)
  const freezeWorld = isBikeBrokenDown(condition)

  return (
    <Canvas
      shadows
      className="h-full w-full"
      camera={{ fov: 52, near: 0.1, far: 420 }}
      dpr={[1, 1.75]}
      frameloop={freezeWorld ? 'demand' : 'always'}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.shadowMap.type = THREE.PCFShadowMap
        onWebglReady?.()
      }}
    >
      <ThawInvalidate frozen={freezeWorld} />
      <Environment preset="city" environmentIntensity={0.55} />
      <GameScene />
    </Canvas>
  )
}

function App() {
  const resetSession = useGameStore((s) => s.resetSession)
  const [showPostWipeNotice, setShowPostWipeNotice] = useState(false)
  const [phase, setPhase] = useState<BootPhase>('splash')
  const [splashImageReady, setSplashImageReady] = useState(false)
  const [webglReady, setWebglReady] = useState(false)

  const { active, progress } = useProgress()
  const hadThreeLoading = useRef(false)
  const loadingStartedAt = useRef(0)
  const finishStableTicks = useRef(0)
  const introStartedRef = useRef(false)

  useLayoutEffect(() => {
    resetSession()
  }, [resetSession])

  useEffect(() => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => setSplashImageReady(true)
    img.onerror = () => setSplashImageReady(true)
    img.src = SPLASH_ART
  }, [])

  useEffect(() => {
    if (active) hadThreeLoading.current = true
  }, [active])

  useEffect(() => {
    if (phase !== 'splash' && phase !== 'playing' && phase !== 'loading') return
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        pauseAllMusic()
      } else if (phase === 'playing') {
        resumeGameplayMusicIfNeeded()
      } else {
        resumeIntroMusicIfNeeded()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase])

  /** Intro MP3: before paint + when splash image reports ready (retry if first autoplay was too early). */
  useLayoutEffect(() => {
    if (phase !== 'splash') return
    trySplashIntroAutoplay(introStartedRef)
  }, [phase, splashImageReady])

  useEffect(() => {
    if (phase !== 'playing') return
    startGameplayMusic()
  }, [phase])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.__BODA_HAD_ACTIVE_SESSION__) {
      setShowPostWipeNotice(true)
      delete window.__BODA_HAD_ACTIVE_SESSION__
    }
  }, [])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProgressPristine(useGameStore.getState())) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    if (phase !== 'loading') {
      finishStableTicks.current = 0
      return
    }

    const interval = window.setInterval(() => {
      if (!webglReady) return

      const elapsed = Date.now() - loadingStartedAt.current
      const minBarMs = 700

      const threeSettled = !active
      const progressDone = progress >= 99.5
      const noTrackedLoads = !hadThreeLoading.current && elapsed >= 1600

      const canFinish =
        elapsed >= minBarMs &&
        threeSettled &&
        (progressDone || noTrackedLoads)

      if (canFinish) {
        finishStableTicks.current += 1
        if (finishStableTicks.current >= 3) {
          setPhase('playing')
        }
      } else {
        finishStableTicks.current = 0
      }

      if (elapsed > 28_000) {
        setPhase('playing')
      }
    }, 90)

    return () => clearInterval(interval)
  }, [phase, active, progress, webglReady])

  const beginLoading = () => {
    onGameStartButtonClicked()
    hadThreeLoading.current = false
    finishStableTicks.current = 0
    loadingStartedAt.current = Date.now()
    setWebglReady(false)
    setPhase('loading')
  }

  const barPercent =
    phase === 'loading' ? Math.min(100, Math.max(0, progress)) : 0

  return (
    <div className="relative h-full w-full bg-[#0f1014]" data-game-root>
      {showPostWipeNotice && phase === 'playing' ? (
        <div
          className="pointer-events-auto fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
          role="status"
        >
          <div className="flex max-w-lg items-start gap-3 rounded-b-xl border border-t-0 border-amber-500/40 bg-zinc-950/95 px-4 py-3 text-left shadow-lg ring-1 ring-amber-400/20 backdrop-blur-md">
            <p className="min-w-0 flex-1 text-sm text-amber-50/95">
              Reload cleared your previous run (wallet, fuel, condition, and history) for a clean
              session.
            </p>
            <button
              type="button"
              onClick={() => setShowPostWipeNotice(false)}
              className="shrink-0 rounded-lg border border-amber-500/50 bg-amber-600/25 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-600/40"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'splash' ? (
        <div
          className="fixed inset-0 z-60 flex flex-col bg-black"
          onPointerDownCapture={() => {
            playIntroFromUserGesture(introStartedRef)
          }}
        >
          <div className="relative min-h-0 flex-1">
            <img
              src={SPLASH_ART}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
              draggable={false}
            />
            <div
              className="absolute inset-0 bg-linear-to-t from-black/88 via-black/25 to-black/55"
              aria-hidden
            />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-4 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
            {!splashImageReady ? (
              <p className="text-sm font-semibold tracking-wide text-zinc-400">Loading…</p>
            ) : null}
            <button
              type="button"
              disabled={!splashImageReady}
              onClick={beginLoading}
              className="w-full max-w-sm rounded-xl border-2 border-amber-400/70 bg-amber-500/95 py-3.5 text-center text-base font-black uppercase tracking-[0.2em] text-amber-950 shadow-[0_6px_0_rgba(120,53,15,0.85)] transition enabled:hover:bg-amber-400 enabled:active:translate-y-0.5 enabled:active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'loading' ? (
        <div
          className="fixed inset-0 z-55 flex flex-col items-center justify-end gap-3 bg-black/80 px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-zinc-400">
            Loading world
          </p>
          <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full border border-zinc-600/80 bg-zinc-900 shadow-inner">
            <div
              className="h-full rounded-full bg-linear-to-r from-amber-600 via-amber-400 to-amber-500 transition-[width] duration-150 ease-out"
              style={{ width: `${barPercent}%` }}
            />
          </div>
          <p className="font-mono text-sm tabular-nums text-amber-200/90">
            {Math.round(barPercent)}%
          </p>
        </div>
      ) : null}

      {(phase === 'loading' || phase === 'playing') && (
        <div
          className={`h-full w-full ${phase === 'loading' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          aria-hidden={phase === 'loading'}
        >
          <GameCanvas onWebglReady={() => setWebglReady(true)} />
        </div>
      )}

      {phase === 'playing' ? <Hud /> : null}
    </div>
  )
}

export default App
