# Dividing the Brogue-recreation work across subagents

How to split the remaining work (see [`brogue-fidelity.md`](./brogue-fidelity.md)
roadmap) into **parallel subagent workstreams** without the agents stepping on
each other. Written against the current codebase after the turn-loop rewrite.

## The governing principle

Delve's architecture already dictates the answer:

> **Pure logic in `src/lib/game/*.ts` parallelizes. The authoritative
> `gameServer.ts` and the wire contract `protocol.ts` serialize.**

Pure modules are deterministic, independently unit-tested, and own a single
domain — several agents can work them at once in isolated worktrees. But every
feature eventually needs an *intent* (client→server message), an *effect*
(server mutation), and often a *render* — and those funnel through three shared
files. That funnel is the real constraint on parallelism.

## Contention map (who wants to touch what)

| File | Heat | Why it's contended |
|---|---|---|
| `src/lib/server/gameServer.ts` | 🔴 hottest | every feature adds an intent handler, a combat/effect branch, and/or a per-turn hook |
| `src/lib/game/protocol.ts` | 🟠 hot (additive) | every feature adds wire types — but additions rarely *conflict* |
| `src/lib/game/items.ts` | 🟠 hot | gear, thrown potions, new consumables all extend the catalog + `ItemKind` shape |
| `src/lib/components/DungeonView3D.svelte` | 🟠 hot | fire/gas FX, monster looks, machine/altar props |
| `src/lib/game/monsters.ts` | 🟢 isolated | one domain (the monster catalog + AI data) |
| `src/lib/game/dungeon.ts` / new gen module | 🟢 isolated | generation |
| new `src/lib/game/hazards.ts` | 🟢 isolated | terrain simulation (does not exist yet) |
| `src/lib/game/character.ts` | 🟢 isolated | vitals + (future) hunger |
| `src/lib/game/classes.ts` | 🟢 isolated | the classless refactor |

## Remaining workstreams

Each row lists the files an agent can **own** (edit freely, low conflict) vs the
shared files it must **integrate** through (coordinate / serialize), plus
cross-workstream dependencies.

| # | Workstream | Owns | Integrates through | Depends on |
|---|---|---|---|---|
| **C** | Monster catalog — faithful stats, per-kind **speeds**, abilities (split/steal/corrode/ranged/summon), hordes, out-of-depth, mutations | `monsters.ts` (+test) | `gameServer` (ability resolution in `actMonster`), `protocol` (ability flags for client tint) | — |
| **B** | Terrain simulation — fire spread + gas diffusion as a deterministic CA | **new** `hazards.ts` (+test), `terrain.ts` (grass/flammable kind) | `gameServer` (per-turn step), `protocol` (transient cell FX), renderer | — |
| **G** | Room-accretion generator + machines (vaults, guardian puzzles, altars, captives) | **new** gen module (+test) | `dungeon.ts`, `biomes.ts`, `interactions.ts`, `gameServer` (lever/altar interact) | machines want **A** |
| **A** | Weapons & armor — equip slots, enchant on gear, Scroll of Enchanting effect | `items.ts` (gear categories), `loot.ts` (gear drops) | `gameServer` (equip intent + combat reads gear), `protocol` (equipment), `Hud`, `HubScreen` (Smith) | `combat.ts` ✅ ready |
| **F** | More consumables — Detect Magic polarity, magic mapping, telepathy, thrown potions | `items.ts` (effects) | `gameServer`, `protocol` (statuses), renderer | **A** (item shape), **B** (gas for thrown) |
| **E** | 26 depths + amulet / ascension victory lap | `dungeon.ts` | `gameServer`, `interactions.ts`, `protocol` | **G** (bottom machine) |
| **H** | Nutrition / food clock (the descent pressure) | `character.ts` | `gameServer` (per-turn drain), `protocol`, `Hud` | — |
| **I** | Retire classes → classless STR 12 / HP 30 | `classes.ts` | lobby route, join flow, `Hud`, `HubScreen` | — |

## Dependency graph

```
combat.ts ✅ ─┐
              ├─► A (gear) ─► F (thrown/detect)
energy.ts ✅ ─┘        │
                       └─► G (machines place gear/altars) ─► E (amulet floor)
C (monsters) ── independent (abilities using terrain want B)
B (terrain) ── independent
H (nutrition) ── independent
I (classless) ── independent
```

Roots with **no dependencies** (can start immediately): **A, B, C, H, I**.
Dependent: **F** (after A+B), **E** (after G), machines in **G** (after A).

## The wave plan

**Phase 0 — contracts first (one serial pass; do this before fanning out).**
Convert the 🔴 hotspot into a cool one *once*, so downstream agents add code
instead of editing a shared 900-line file:
- Add every planned `protocol.ts` type up front (equipment, statuses,
  terrain-FX cells, hunger, ability flags). Additive, so this rarely conflicts
  later.
- Give `gameServer.ts` two extension seams:
  1. an **intent registry** (`Map<ClientMsg['t'], handler>`) replacing the giant
     `switch`, and
  2. a **per-turn world-systems list** that `endPlayerTurn` iterates (monster
     turns, terrain step, hunger drain, regen — each a registered function).
  With these, a feature is a new module that *registers* a handler and/or a
  world-system, not a diff against the switch.

**Wave 1 — 4 parallel agents, `isolation: "worktree"`, file-disjoint pure
modules.** These barely overlap, each ships its own `*.test.ts`, each is
independently verifiable:
- **C** → `monsters.ts`
- **B** → new `hazards.ts` + `terrain.ts`
- **G** → new room-accretion generator module
- **A** → `items.ts` (gear) + `loot.ts`

**Wave 2 — serialized integration + dependents.** Wire the Wave-1 modules into
`gameServer`/`protocol`/renderer through the Phase-0 seams, **one at a time**
(the server and renderer can't take concurrent edits cleanly). Then the
dependent features in dependency order: **F** (needs A+B), **G**'s machines
(need A), **E** (needs G), and the independent **H** / **I** wherever they fit.

## Hard rules for the agents

1. **Worktree isolation is mandatory** for any agent that writes files — Wave-1
   agents run concurrently and would otherwise clobber each other's working
   tree and git index.
2. **Own your files; integrate through seams.** An agent edits its owned pure
   module freely but must not edit `gameServer.ts` / `protocol.ts` /
   `DungeonView3D.svelte` outside the agreed seam — those are merged serially.
3. **Every workstream lands with tests** next to the source (repo rule) and
   must pass `npm run test` + `npm run check` before integration.
4. **Determinism stays intact** — all generation/effects run off seeded
   `rng.ts`, never `Date.now`/`Math.random` (except the live combat RNG, which
   is server-only and already isolated on the run).
5. **The wire contract changes in one place** (`protocol.ts`), ideally all in
   Phase 0, so client and server never drift.

## Why not just launch 8 agents at once

Because five of the eight need `gameServer.ts` and three need
`DungeonView3D.svelte`. Concurrent edits to those two files produce merge
conflicts that cost more than the parallelism saves. The wave plan front-loads
the shared-contract work (Phase 0), parallelizes only the genuinely-isolated
pure modules (Wave 1), and serializes the unavoidable integration (Wave 2) —
which is the most parallelism this architecture actually supports.
