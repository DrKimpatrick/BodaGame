import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { isDrivableSurface, isOnRoad } from '../../game/roadSpatial'
import { SPEED_LIMIT_SCHOOL, SPEED_LIMIT_TOWN, STOP_MAX_KMH, ZEBRA_MAX_KMH } from '../../roadRules/constants'
import { LIVE_RULES } from '../../roadRules/liveRules'
import {
  axisOf,
  blockAlong,
  distToStopLine,
  isSchoolSegment,
  JUNCTIONS,
  ROUNDABOUT,
  junctionAt,
  leftVec,
  mustYield,
  secondsUntilGreen,
  signalAspect,
  stripFor,
  ZEBRAS,
  type Heading,
  type Junction,
} from '../../roadRules/world/junctions'
import { stepWrongWay } from '../../roadRules/world/roundaboutRule'
import { bikeTelemetry, monitorDebug, onBikeCollision, trafficTelemetry, worldClock } from '../../roadRules/world/telemetry'
import { ewHalf, nsHalf, roadStripCenterX, roadStripCenterZ, NUM_BLOCKS } from '../../game/cityGrid'
import { useGameStore } from '../../store/useGameStore'
import { CARD_INTERVAL, useRoadRulesStore } from '../../store/useRoadRulesStore'

/**
 * Watches how the rider actually rides and reports rule breaks / good moves to the road-rules store.
 * Runs inside the Canvas (one useFrame, no allocation per frame), so it pauses with the world.
 */

type Approach = {
  key: string
  jn: Junction
  h: Heading
  minKmh: number
  sawRed: boolean
  hinted: boolean
}

const ZEBRAS_BY_STRIP = (() => {
  const m = new Map<string, typeof ZEBRAS>()
  for (const z of ZEBRAS) {
    const k = `${z.axis}:${z.strip}`
    m.set(k, [...(m.get(k) ?? []), z])
  }
  return m
})()

function headingFromYaw(yaw: number): Heading | null {
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  if (Math.max(Math.abs(fx), Math.abs(fz)) < 0.86) return null
  if (Math.abs(fz) >= Math.abs(fx)) return fz > 0 ? 'N' : 'S'
  return fx > 0 ? 'E' : 'W'
}

/** Next interior junction ahead on this strip, or null. */
function nextJunction(h: Heading, strip: number, x: number, z: number): Junction | null {
  if (h === 'N' || h === 'S') {
    for (let k = h === 'N' ? 1 : NUM_BLOCKS - 1; h === 'N' ? k < NUM_BLOCKS : k >= 1; k += h === 'N' ? 1 : -1) {
      const cz = roadStripCenterZ(k)
      if (h === 'N' ? cz > z : cz < z) return junctionAt(strip, k) ?? null
    }
    return null
  }
  for (let k = h === 'E' ? 1 : NUM_BLOCKS - 1; h === 'E' ? k < NUM_BLOCKS : k >= 1; k += h === 'E' ? 1 : -1) {
    const cx = roadStripCenterX(k)
    if (h === 'E' ? cx > x : cx < x) return junctionAt(k, strip) ?? null
  }
  return null
}

/** Is a car on the crossing road close to the junction and moving towards it? */
function crossTrafficNear(jn: Junction, myAxis: 'ns' | 'ew', radius: number): boolean {
  const t = trafficTelemetry
  for (let i = 0; i < t.count; i++) {
    const dx = jn.x - t.x[i]!
    const dz = jn.z - t.z[i]!
    const vx = t.vx[i]!
    const vz = t.vz[i]!
    const speed = Math.hypot(vx, vz)
    if (speed < 1) continue
    // Car travelling on the other axis, within radius, heading into the junction.
    const onOther = myAxis === 'ns' ? Math.abs(vx) > Math.abs(vz) && Math.abs(dz) < ewHalf(jn.j) + 0.5 : Math.abs(vz) > Math.abs(vx) && Math.abs(dx) < nsHalf(jn.i) + 0.5
    if (!onOther) continue
    const dist = Math.hypot(dx, dz)
    if (dist > radius) continue
    if (dx * vx + dz * vz > 0) return true
  }
  return false
}

