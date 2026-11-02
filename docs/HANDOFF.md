# Women on Wheels: Road Rules — handoff

Read this first if you are picking up the work. Keep the **START HERE** block current after every step.

## START HERE

**Last updated:** 2026-11-02 (end of session 7). All work through session 7 is committed on `main`; sessions 6 and 7
are not pushed. Commit before starting anything big.

**Done and verified in the browser**
- Rules engine (`src/roadRules/engine.ts`), 29 scenarios (`src/roadRules/data/scenarios.json`), live rules
  (`src/roadRules/liveRules.ts`). `npm run test:rules` passes 16/16.
- Live rule monitor (`components/roadRules/RoadRulesMonitor.tsx`): red light, STOP, give way, speed / school
  zone, zebra, keep left, pavement, dusk headlight, collisions. Verified: zebra violation, pedestrian hit → jail.
- Game flow (`src/store/useRoadRulesStore.ts`): cards (verified incl. timeout), jail day-by-day (verified),
  shift summary with bill + children (verified), rain shift (verified), game over, spaced repetition,
  analytics log, learner hints with voice.
- World: traffic keeps left; junctions are signal / STOP / give-way; instanced signals and signs; cars stop
  at red / STOP and yield to the rider; a car hitting a stopped rider isn't her fault.
- New UI (old HUD / landing deleted): `components/ui/*`; touch controls verified on 375×812 and 844×390.
- Realism: Kampala shop rows at real scale (`components/realism/KampalaBuildings.tsx` + `kampalaLots.ts`),
  procedural textures (`realism/textures.ts`), trees and palms + static people (`realism/Nature.tsx`),
  instanced walking crowd in dresses / shirts (`components/Pedestrians.tsx`), Bajaj-style boda with spinning
  wheels (`components/BodaModel.tsx`), female rider + helmeted passenger (`components/RiderModel.tsx`),
  GTA-style chase cam + helmet cam (V), weather lighting + rain.
- Performance: draw calls 19,734 → ~650–750 (`components/StaticBatch.tsx` colour-collapse batching, shop
  sign / street name atlases, instanced crowd); menu bundle 95 KB gzip, 3D engine lazy-loaded
  (`components/GameCanvas.tsx`); WebGL context-loss recovery; DPR caps per quality; no CDN downloads
  (local environment light-formers, local cloud sprite).
- `tsc`, `npm run build` pass. Lint: only findings that already existed in the original code remain
  (BikeDustTrail, BikeExhaust, Boda, JobRouteGuide, RoadTraffic, BuildingFacadeWindows, BuildingPerimeterFence).

**Session 2 (2026-10-25)**
- Dusk shift verified (headlight hint, lights rule, toggle). Fixed a double-counted drop-off that skipped a
  shift (event hubs in `telemetry.ts` keyed by owner; `onDelivery(count)` idempotent).
- Traffic: real-scale vehicles (`components/realism/Vehicles.tsx`, specs in `vehicleSpecs.ts`) with wheel
  arches, tinted glass, matatu band. Car-following; queuing traffic stays behind the camera. All showroom
  vehicles checked (`/?showroom`).

**Session 3 (2026-10-25): bigger, Kampala-like city**
- Grid is now 12×12 blocks, 9 m roads (two lanes each way, double centre line, lane dividers), 44 m blocks,
  2.2 m pavements: ~645 m across (`src/game/cityGrid.ts`). Everything derives from these constants.
- Kampala map data in `src/game/kampalaMap.ts` (research and sources: `docs/KAMPALA_RESEARCH.md`): real road
  names (Kampala Rd × Entebbe Rd at the centre), six roundabouts (Clock Tower, Jinja Rd/Kitgum House,
  Wandegeya, Kubiri, Kamwokya, Kibuye), landmark blocks, hills.
