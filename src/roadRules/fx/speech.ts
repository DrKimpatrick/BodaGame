import { useSettingsStore } from '../../store/useSettingsStore'

/**
 * Read-aloud for low-literacy play, using the device's speech engine (works offline on most phones).
 * Prefers an East African / British English voice when the device has one.
 */

let voice: SpeechSynthesisVoice | null | undefined

function pickVoice(): SpeechSynthesisVoice | null {
  if (voice !== undefined) return voice
  const all = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : []
  if (all.length === 0) return null
  voice =
    all.find((v) => /en[-_](UG|KE|TZ)/i.test(v.lang)) ??
    all.find((v) => /en[-_]GB/i.test(v.lang) && /female|libby|sonia|serena|kate/i.test(v.name)) ??
    all.find((v) => /en[-_]GB/i.test(v.lang)) ??
    all.find((v) => v.lang.startsWith('en')) ??
    null
  return voice
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => {
    voice = undefined
  }
}

export function speak(text: string, opts: { interrupt?: boolean; force?: boolean } = {}): void {
  if (typeof speechSynthesis === 'undefined') return
  const settings = useSettingsStore.getState()
  if (settings.muted || (!opts.force && !settings.voice)) return
  if (opts.interrupt !== false) speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const v = pickVoice()
  if (v) u.voice = v
  u.rate = 0.95
  u.pitch = 1.05
  speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}
