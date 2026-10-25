/**
 * Drive input merged from keyboard and on-screen touch controls. Plain objects, read every frame by the
 * bike; nothing here triggers React renders.
 */

export type Axis = { forward: boolean; back: boolean; left: boolean; right: boolean }

const keyboard: Axis = { forward: false, back: false, left: false, right: false }
const touch: Axis = { forward: false, back: false, left: false, right: false }
/** Analogue steer from touch (−1 right … +1 left); overrides left/right when non-zero. */
export const touchSteer = { value: 0 }

/** Combined view the bike reads. */
export const driveInput: Axis = {
  get forward() {
    return keyboard.forward || touch.forward
  },
  get back() {
    return keyboard.back || touch.back
  },
  get left() {
    return keyboard.left || touch.left
  },
  get right() {
    return keyboard.right || touch.right
  },
}

export function setTouch(patch: Partial<Axis>): void {
  Object.assign(touch, patch)
}

export function releaseAll(): void {
  keyboard.forward = keyboard.back = keyboard.left = keyboard.right = false
  touch.forward = touch.back = touch.left = touch.right = false
  touchSteer.value = 0
}

type Action = 'headlight' | 'camera' | 'horn' | 'pause'
type ActionListener = (a: Action) => void
const actionListeners = new Set<ActionListener>()

export function onDriveAction(fn: ActionListener): () => void {
  actionListeners.add(fn)
  return () => actionListeners.delete(fn)
}

export function emitDriveAction(a: Action): void {
  for (const fn of actionListeners) fn(a)
}

const KEYMAP: Record<string, keyof Axis> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}

const ACTIONMAP: Record<string, Action> = {
  KeyL: 'headlight',
  KeyV: 'camera',
  KeyH: 'horn',
  Escape: 'pause',
  KeyP: 'pause',
}

let installed = false

/** Install global keyboard listeners once (idempotent). */
export function installKeyboard(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const isTyping = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  }
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return
    const k = KEYMAP[e.code]
    if (k) {
      keyboard[k] = true
      e.preventDefault()
      return
    }
    const a = ACTIONMAP[e.code]
    if (a && !e.repeat) emitDriveAction(a)
  })
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code]
    if (k) {
      keyboard[k] = false
      e.preventDefault()
    }
  })
  // Keys stuck "down" after alt-tab or a dialog: release everything when focus leaves.
  window.addEventListener('blur', releaseAll)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') releaseAll()
  })
}