- Roundabouts (`components/realism/Roundabouts.tsx`): paved circle, kerbed island with collider, Clock Tower /
  fountain / garden / crested-crane centrepieces. Traffic goes round clockwise on an arc and gives way to
  circulating cars (`startRound` / `advanceRound` in `RoadTraffic.tsx`). Rules: wrong way round
  (`roundabout` live rule), entering in front of circulating traffic (`giveway`), learner hint. Give-way lines
  sit at the circle edge (`stopLineEdge`).
- Landmarks (`components/realism/Landmarks.tsx`): Independence Monument park, Old Taxi Park full of matatus,
  Nakasero Market. Hills with Gaddafi Mosque, Rubaga, Namirembe, Kibuli, Bahá'í dome, Mengo palace, Kololo
  masts and ~1,700 houses (`components/realism/Hills.tsx`), drawn without scene fog with baked haze.
- Street life (`components/realism/StreetLife.tsx`): ~1,300 instanced street lights (on at dusk), boda stages.
- Mid-rise towers got office-block detail (podium, slab bands, tanks, aerial).
- Shadows follow the rider (`SunLight` in `GameScene.tsx`). View distance scales with quality
  (`components/viewScale.ts`); city batch cells beyond the fog are culled (`StaticBatch` `cullDistance`);
  only pedestrians near the camera are drawn (packed instances).
- Parked cars use the real vehicle models; distant/parked bodas use `BodaModel low`.
- Loading screen waits for the city to be built (`sceneStatus.cityBuilt`).
- Offline / installable: `public/manifest.webmanifest`, `public/sw.js` (registered in production only), new
  icon `public/icon.svg`. Removed ~55 MB of unreferenced old media from `public/` (still in git history).
- Measured: production load 2.8 s on this Mac; worst-case view ~590 draw calls / 1.0 M triangles on `low`,
  ~1,180 / 2.3 M on `high`. Tests 16/16, `tsc` and `npm run build` pass; lint clean except the findings that
  were in the original code (BikeDustTrail, BikeExhaust, Boda, JobRouteGuide, RoadTraffic refs,
  BuildingFacadeWindows, BuildingPerimeterFence).

**Session 4 (2026-10-25): Ugandan roads and Kampala Road**
- Road types (`src/game/cityGrid.ts`: `ROAD_KIND_NS/EW`, `nsHalf/ewHalf`, `laneCentres`): dual carriageway
  16 m (Kampala Rd, Jinja Rd) with a solid black-and-white-kerbed median, main roads 11 m (two lanes each way,
  double centre line), side streets 7.5 m (one lane each way, faded dashes, patched tarmac, more potholes),
  murram 6.5 m on the outskirts (red, unpaved, no markings or lamps, bike capped at ~43 km/h). Open concrete
  drains beside main roads. Strip centres keep the uniform pitch; every width user reads the per-road half
  (junction stop lines use the crossing road: `approachHalf` / `crossHalf` / `stopLineEdge(jn, h)`).
- `components/RoadNetwork.tsx` rewritten around road segments; roundabouts enlarged (`ROUNDABOUT` disc 11 m).
- Kampala Road frontage is a continuous colonial-era arcade row (columns, green shutters, year plaques:
  `ColonialBuilding` in `realism/KampalaBuildings.tsx`, `style: 'colonial'` in `kampalaLots.ts`).
- Constitutional Square (park, benches, Uganda flag) added to `Landmarks.tsx`.
- City boundary walls; nearby pickups (≤170 m along streets); rules-mode fuel burn matched to ~UGX 300 per
  trip; spawn on Entebbe Rd's kerb lane.
- Roundabout wrong-way rule moved to a pure function (`roadRules/world/roundaboutRule.ts`) with tests:
  `npm run test:rules` now runs 20 tests (engine + roundabout rule), all passing.
- Dev hooks: `__wowTeleport(x, z, yaw)` moves the bike; `__wowCam` / `__wowRay` for raycasting.
- Performance on `low` at the start view: ~800 draw calls / 1.7 M triangles (batch cells 180 m, lower-poly
  wheels, fewer trees / lamps / hill houses / parked cars on low).

