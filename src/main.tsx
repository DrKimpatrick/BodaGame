import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { runInitialClientCleanup } from './clearClientOnRestart'
import './index.css'
import { useGameStore } from './store/useGameStore'
import App from './App.tsx'

runInitialClientCleanup()

/** Before any R3F/physics frame — `useLayoutEffect` in App still runs after first layout. */
useGameStore.getState().resetSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
