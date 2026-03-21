import { Environment } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { GameScene } from './components/GameScene'
import { Hud } from './components/Hud'

function App() {
  return (
    <div className="relative h-full w-full bg-[#0f1014]">
      <Canvas
        shadows
        className="h-full w-full"
        camera={{ fov: 52, near: 0.1, far: 420 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Environment preset="city" environmentIntensity={0.55} />
        <GameScene />
      </Canvas>
      <Hud />
    </div>
  )
}

export default App