**Session 5 (2026-10-25): full shift, more Kampala, boda stages**
- Full shift ridden end to end in shift mode (teleport-assisted): three trips, pickup cards answered, ledger
  fares 17,000 + bonuses 9,000 − bill 20,000 → cash 28,501, kids' care 70 → 78. The economy holds.
- New landmark blocks (`LANDMARK_BLOCKS` in `kampalaMap.ts`, drawn in `realism/Landmarks.tsx`):
  Owino / St Balikuddembe market {4,4} (56 tarp-roofed stalls, clothes heaps, crowd), Makerere University
  {3,10} (gate with name board, white Main Building with clock tower, colliders), Mulago Hospital {5,11}
  (five-storey ward block, red cross, gate, waiting relatives, colliders). Shops / trees / midrises already
  skip landmark blocks via `isLandmarkBlock`.
- Boda stages now have shelters (`StageShelter` in `realism/StreetLife.tsx`): tin roof on poles, bench, and a
  yellow "BODA BODA STAGE" board naming the road (one atlas, one material).
- Gotcha: `StaticBatch` merges geometry once, so after editing a batched mesh's transform, reload the page;
  hot reload keeps the old merged mesh.
- Tests 20/20, `tsc`, `npm run build` pass; lint clean on changed files. High quality at Owino: ~930 draw
  calls / 2.8 M triangles (shadow pass included).

**Session 6 (2026-11-02): flyover, Kisekka, Nakivubo channel, hill roads**
- Nakivubo channel (`realism/Channel.tsx`): blocks {4,3} {5,3} {6,3}, just south of Owino. It has real depth:
  the city ground is now a `ShapeGeometry` with openings (`buildGroundGeometry` in `CityMap.tsx`). Walls, silt,
  rubbish, scrolling water, culverts under Luwum St and Entebbe Rd, rails with colliders, footbridge, kiosks.
- Clock Tower flyover (`realism/Flyover.tsx`): blocks {6,1} {6,2}, crossing Queensway beside the roundabout. It
  is scenery: riders pass under it, the ramp feet are barred with no-entry signs, and eight instanced cars loop
  on the deck. Making it rideable needs work in the rules (`isOnRoad` says the deck is off-road) and traffic AI.
- Kisekka Market (`Kisekka` in `realism/Landmarks.tsx`): block {3,4} on Nakivubo Rd, arcades around a yard of
  tyres, exhaust tables and bodas under repair.
- Hill roads: `buildHillRoad` in `realism/Hills.tsx`, laterite or tarmac ribbons in the terrain's mesh; houses
  keep clear of them.
- `forcedShopEdges` (`kampalaMap.ts`) keeps shop rows on the edges that don't touch a linear feature (channel
  blocks front Nakivubo Rd; flyover blocks flank the deck). `nameSign` moved to `realism/nameSign.ts`.
- Verified in the browser: ridden under the flyover and across the Entebbe Rd culvert with no collision; no
  runtime errors. Tests 20/20, `tsc`, `npm run build` pass; lint clean on `CityMap.tsx` and `realism/`.
- Performance, measured on `low` against the session 5 commit at the same spots (calls / triangles, including
  the shadow pass): worst view looking north from the flyover foot 963 / 2.34 M before, 972 / 2.42 M after;
  spawn 409 / 980 k before, 427 / 1.03 M after. Session 6 adds at most 22 calls and 116 k triangles. The older
  "worst view on low" figures above are out of date: 2.3–2.4 M was already reached before this session.

**Session 7 (2026-11-02): smooth riding, traffic that sees the rider, controls, mute**
- Biggest cause of jerkiness: `GameScene` and `GameCanvas` subscribed to `fuel`, which changes every frame while
  riding, so React re-rendered the whole city every frame (~500 ms per change in dev; riding ran at ~2 fps here).
  They now select a boolean. **Never subscribe a component in or above the scene to a per-frame store value.**
- Physics: `timeStep="vary"` and `updatePriority={-50}`: one step per frame, before all other frame callbacks, so
  bike, camera and traffic read the same instant. Traffic moves with `setNextKinematicTranslation`.
