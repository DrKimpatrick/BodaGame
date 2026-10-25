# Women on Wheels: Road Rules mode

A new mode in the 3D boda game that teaches Ugandan road rules through consequences. It is built from the
"Road Rules developer notes (prototype v1)" handoff and adapted to the 3D city. Players learn by riding,
not only by answering cards.

## What the player does

1. On the start screen she picks **Road Rules** (or **Free ride**, the old game) and sets the options:
   learner or shift mode, decision timer, gentle mode, read aloud. A content note is shown.
2. She rides real passenger jobs. **A shift is 3 drop-offs.** Fares are realistic (UGX 2,000 to 10,000),
   fuel costs money, and the household bill (UGX 20,000) is due at the end of every shift.
3. The rules are checked **live from her riding**:
   | Rule | How it is detected |
   |---|---|
   | Red traffic light | crossing the stop line while her approach shows red |
   | STOP sign | crossing the line without coming to a full stop (under 4 km/h) |
   | Give way | entering the junction while a car is close on the main road |
   | Speed limit | over 50 km/h (30 km/h in school zones) for 2 s |
   | Zebra crossing | crossing a zebra faster than 20 km/h |
   | Keep left | riding on the right-hand half against traffic |
   | Pavement | riding on the murram shoulder at speed |
   | Lights at dusk | riding a dusk shift without the headlight on |
   | Knocking down a pedestrian or hitting a car | collisions |
4. **Road encounters** (the 24 prototype scenarios) pop up as cards while she rides: police, ambulance,
   helmet, phone, alcohol and so on. They have 3 choices and an optional 12 s timer.
5. Consequences follow the prototype's rules: a right move earns money and life, a wrong move costs a fine,
   life and possibly jail days. Jail and unpaid bills hurt her two children. Death or losing both children
   ends the game, and the end screen lists the rules to review.

## Beyond the prototype

- **Learner mode** with an instructor, Mama Sarah. She warns before each junction ("Red light ahead, stop
  at the white line"). Mistakes are explained, not fined.
- **Shift conditions**: day, then rain (darker, slippery brakes), then dusk (needs the headlight).
- **Good-move rewards**: a clean stop at a red light or STOP sign earns a bonus, life and a streak.
- **Sign quiz** (pre-test and post-test) and a **rule book** of every sign and rule.
- **Road Ready certificate** after a clean shift and a quiz score of 80% or more.
- **Spaced repetition**: missed scenarios come back more often.
- **Analytics log** per event (scenario, choice, correct, timed out, time to answer, cash, life,
  session ID), saved on the device and exportable as JSON for the pilot.
- **Read aloud** with the browser's speech engine, plus whistle and chime sounds.

## Realism and bug fixes in the existing game

- Traffic drove on the right. It now keeps left, as in Uganda.
- Every junction had both traffic lights and STOP signs, and both roads got green at the same time.
  Junctions are now signalised, STOP-controlled or give-way. Lights alternate between the two roads with
  an all-red gap, face the approaching traffic, and cars stop at red.
- Riding off the road was faster than on it (130 km/h cap). It is now slower than the road.
- Top speed on the road was exactly 50 km/h, so speeding was impossible. It is now about 68 km/h.
- Keys stuck down when the window lost focus.
- The speedometer was an external Tenor GIF embed. It is now a local gauge with the speed limit sign.

## Phones, tablets and laptops

- On-screen controls (steer, gas, brake, headlight) with multi-touch, shown on touch devices.
- Compact HUD on small screens; the big panels move into a drawer.
- Works in portrait and landscape; safe-area insets respected.

## Performance

- All traffic lights draw from instanced meshes (5 draw calls in place of about 800 meshes), driven from one
  frame loop with no React re-renders. The old version ran 81 timers and re-rendered on every change.
- Road signs and stop lines are instanced too.
- Bike position for rule checks is shared through a plain object, not the store.
- The HUD no longer re-renders the whole panel tree on every km/h change.
- Pedestrians no longer allocate new math objects every frame.

## Code layout

- `src/roadRules/` holds the pure rules engine (constants, scenarios, live rules, resolve, jail, end of
  shift, spaced repetition, analytics). It has no React or Three.js, so it can be ported to the
  Unity / Quest simulator. Tests: `npm run test:rules`.
- `src/roadRules/world/` holds junction control, signal timing and telemetry shared with the 3D scene.
- `src/store/useRoadRulesStore.ts` holds the mode state.
- `src/components/roadRules/` holds the UI and the in-world pieces.

## Still to do

- Legal check of every rule and fine against the Traffic and Road Safety Act and the Highway Code.
- Official sign artwork (MoWT) in place of the drawn signs.
- Translations (Luganda, Runyankole, Swahili). The text is kept in data files ready for this, but no
  translation was written, because an unchecked translation of safety rules could teach the wrong thing.
- Device pass on low-end Android phones.
