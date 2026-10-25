/**
 * Scenario content lives in `data/scenarios.json` so it can be edited (and later translated) without
 * touching code. `source: "prototype-v1"` came from the handoff; `"v2-draft"` items still need the
 * same legal check.
 */
import data from './data/scenarios.json' with { type: 'json' }
import type { Scenario } from './engine.ts'

export const SCENARIOS: Scenario[] = data as Scenario[]

export const SCENARIO_BY_ID: ReadonlyMap<string, Scenario> = new Map(SCENARIOS.map((s) => [s.id, s]))
