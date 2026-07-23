# Dividing the Brogue-recreation work across agents

How the remaining work — the gap catalog `G1`…`G20` in
[`brogue-fidelity.md`](./brogue-fidelity.md) §3 — splits into **parallel
workstreams** without agents stepping on each other. This doc owns *scheduling
and file ownership*; it never restates what a gap is (look it up by ID).

## The governing principle

> **Pure logic in `src/lib/game/*.ts` parallelizes. The authoritative
> `gameServer.ts`, the wire contract `protocol.ts`, and the renderer
> `DungeonView3D.svelte` serialize.**

Every feature eventually needs an *intent*, an *effect*, and often a *render* —
and those funnel through three shared files. That funnel, not the logic, is the
real limit on parallelism.

## Contention map (current)

| File | Lines | Heat | Why |
|---|---|---|---|
| `components/DungeonView3D.svelte` | 1782 | 🔴 hottest | every terrain kind, FX, status tint, machine prop |
| `server/gameServer.ts` | 1565 | 🔴 hottest | every intent handler, effect branch, world system |
| `components/Hud.svelte` | 621 | 🟠 hot | statuses, sidebar, message log, targeting all want it |
| `game/protocol.ts` | 191 | 🟠 hot (additive) | additions rarely conflict — do them up-front |
| `game/items.ts` | 205 | 🟠 hot | **5 gap IDs want this one file** — must be split (see Phase 0.2) |
| `game/monsters.ts`, `dungeon.ts`, `roomgen.ts`, `gear.ts`, `hazards.ts`, `terrain.ts` | — | 🟢 | single-domain, one owner each |
| new `bolt.ts`, `status.ts`, `scent.ts`, `machines.ts` | — | 🟢 | don't exist yet — zero conflict |

## History

- **Phase 0** (contracts) → **Wave 1** (4 worktree agents: hazards, roomgen,
  monsters, gear) → **Wave 2** (serial integration). All landed; see `TASKS.md`.
- The pattern held: 4 concurrent pure modules merged with no conflicts; the
  integration pass had to be serial. **Repeat it.**

---

## Phase 0.2 — contracts pass ☑ LANDED

Wave 1 worked because Phase 0 cooled the hot files first; this pass does the
same for the next fan-out. 439 tests (was 404), 0 type errors, combat verified
live over the wire.

- ☑ **Identification engine split out.** New pure `identify.ts` owns the
  mechanism (seeded appearance deal, disguise → true name) and knows nothing
  about any catalog; `items.ts` keeps its API and just declares what consumables
  hide behind. **G6–G10 now add a category by adding a file** instead of five
  agents queueing on one 205-line catalog. Guard added: a category whose pool is
  too small to disguise every kind now throws instead of dealing `undefined` —
  the exact failure G9's ~12 new potions would have hit.
- ☑ **Wire contract extended** — `StatusKind` (the full Brogue set),
  `ActorStatus`, `statuses` on `PlayerState`/`MonsterState`, and `AimPoint`
  with an optional `aim` on `throw` (server honors it, falling back to facing;
  the client cursor is G16).
- ☑ **Actor-effect seam** — `damagePlayer` / `damageMonster` in `gameServer.ts`.
  The `hp -= n; if (hp <= 0) {…}` pattern had drifted into **five near-copies**
  (melee, hazard, poison, starvation, death-blast), each re-deriving permadeath
  and the death broadcast. A new damage source is now one call with an epitaph.
- ☑ **Status mechanism** — pure `status.ts` (afflict / refresh / expire /
  query) with 17 tests, plus a decay world-system that ticks the delver and
  every monster on their floor. Deliberately **mechanism only**: what each
  status *does* stays with the system that owns the behaviour (movement,
  scheduler, combat), which is G2's job. Re-applying refreshes to the longer
  duration rather than stacking — stacking is how three gas clouds become
  permanent paralysis.
- ☑ **Terrain registry** — `TERRAIN_PROPS` in `terrain.ts` (one row per kind:
  elevation, blocksMove, occluder, entry hazard, flammable) now backs all five
  derived queries, which were five separate per-kind `switch`/`Set`s. Mirrored
  by `TERRAIN_LOOK` in `DungeonView3D.svelte` (colour + solid-column). **G13
  adds a terrain kind as two rows**, and a new kind can no longer silently miss
  a rule. First tests for `terrain.ts` came with it.

**Deferred on purpose** (doing them now would be guessing):

- **Bolt-resolution hook** — its shape is determined by what `bolt.ts` returns,
  so it belongs to **G1's** agent, not to a pass that can only invent a
  placeholder signature.
- **Message-log / level-feeling wire types** — **G17** owns the only consumer
  and can add them additively in Wave 5. Adding them now would be three waves
  of dead types.

---

## Wave 3 — foundations (4 parallel agents, `isolation: "worktree"`)

Fully disjoint: three brand-new files plus one owned module. **Start these
together.**

