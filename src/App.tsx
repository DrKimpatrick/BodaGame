import { Environment, useProgress } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GameScene } from './components/GameScene'
import { Hud } from './components/Hud'
import { LandingOverlay } from './components/LandingOverlay'
import { useGameRootButtonClickSound } from './hooks/useGameRootButtonClickSound'
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
  evaluateFinancialGameOver,
  isBikeBrokenDown,
  isProgressPristine,
  isTankEmpty,
  useGameStore,
  type FinancialGameOverResult,
} from './store/useGameStore'

const SPLASH_ART = encodeURI('/textures/BorderTo-Boda23.jpg')
const LOADING_VIDEO = '/textures/bodavideo.mp4'

type BootPhase = 'splash' | 'loading' | 'playing'

/** Muted looping backdrop on the loading overlay (game music stays separate). */
function LoadingBackdropVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.defaultMuted = true
    v.muted = true
    const p = v.play()
    if (p) void p.catch(() => {})
  }, [])
  return (
    <video
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      src={LOADING_VIDEO}
      autoPlay
      muted
      playsInline
      loop
      preload="auto"
      aria-hidden
    />
  )
}

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
  const fuel = useGameStore((s) => s.fuel)
  const hudModalFreezesWorld = useGameStore((s) => s.hudModalFreezesWorld)
  const tankEmpty = isTankEmpty(fuel)
  const freezeWorld =
    isBikeBrokenDown(condition) || hudModalFreezesWorld || tankEmpty

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

type GameOverPayload = Extract<FinancialGameOverResult, { over: true }>

/** Printed-receipt style final score; counts up with a mechanical ease (static layout, live numbers). */
function GameOverRunScoreReceipt({ finalScore }: { finalScore: number }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    setShown(0)
    const start = performance.now()
    const capped = Math.max(0, Math.floor(finalScore))
    const duration = Math.min(2800, Math.max(1100, 520 + capped * 2.4))
    const easeOut = (t: number) => 1 - (1 - t) ** 2.85
    let raf = 0
    const step = () => {
      const u = Math.min(1, (performance.now() - start) / duration)
      setShown(Math.round(capped * easeOut(u)))
      if (u < 1) raf = requestAnimationFrame(step)
      else setShown(capped)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [finalScore])

  return (
    <div
      className="relative mx-auto w-full max-w-sm overflow-hidden rounded-lg border border-dashed border-zinc-500/55 bg-zinc-950/92 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-amber-900/25"
      aria-live="polite"
    >
      <div
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(113,113,122,0.38) 4px, rgba(113,113,122,0.38) 8px)',
        }}
        aria-hidden
      />
      <p className="text-center font-mono text-[9px] font-bold uppercase tracking-[0.42em] text-zinc-500">
        Session receipt
      </p>
      <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Safe riding score
      </p>
      <p className="mt-3 text-center font-mono text-4xl font-black tabular-nums tracking-tight text-amber-200 drop-shadow-[0_0_28px_rgba(251,191,36,0.22)]">
        {shown.toLocaleString()}
        <span className="ml-1 align-top text-lg font-bold text-amber-500/80">pts</span>
      </p>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-zinc-500">
        Earned fast on clean distance. Knocks and scrapes only nick a few points off the top.
      </p>
      <div
        className="pointer-events-none absolute inset-x-3 bottom-0 h-px"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(113,113,122,0.38) 4px, rgba(113,113,122,0.38) 8px)',
        }}
        aria-hidden
      />
    </div>
  )
}

