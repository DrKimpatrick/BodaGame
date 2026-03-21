import { useEffect, useRef } from 'react'

export type KeyAxis = {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
}

const initial: KeyAxis = {
  forward: false,
  back: false,
  left: false,
  right: false,
}

export function useKeyboard() {
  const keys = useRef<KeyAxis>({ ...initial })

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.forward = true
          break
        case 'KeyS':
        case 'ArrowDown':
          keys.current.back = true
          break
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.left = true
          break
        case 'KeyD':
        case 'ArrowRight':
          keys.current.right = true
          break
        default:
          return
      }
      e.preventDefault()
    }

    const up = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.forward = false
          break
        case 'KeyS':
        case 'ArrowDown':
          keys.current.back = false
          break
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.left = false
          break
        case 'KeyD':
        case 'ArrowRight':
          keys.current.right = false
          break
        default:
          return
      }
      e.preventDefault()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return keys
}