let unsubscribeRide: (() => void) | null = null

/** Any vehicle on the roundabout's paved circle within `radius` of (x, z)? */
function circulatingNear(jn: Junction, x: number, z: number, radius: number): boolean {
  const t = trafficTelemetry
  for (let i = 0; i < t.count; i++) {
    const cx = t.x[i]! - jn.x
    const cz = t.z[i]! - jn.z
    if (cx * cx + cz * cz > ROUNDABOUT.disc * ROUNDABOUT.disc) continue
    if (Math.hypot(t.x[i]! - x, t.z[i]! - z) < radius) return true
  }
  return false
}

const ROUNDABOUT_JUNCTIONS = JUNCTIONS.filter((j) => j.control === 'roundabout')

export function RoadRulesMonitor() {
  const prev = useRef({ x: 0, z: 0, valid: false })
  const approach = useRef<Approach | null>(null)
  const timers = useRef({ over: 0, wrongSide: 0, pavement: 0, dark: 0, wrongWay: 0 })
  const roundPrev = useRef<{ key: string; th: number } | null>(null)
  const hinted = useRef({ zebraAt: -99, schoolKey: '', lightsAt: -99 })

  // Collisions → rule events.
  useEffect(
    () =>
      onBikeCollision('rule-monitor', (kind) => {
        const s = useRoadRulesStore.getState()
        if (!s.rr) return
        if (kind === 'pedestrian') s.reportViolation('hitPedestrian')
        // A car running into a stopped or crawling rider is not her mistake.
        else if (kind === 'vehicle' && Math.abs(bikeTelemetry.speed) > 2.5) s.reportViolation('crash')
      }),
    [],
  )

  // Passenger picked up → maybe a passenger card; drop-off → shift ledger.
  // One subscription at a time even if the effect runs twice (see the note in telemetry.ts).
  useEffect(() => {
    unsubscribeRide?.()
    const unsub = useGameStore.subscribe((g, p) => {
      const s = useRoadRulesStore.getState()
      if (!s.rr) return
      if (g.ridePickupToastNonce !== p.ridePickupToastNonce && Math.random() < 0.6) {
        setTimeout(() => useRoadRulesStore.getState().presentCard(['pickup']), 700)
      }
      if (g.rideCompletedDeliveries > p.rideCompletedDeliveries) s.onDelivery(g.rideCompletedDeliveries)
    })
    unsubscribeRide = unsub
    return () => {
      unsub()
      if (unsubscribeRide === unsub) unsubscribeRide = null
    }
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    worldClock.t += dt
    const store = useRoadRulesStore.getState()
    const rr = store.rr
    const b = bikeTelemetry
    const p = prev.current
    if (!rr || store.overlay) {
      p.valid = false
      approach.current = null
      return
    }
    if (p.valid && Math.hypot(b.x - p.x, b.z - p.z) > 6) p.valid = false // teleport / reset
    const learner = rr.difficulty === 'learner'
    const kmh = Math.abs(b.speed) * 3.6
    const forward = b.speed > 0.3
    const h = headingFromYaw(b.yaw)
    const t = worldClock.t

    // Encounter cards on a timer while riding.
    if (kmh > 8 && t - store.lastCardAt > CARD_INTERVAL) {
      if (!store.presentCard(['road', 'anytime'])) useRoadRulesStore.setState({ lastCardAt: t })
      p.valid = false
      return
    }

    monitorDebug.heading = h ?? ''
    if (h) {
      const axis = axisOf(h)
      const strip = stripFor(axis, b.x, b.z)
      monitorDebug.strip = strip ?? -1
      const along = axis === 'ns' ? b.z : b.x
      if (strip != null) {
        /* ----- Junction approach: signals, STOP, give way ----- */
        const jn = nextJunction(h, strip, b.x, b.z)
        const controlled = jn && (jn.control === 'signal' || mustYield(jn, axis))
        if (jn && controlled) {
          const key = `${jn.i}:${jn.j}:${h}`
          let ap = approach.current
          if (!ap || ap.key !== key) ap = approach.current = { key, jn, h, minKmh: 999, sawRed: false, hinted: false }
          const d = distToStopLine(jn, h, b.x, b.z)
          monitorDebug.junction = `${key} ${jn.control}`
          monitorDebug.distToLine = d
          if (d > 0 && d < 16) {
            ap.minKmh = Math.min(ap.minKmh, kmh)
            if (jn.control === 'signal' && signalAspect(jn, axis, t) !== 'green') ap.sawRed = true
          }
          if (learner && !ap.hinted && d > 0 && d < 24 && forward) {
            ap.hinted = true
            if (jn.control === 'roundabout') {
              store.hint(`${jn.name ?? 'Roundabout'} roundabout ahead. Give way to traffic from your right, then go round clockwise.`, 'roundabout')
            } else if (jn.control === 'signal') {
              const a = signalAspect(jn, axis, t)
              if (a !== 'green') store.hint(`${a === 'red' ? 'Red' : 'Amber'} light ahead. Stop behind the white line. Green in about ${Math.ceil(secondsUntilGreen(jn, axis, t))} seconds.`, 'redlight')
            } else {
              const rule = LIVE_RULES[jn.control === 'stop' ? 'stop' : 'giveway']
              store.hint(rule.hint!, rule.sign)
            }
          }
          if (p.valid && forward) {
            const dPrev = distToStopLine(jn, h, p.x, p.z)
            if (dPrev > 0 && d <= 0) {
              if (jn.control === 'signal') {
                const a = signalAspect(jn, axis, t)
                if (a === 'red') store.reportViolation('red')
                else if (ap.sawRed && ap.minKmh < STOP_MAX_KMH) store.reportGoodMove('red')
              } else if (jn.control === 'roundabout') {
                if (circulatingNear(jn, b.x, b.z, 9)) store.reportViolation('giveway')
                else if (ap.minKmh < 15) store.reportGoodMove('roundabout')
              } else if (jn.control === 'stop') {
                if (ap.minKmh < STOP_MAX_KMH) store.reportGoodMove('stop')
                else store.reportViolation('stop')
              } else if (crossTrafficNear(jn, axis, 11)) {
                store.reportViolation('giveway')
              } else if (ap.minKmh < 12 && crossTrafficNear(jn, axis, 26)) {
                store.reportGoodMove('giveway')
              }
              approach.current = null
            }
          }
        } else {
          approach.current = null
        }

        /* ----- Speed limits ----- */
        const block = blockAlong(along)
        const school = isSchoolSegment(axis, strip, block)
        const limit = school ? SPEED_LIMIT_SCHOOL : SPEED_LIMIT_TOWN
        b.limitKmh = limit
        if (learner && school) {
          const sk = `${axis}:${strip}:${block}`
          if (hinted.current.schoolKey !== sk) {
            hinted.current.schoolKey = sk
            store.hint(LIVE_RULES.school.hint!, 'school')
          }
        }
        monitorDebug.limit = limit
        monitorDebug.overTimer = timers.current.over
        if (kmh > limit + 3) {
          timers.current.over += dt
          if (timers.current.over > 2) {
            timers.current.over = 0
            store.reportViolation(school ? 'school' : 'speed')
          }
        } else timers.current.over = Math.max(0, timers.current.over - dt * 2)

        /* ----- Zebra crossings ----- */
        const zebras = ZEBRAS_BY_STRIP.get(`${axis}:${strip}`)
        if (zebras) {
          for (const zb of zebras) {
            const dz = zb.along - along
            const ahead = h === 'N' || h === 'E' ? dz : -dz
            if (Math.abs(dz) < 1 && kmh > ZEBRA_MAX_KMH) store.reportViolation('zebra')
            if (learner && ahead > 4 && ahead < 14 && t - hinted.current.zebraAt > 25 && forward) {
              hinted.current.zebraAt = t
              store.hint(LIVE_RULES.zebra.hint!, 'zebra')
            }
          }
        }

        /* ----- Keep left (outside the junction box) ----- */
        const cx = axis === 'ns' ? roadStripCenterX(strip) : roadStripCenterZ(strip)
        const lateralRaw = (axis === 'ns' ? b.x : b.z) - cx
        const lv = leftVec(h)
        const lateral = lateralRaw * (axis === 'ns' ? lv.x : lv.z)
        const pitch = roadStripCenterZ(1) - roadStripCenterZ(0)
        const nearest = roadStripCenterZ(0) + Math.round((along - roadStripCenterZ(0)) / pitch) * pitch
        // Junction box depth along this road = half width of the crossing road there.
        const kCross = Math.round((nearest - roadStripCenterZ(0)) / pitch)
        const crossH = axis === 'ns' ? ewHalf(kCross) : nsHalf(kCross)
        const inBox = Math.abs(along - nearest) < crossH + 1.5
        const nearRoundabout = ROUNDABOUT_JUNCTIONS.some((rb) => Math.hypot(b.x - rb.x, b.z - rb.z) < ROUNDABOUT.disc + 3)
        if (forward && kmh > 14 && lateral < -0.3 && !inBox && !nearRoundabout) {
          timers.current.wrongSide += dt
          if (timers.current.wrongSide > 2.5) {
            timers.current.wrongSide = 0
            store.reportViolation('keepleft')
          }
        } else timers.current.wrongSide = Math.max(0, timers.current.wrongSide - dt)
      }
    }

    /* ----- Roundabouts: clockwise only ----- */
    let onRoundabout = false
    for (const rb of ROUNDABOUT_JUNCTIONS) {
      const dx = b.x - rb.x
      const dz = b.z - rb.z
      const r = Math.hypot(dx, dz)
      if (r > ROUNDABOUT.disc + 0.5) continue
      onRoundabout = true
      const key = `${rb.i}:${rb.j}`
      const th = Math.atan2(dz, dx)
      const prevR = roundPrev.current
      if (prevR && prevR.key === key) {
        const res = stepWrongWay({ timer: timers.current.wrongWay, prevTh: prevR.th, th, r, island: ROUNDABOUT.island, kmh, dt })
        timers.current.wrongWay = res.timer
        if (res.broken) store.reportViolation('roundabout')
      }
      roundPrev.current = { key, th }
    }
    if (!onRoundabout) {
      roundPrev.current = null
      timers.current.wrongWay = 0
    }
    monitorDebug.wrongWay = timers.current.wrongWay
    monitorDebug.onRoundabout = onRoundabout
    monitorDebug.kmh = kmh

    /* ----- Pavement / shoulder riding ----- */
    if (!isOnRoad(b.x, b.z) && isDrivableSurface(b.x, b.z) && kmh > 12) {
      timers.current.pavement += dt
      if (timers.current.pavement > 1.5) {
        timers.current.pavement = 0
        store.reportViolation('pavement')
      }
    } else timers.current.pavement = Math.max(0, timers.current.pavement - dt)

    /* ----- Headlight at dusk ----- */
    // Riding time without a light accumulates; slowing at a junction only lets it drain, switching the
    // light on clears it.
    const dusk = useGameStore.getState().weather === 'dusk'
    if (dusk && !b.headlight && kmh > 5) {
      timers.current.dark += dt
      if (timers.current.dark > 5) {
        timers.current.dark = 0
        store.reportViolation('lights')
      }
    } else if (!dusk || b.headlight) timers.current.dark = 0
    else timers.current.dark = Math.max(0, timers.current.dark - dt * 0.5)

    p.x = b.x
    p.z = b.z
    p.valid = true
  })

  return null
}