- Bike (`Boda.tsx`): no reverse at all; the brake holds it still; steering on the spot gets it off a wall.
  Accelerator, brake and steering ease in. Accel 8.5 m/s², coasting is gentle, and turn rate falls with speed
  (it used to rise with speed). Top speed unchanged (~68 km/h). A vehicle strike shoves the bike clear.
- Traffic bugs fixed: `headingToYaw` had E and W swapped, so all E–W vehicles drove in reverse (`roundYaw` too).
  Roundabouts ran anticlockwise from above, so a rider obeying the hint got a wrong-way violation: traffic and
  `roundaboutRule.ts` now go clockwise from above (angle increases) and its test was flipped to match. Turns follow
  a curve through the junction (`enterJunction`, `advanceArc`) instead of snapping onto the new lane.
- Traffic AI (`controlledTargetSpeed`, `riderAtFault`, `planPass` in `RoadTraffic.tsx`): drivers watch where the
  rider is and is about to be, match speed behind her and brake up to 13 m/s² if she is in the right. Riding
  against the flow or crossing against a red / STOP / give-way line gets ordinary braking only, so she can be
  knocked. A vehicle in contact stops dead rather than driving over her. Cars change lane round slow traffic, and
  bikes squeeze past within the lane. A vehicle stuck 22 s behind other traffic stops waiting for it (anti-gridlock).
- Rendering: `TrafficInstances.tsx` bakes one instanced set per vehicle type and draws only vehicles near the
  camera; slot kinds are fixed, so respawns no longer remount. Rider and bike are batched. Shadow map redraws every
  second frame. `AdaptiveResolution` (`GameCanvas.tsx`) drops render resolution under ~42 fps. `high` DPR cap 1.5.
  Shared batching helpers are in `batchGeometry.ts`; a failed merge now keeps its meshes visible.
- Flicker: near plane 0.15 → 0.4 and lots / perimeter layers moved apart (they were 1–4 mm apart).
- Proportions: roads wider (street 9, main 14, dual 18, murram 8 m; `ROUNDABOUT` disc 13), traffic scaled
  (`vehicleScale`: cars 0.9, bus / lorry 0.8), landmark `PLOT` = `BLOCK` − 10, higher chase camera that pulls in
  rather than sit inside a wall (ray-cast against fixed scenery only).