| ID | Workstream | Owns | Integrates through | Status |
|---|---|---|---|---|
| **G1** | Bolt engine | new `bolt.ts` (+test) | `gameServer` bolt hook | ☐ |
| **G2** | Status-effect layer — **mechanism landed in Phase 0.2**; this is now RESOLVING each kind (confusion scrambles steps, levitation clears pits, haste/slow feed the scheduler…) and folding `poison` in | `status.ts`, the systems that own each behaviour | `gameServer`, `Hud` (display → defer to G17) | ◐ |
| **G3** | Scent map + real monster AI | new `scent.ts` (+test) | `gameServer` (`actMonster` rewrite — **serial, it's the one server edit in this wave**) | ☐ |
| **G13** | Terrain breadth + layer model | `terrain.ts`, `voxelize.ts` (+tests) | `protocol` (cells), renderer registry, `gameServer` (deep-water pack drop) | ☐ |

⚠️ **G3 and G13 both eventually touch `gameServer.ts`.** Keep both agents in
pure-module scope; land the two server edits serially afterward, G3 first.

## Wave 4 — breadth (5 parallel, after their foundations)

| ID | Workstream | Owns | Depends | Status |
|---|---|---|---|---|
| **G4** | Monster catalog fidelity + spells | `monsters.ts` | G1, G2 | ☐ |
| **G6** | Staffs & wands | new `charged.ts`, `loot.ts` hooks | G1, G2, Phase 0.2 targeting | ☐ |
| **G9** | Potions & scrolls breadth | `items.ts` | G2, G1, G3 | ☐ |
| **G15** | Terrain reactions | `hazards.ts` | G2, G13 | ☐ |
| **G18** | Stealth & noise | `monsters.ts` ⚠️ shares with G4 | G3 | ☐ |

⚠️ **G18 and G4 both own `monsters.ts`** — run them **sequentially** (G4 first,
it reshapes the catalog), or fold G18 into G4's agent as a second task.

## Wave 5 — texture (4 parallel)

| ID | Workstream | Owns | Depends | Status |
|---|---|---|---|---|
| **G7** | Rings | new `rings.ts` | G2, G10 | ☐ |
| **G8** | Charms | new `charms.ts` | G2 | ☐ |
| **G10** | Curses, runics, Detect Magic | `gear.ts`, `items.ts` polarity | — | ☐ |
| **G14** | Lakes / chasms / bridges / autogenerators | `dungeon.ts`, `roomgen.ts` | G13 | ☐ |
| **G17** | Information UI | `Hud.svelte` (**sole owner**) | G2 | ☐ |
| **G19** | Regeneration fidelity | `character.ts` | G7 | ☐ |
| **G20** | Endgame texture | `interactions.ts`, new recap route | — | ☐ |

**`Hud.svelte` has exactly one owner (G17).** Every other workstream that wants
UI ships its data on `protocol` and lets G17 render it. This is the single rule
that keeps the front end parallelizable.

## Wave 6 — authored & metering (mostly serial)

| ID | Workstream | Owns | Depends | Status |
|---|---|---|---|---|
| **G16** | Tactical verbs (targeting cursor, search, drop, rest) | `protocol`, `gameServer`, `Hud` | G13, G17 | ☐ |
| **G12** | Blueprint / machine framework | new `machines.ts`, `roomgen.ts` | G13, G14, item catalogs | ☐ |
| **G5** | Allies & captives | `monsters.ts`, `gameServer` | G4, G12 | ☐ |
| **G11** | Item generation metering | `loot.ts` | **all** of G6–G10 | ☐ |

**G11 must be last.** It meters the lifetime supply of every item category over
26 depths — running it before the catalogs are final means doing it twice.

---

## Dependency graph

```
Phase 0.2 (serial contracts)
      │
      ├─► G1 bolt ──────┬─► G6 staffs/wands ─┐
      ├─► G2 status ────┼─► G9 potions/scrolls│
      │                 ├─► G4 monsters ──────┼─► G5 allies
      │                 ├─► G8 charms         │      ▲
      │                 └─► G17 UI ─► G16 verbs│      │
      ├─► G3 scent/AI ──► G18 stealth          │      │
      └─► G13 terrain ──┬─► G15 reactions      │      │
                        └─► G14 features ──────┴─► G12 machines
                                                        │
      G10 curses ─► G7 rings ─► G19 regen               │
      G20 endgame (independent)                         │
                                                        ▼
                                        G11 metering (after all catalogs)
```

Roots that can start the moment Phase 0.2 lands: **G1, G2, G3, G13** (+ **G10**
and **G20**, which have no dependencies at all and can fill idle slots).

## Hard rules for the agents

1. **Worktree isolation is mandatory** for any agent that writes files.
2. **Own your files; integrate through seams.** Never edit `gameServer.ts`,
   `protocol.ts`, `DungeonView3D.svelte`, or `Hud.svelte` outside your agreed
   seam — those merge serially.
3. **Every workstream lands with tests** beside the source and must pass
   `npm run test` + `npm run check` before integration.
4. **Determinism stays intact** — seeded `rng.ts` only, never `Date.now` /
   `Math.random` in generation or simulation.
5. **Restart the dev server** after any server-side change (`ws` doesn't HMR).
6. **Two known bugs are owed regression tests**, not just fixes: inert
   confusion gas (G2) and non-pathing monster AI (G3). See fidelity doc §2.

## Realistic parallelism ceiling

Four agents in Wave 3, five in Wave 4, four in Wave 5 — then Wave 6 is
essentially serial. Roughly **60% of the remaining work parallelizes**; the
authored-content and metering tail does not, because it is precisely the work
that touches everything else.
