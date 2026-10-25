import { useRef } from 'react'
import { driveInput, installKeyboard, type Axis } from '../input/driveInput'

export type KeyAxis = Axis

/** Drive input (keyboard + touch) as a stable ref the bike reads every frame. */
export function useKeyboard() {
  installKeyboard()
  return useRef<KeyAxis>(driveInput)
}