- Controls: Space also brakes; M mute, ? guide. `inputGate.riding` keeps riding keys out of menus. `ui/RideGuide.tsx`:
  `HowToRide` (first ride, ? button, pause menu, start screen), `KeyStrip`, `RideCoach` (live tips, setting "Riding
  tips"). Bigger touch pads on tablets.
- Mute: settings `muted` (master), `music`, `sound`. All Web Audio goes through `setWebAudioMuted` (suspends the
  shared context: the engine and clicks used to ignore the sound setting). HUD button, M, start screen, settings.
- Verified in the browser: 0 of 78 vehicles facing the wrong way; rider stopped in a live lane 22 s, no hits, nearest
  vehicle 3.2 m; riding head-on against traffic knocked her in 3 of 4 tries; brake held 2 s moved 0 m; 10 of 10
  roundabout samples clockwise; passenger pickup and drop-off work on the wider roads; mute suspends audio and pauses
  music. Riding here: ~61 fps, median 17 ms, worst 24 ms (Apple Silicon Mac, dev build, small pane). Tests 20/20, `tsc`,
  `npm run build` pass. Lint: only older findings remain (BikeDustTrail, BikeExhaust, Boda `speed` refs, JobRouteGuide,
  BuildingFacadeWindows, BuildingPerimeterFence).
- On `low` (calls / triangles, including the shadow pass where there is one): heaviest view 972 / 2.42 M → 611 / 2.16 M;
  spawn 427 / 1.03 M → 280 / 0.99 M. `VIEW_SCALE.low` is now 0.5.
- Not established: a road actually vanishing was never reproduced. The reported screenshot looks like a car on top
  of the rider (bike at 68%, exactly one 32-point hit). Flicker and batching fixes address the other likely causes.
- Dev hooks: `__wowTeleport` resets speed now. Yaw 0 = −Z, π = +Z, −π/2 = +X, π/2 = −X. Traffic faces (sin yaw, cos yaw).
- Measuring gotcha: long `requestAnimationFrame` loops in tests can hit the tool's 45 s limit when frames are slow.

**Next (in priority order)**
1. Real low-end Android device pass (needs a phone: not done). Views looking north across the whole city are
   the ones to test (~610 calls / 2.2 M triangles on `low`). If slow: lower `TREE_SHARE.low`, skip shop window
   details on low, reduce traffic `LANES_PER_STRIP`, or thin the Owino crowd on low. Triangles are the remaining
   concern; most are in the merged city.
2. Confirm with the player that roads no longer vanish; if they do, get the location and weather.
3. Legal check of rules and the `v2-draft` scenarios; official sign artwork.
4. Optional: a rideable flyover (see session 6).

## How to run and test

- Dev server: `npm run dev` (Vite, port 5173). In the Claude desktop app the preview configs are `boda` (dev)
  and `boda-prod` (`npm run preview` on 4173: run `npm run build` first).
- Dev URL flags: `?test` stops the auto-pause when the preview pane reports "hidden"; `?showroom` also parks
  one of each vehicle ahead of the spawn.
- Engine tests: `npm run test:rules` (Node's built-in runner, no extra deps).
- Typecheck: `npx tsc -p tsconfig.app.json --noEmit`.
- Dev-only hooks in the browser console: `__wow.game`, `__wow.rules` (zustand stores), `__wow.telemetry`
  (bike / traffic / `monitorDebug`), `__wowGl.info.render.calls` (draw calls), `__wowScene`.
  Drive with `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`.
- The browser pane throttles frames when hidden; world time is clamped per frame, so timers run slow there.

## Architecture in one screen

| Area | Files | Notes |
|---|---|---|
| Rules engine (pure, portable to Unity/VR) | `src/roadRules/engine.ts`, `constants.ts`, `liveRules.ts`, `scenarios.ts`, `data/scenarios.json` | No React / Three imports. Tested in `engine.test.ts`. |
| World rules data | `src/roadRules/world/junctions.ts` | Junction control, signal timing (`signalAspect`), stop lines, school zones, zebras. Uganda keeps left. |
| Per-frame shared state | `src/roadRules/world/telemetry.ts` | Plain objects (bike pose, traffic positions, world clock). Never put per-frame data in zustand. |
| Ride economy | `src/store/useGameStore.ts` | Wallet, fuel, condition, jobs, weather, headlight, economy (`rules` = realistic fares). |
| Game state | `src/store/useRoadRulesStore.ts` | Wraps the engine, syncs cash to the wallet, overlays, toasts, progress. |
| Settings | `src/store/useSettingsStore.ts` | Quality (auto-detected), camera, timer, gentle mode, voice, sound. |
| 3D scene | `src/components/GameScene.tsx` | Weather lighting, rain, monitor. |
| UI | `src/components/ui/*` | Mobile-first, Tailwind v4. |
| Input | `src/input/driveInput.ts` | Keyboard + touch merged; actions L / V / H / M / ? / Esc; `inputGate`. |

## Decisions and constraints

- Fines and jail terms are game values. Rules need a legal check (Traffic and Road Safety Act, Highway Code).
- Five scenarios marked `"source": "v2-draft"` (luggage, child, flood, nightsafety, permit) were written here
  and need the same check as the prototype ones.
- No translations were written: an unchecked translation of safety rules could teach the wrong thing.
- Gentle mode softens child-loss text only; money and jail stakes stay (per the developer notes).
- Signs are drawn SVG (`src/roadRules/signs.ts`), not official MoWT artwork.
- `useGameStore.money` is the single source of truth for cash; the engine's `cash` is synced from it.
