import { Environment } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useState } from 'react'
import * as THREE from 'three'
import { GameScene } from './components/GameScene'
import { Hud } from './components/Hud'
import { isProgressPristine, useGameStore } from './store/useGameStore'

function App() {
  const resetSession = useGameStore((s) => s.resetSession)
  const [showPostWipeNotice, setShowPostWipeNotice] = useState(false)

  useLayoutEffect(() => {
    resetSession()
  }, [resetSession])

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

  return (
    <div className="relative h-full w-full bg-[#0f1014]">
      {showPostWipeNotice ? (
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
      <Canvas
        shadows
        className="h-full w-full"
        camera={{ fov: 52, near: 0.1, far: 420 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFShadowMap
        }}
      >
        <Environment preset="city" environmentIntensity={0.55} />
        <GameScene />
      </Canvas>
      <Hud />
    </div>
  )
}

export default App