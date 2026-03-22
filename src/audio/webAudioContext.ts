/**
 * One AudioContext for engine + impact SFX. Browsers start it suspended until a user gesture
 * calls {@link unlockWebAudioFromUserGesture}.
 */
let shared: AudioContext | null = null

export function getSharedAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('AudioContext requires window')
  }
  if (!shared) {
    shared = new AudioContext()
  }
  return shared
}

/** Call from click / pointerdown / keydown handlers (same turn as the gesture). */
export function unlockWebAudioFromUserGesture(): void {
  try {
    const c = getSharedAudioContext()
    void c.resume()
  } catch {
    /* ignore */
  }
}
