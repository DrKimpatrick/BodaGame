import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { pauseAllMusic, resumeGameplayMusicIfNeeded, startGameplayMusic } from './audio/gameMusic'
import { unlockWebAudioFromUserGesture } from './audio/webAudioContext'
import { GameHud } from './components/ui/GameHud'
import { GameOverlays } from './components/ui/GameOverlays'
import { ImpactFlash } from './components/ui/ImpactFlash'
import { StageSheet } from './components/ui/StageSheet'
import { PauseMenu, StartScreen } from './components/ui/StartScreen'
import { TouchControls } from './components/ui/TouchControls'
import { useGameRootButtonClickSound } from './hooks/useGameRootButtonClickSound'
import { onDriveAction, releaseAll } from './input/driveInput'
import { playHorn } from './roadRules/fx/sfx'
import { stopSpeaking } from './roadRules/fx/speech'
import { sceneStatus } from './roadRules/world/telemetry'
import { evaluateFinancialGameOver, useGameStore } from './store/useGameStore'
import { useRoadRulesStore, type GameMode } from './store/useRoadRulesStore'
import { useSettingsStore } from './store/useSettingsStore'

type Phase = 'menu' | 'loading' | 'playing'

/** The 3D engine (three, rapier, drei) loads only when a ride starts, so the menu appears fast on phones. */
const GameCanvas = lazy(() => import('./components/GameCanvas'))

function LoadingScreen() {
  const [progress, setProgress] = useState(8)
  useEffect(() => {
    const id = setInterval(() => setProgress((p) => Math.min(95, p + (100 - p) * 0.08)), 150)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#0f1014] px-8" role="status" aria-live="polite">
      <p className="text-sm font-extrabold uppercase tracking-[0.3em] text-[#f26b1d]">Women on Wheels</p>
      <p className="text-2xl font-black">Getting Kampala ready…</p>
      <div className="h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#f5c518] transition-[width] duration-200" style={{ width: `${Math.max(8, progress)}%` }} />
      </div>
      <p className="max-w-sm text-center text-sm text-zinc-400">Tip: in Uganda we keep left. Stop behind the white line at a red light or STOP sign.</p>
    </div>
  )
}

export default function App() {
  useGameRootButtonClickSound()
  const [phase, setPhase] = useState<Phase>('menu')
  const [paused, setPaused] = useState(false)
  const [stageOpen, setStageOpen] = useState(false)
  const start = useRoadRulesStore((s) => s.start)
  const overlay = useRoadRulesStore((s) => s.overlay)
  const sound = useSettingsStore((s) => s.sound)
  const readyRef = useRef(false)
  const pendingMode = useRef<GameMode>('learn')

  // Fetch the 3D engine in the background while the player reads the menu.
  useEffect(() => {
    const id = setTimeout(() => void import('./components/GameCanvas'), 1200)
    return () => clearTimeout(id)
  }, [])

  const begin = (mode: GameMode) => {
    unlockWebAudioFromUserGesture()
    pendingMode.current = mode
    readyRef.current = false
    sceneStatus.cityBuilt = false
    setPhase('loading')
  }

  // Leave the loading screen once the scene has rendered its first frames (city built, textures in).
  useEffect(() => {
    if (phase !== 'loading') return
    const t0 = performance.now()
    const id = setInterval(() => {
      const waited = performance.now() - t0
      if ((readyRef.current && waited > 300) || waited > 45000) {
        clearInterval(id)
        start(pendingMode.current)
        setPhase('playing')
      }
    }, 120)
    return () => clearInterval(id)
  }, [phase, start])

  const toMenu = () => {
    stopSpeaking()
    releaseAll()
    useRoadRulesStore.getState().quit()
    setPaused(false)
    setStageOpen(false)
    pauseAllMusic()
    setPhase('menu')
  }

  // World freezes while the pause menu or fuel sheet is open (cards freeze it from the store).
  useEffect(() => {
    if (phase !== 'playing') return
    const g = useGameStore.getState()
    if (paused || stageOpen) g.setHudModalFreezesWorld(true)
    else if (!useRoadRulesStore.getState().overlay) g.setHudModalFreezesWorld(false)
  }, [paused, stageOpen, phase])

  // Keyboard / on-screen actions.
  useEffect(
    () =>
      onDriveAction((a) => {
        if (phase !== 'playing') return
        if (a === 'pause') setPaused((p) => !p)
        else if (a === 'headlight') useGameStore.getState().toggleHeadlight()
        else if (a === 'camera') useSettingsStore.getState().cycleCamera()
        else if (a === 'horn') playHorn()
      }),
    [phase],
  )

  // Out of money for fuel or repairs: the run is over.
  useEffect(() => {
    if (phase !== 'playing') return
    return useGameStore.subscribe((s) => {
      if (useRoadRulesStore.getState().overlay) return
      if (evaluateFinancialGameOver(s).over) {
        useRoadRulesStore.setState({ overlay: { type: 'gameover', over: { reason: 'broke' } } })
        useGameStore.getState().setHudModalFreezesWorld(true)
      }
    })
  }, [phase])

  // Music follows the sound setting and the tab's visibility.
  useEffect(() => {
    if (phase !== 'playing' || !sound) {
      pauseAllMusic()
      return
    }
    startGameplayMusic()
    const onVis = () => (document.visibilityState === 'hidden' ? pauseAllMusic() : resumeGameplayMusicIfNeeded())
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase, sound])

  // Auto-pause when the app goes to the background on a phone (off in the dev-only showroom, where
  // the preview pane reports "hidden" during screenshots).
  useEffect(() => {
    if (phase !== 'playing') return
    if (import.meta.env.DEV && /showroom|test/.test(location.search)) return
    const onVis = () => {
      if (document.visibilityState === 'hidden' && !useRoadRulesStore.getState().overlay) setPaused(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase])

  const inGame = phase === 'loading' || phase === 'playing'

  return (
    <div className="relative h-full w-full bg-[#0f1014]" data-game-root>
      {inGame ? (
        <div className={`h-full w-full ${phase === 'loading' ? 'opacity-0' : ''}`} aria-hidden={phase === 'loading'}>
          <Suspense fallback={null}>
            <GameCanvas onReady={() => (readyRef.current = true)} />
          </Suspense>
        </div>
      ) : null}
      {phase === 'menu' ? <StartScreen onStart={begin} /> : null}
      {phase === 'loading' ? <LoadingScreen /> : null}
      {phase === 'playing' ? (
        <>
          <ImpactFlash />
          <GameHud onPause={() => setPaused(true)} onOpenStage={() => setStageOpen(true)} />
          {!overlay && !paused && !stageOpen ? <TouchControls /> : null}
          <GameOverlays onMenu={toMenu} />
          {stageOpen && !overlay ? <StageSheet onClose={() => setStageOpen(false)} /> : null}
          {paused && !overlay ? <PauseMenu onResume={() => setPaused(false)} onMenu={toMenu} /> : null}
        </>
      ) : null}
    </div>
  )
}
