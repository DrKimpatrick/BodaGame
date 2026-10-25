# Women on Wheels: Road Rules (boda game)

Read `docs/HANDOFF.md` first, starting with its **START HERE** block: it says what is done, in progress and
next. Keep that block current after every step you finish. The product plan is `docs/ROAD_RULES_PLAN.md`.

- Vite + React 19 + react-three-fiber + Rapier + zustand + Tailwind v4.
- Must run well on low-end phones: no per-frame allocation, no per-frame zustand updates, prefer instancing
  or `StaticBatch` for anything repeated, check `__wowGl.info.render.calls` after visual changes.
- Run `npm run test:rules` and `npx tsc -p tsconfig.app.json --noEmit` before finishing a change.
