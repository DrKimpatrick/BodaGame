/**
 * Per-event log for the pilot (training-effect evidence). Stored on the device only; the end screen can
 * export it as JSON. If this ever informs lending or placement decisions, get consent first (Uganda Data
 * Protection and Privacy Act, 2019).
 */

export type RREvent = {
  sessionId: string
  at: number
  type: 'card' | 'violation' | 'good_move' | 'shift_end' | 'game_over' | 'quiz'
  scenarioId?: string
  chosenOption?: string
  correct?: boolean
  timedOut?: boolean
  timeToAnswerMs?: number
  shift: number
  cash: number
  life: number
  detail?: string
}

const KEY = 'wow-road-rules-events'
const CAP = 2_000

export function newSessionId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

let buffer: RREvent[] | null = null

function load(): RREvent[] {
  if (buffer) return buffer
  try {
    const raw = localStorage.getItem(KEY)
    buffer = raw ? (JSON.parse(raw) as RREvent[]) : []
  } catch {
    buffer = []
  }
  return buffer
}

let flushTimer: ReturnType<typeof setTimeout> | null = null

export function logEvent(e: RREvent): void {
  const b = load()
  b.push(e)
  if (b.length > CAP) b.splice(0, b.length - CAP)
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    try {
      localStorage.setItem(KEY, JSON.stringify(load()))
    } catch {
      /* storage full or blocked: keep in memory */
    }
  }, 1_000)
}

export function allEvents(): readonly RREvent[] {
  return load()
}

export function downloadEvents(): void {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `road-rules-log-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}
