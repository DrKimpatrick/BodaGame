/**
 * One AudioContext for engine + impact SFX. Browsers start it suspended until a user gesture
 * calls {@link unlockWebAudioFromUserGesture}.
 */
let shared: AudioContext | null = null
let muted = false

/** Silences every Web Audio sound at once (engine included) by suspending the shared context. */
export function setWebAudioMuted(next: boolean): void {
  muted = next
  if (!shared) return
  if (muted) void shared.suspend()
  else void shared.resume()
}

export function isWebAudioMuted(): boolean {
  return muted
}

export function getSharedAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('AudioContext requires window')
  }
  if (!shared) {
    shared = new AudioContext()
    if (muted) void shared.suspend()
  }
  return shared
}

/** Call from click / pointerdown / keydown handlers (same turn as the gesture). */
export function unlockWebAudioFromUserGesture(): void {
  if (muted) return
  try {
    const c = getSharedAudioContext()
    void c.resume()
  } catch {
    /* ignore */
  }
}