function App() {
  useGameRootButtonClickSound()
  const resetSession = useGameStore((s) => s.resetSession)
  const [showPostWipeNotice, setShowPostWipeNotice] = useState(false)
  const [financialGameOver, setFinancialGameOver] = useState<GameOverPayload | null>(null)
  const [gameOverRunScore, setGameOverRunScore] = useState<number | null>(null)
  const financialGameOverLatched = useRef(false)
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
    if (phase !== 'playing') {
      financialGameOverLatched.current = false
      setFinancialGameOver(null)
      setGameOverRunScore(null)
      return
    }
    const sync = () => {
      if (financialGameOverLatched.current) return
      const r = evaluateFinancialGameOver(useGameStore.getState())
      if (r.over) {
        financialGameOverLatched.current = true
        setFinancialGameOver(r)
        setGameOverRunScore(useGameStore.getState().rideScore)
        pauseAllMusic()
      }
    }
    sync()
    return useGameStore.subscribe(sync)
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

  const restartRunAfterGameOver = () => {
    resetSession()
    financialGameOverLatched.current = false
    setFinancialGameOver(null)
    setGameOverRunScore(null)
    startGameplayMusic()
  }

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
          <LandingOverlay
            artSrc={SPLASH_ART}
            splashImageReady={splashImageReady}
            onStart={beginLoading}
          />
        </div>
      ) : null}

      {phase === 'loading' ? (
        <div
          className="fixed inset-0 z-55 flex flex-col overflow-hidden"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <LoadingBackdropVideo />
          <div
            className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/92 via-black/72 to-black/55 backdrop-blur-[2px]"
            aria-hidden
          />
          <div className="relative z-10 flex h-full w-full flex-col items-center justify-end gap-3 px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-zinc-300 drop-shadow-md">
              Loading world
            </p>
            <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full border border-zinc-500/70 bg-zinc-950/80 shadow-inner ring-1 ring-black/40">
              <div
                className="h-full rounded-full bg-linear-to-r from-amber-600 via-amber-400 to-amber-500 transition-[width] duration-150 ease-out"
                style={{ width: `${barPercent}%` }}
              />
            </div>
            <p className="font-mono text-sm tabular-nums text-amber-200/95 drop-shadow-md">
              {Math.round(barPercent)}%
            </p>
          </div>
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

      {phase === 'playing' && financialGameOver ? (
        <div
          className="pointer-events-auto fixed inset-0 z-420 flex flex-col items-center justify-center gap-6 bg-black/88 px-6 py-10 text-center backdrop-blur-md"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="game-over-title"
        >
          <h2
            id="game-over-title"
            className="text-xl font-bold uppercase tracking-[0.2em] text-amber-200"
          >
            Game over
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-zinc-200">
            {financialGameOver.reason === 'breakdown_no_cash' ? (
              <>
                Repairs to get your bike moving again cost at least{' '}
                <span className="font-mono text-white">
                  {financialGameOver.needUgx.toLocaleString()} UGX
                </span>
                , but your wallet only has{' '}
                <span className="font-mono text-white">
                  {(financialGameOver.needUgx - financialGameOver.shortfallUgx).toLocaleString()} UGX
                </span>{' '}
                (short by{' '}
                <span className="font-mono text-amber-300">
                  {financialGameOver.shortfallUgx.toLocaleString()} UGX
                </span>
                ).
              </>
            ) : (
              <>
                Your tank is empty. You need at least{' '}
                <span className="font-mono text-white">
                  {financialGameOver.needUgx.toLocaleString()} UGX
                </span>{' '}
                to buy fuel, but you only have{' '}
                <span className="font-mono text-white">
                  {(financialGameOver.needUgx - financialGameOver.shortfallUgx).toLocaleString()} UGX
                </span>
                .
              </>
            )}
          </p>
          {gameOverRunScore != null ? (
            <GameOverRunScoreReceipt finalScore={gameOverRunScore} />
          ) : null}
          <button
            type="button"
            onClick={restartRunAfterGameOver}
            className="rounded-xl border border-amber-500/60 bg-amber-600/30 px-8 py-3 text-sm font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-600/45"
          >
            Restart game
          </button>
        </div>
      ) : null}

      {phase === 'playing' ? <Hud /> : null}
    </div>
  )
}

export default App
