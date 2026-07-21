# Delve

A co-op, grid-based **3D dungeon crawler** — a Brogue-style descent into a
procedurally generated underground, with torch-lit vision, fog of war, and
terrain that has real **height** (ledges/platforms) and **depth** (pits,
chasms, water you can fall into).

Several players join one **run** by code and explore the same dungeon together;
the dungeon materializes in 3D around their torches as they reveal it.

This is the **first vertical slice**: procedural generation + co-op movement +
lighting/vision + descent/hazards. No monsters, combat, or items yet.

## Stack

- **SvelteKit 2 + Svelte 5 (runes) + TypeScript + Tailwind 4 + Vite**
- **Three.js** for the 3D renderer (`src/lib/components/DungeonView3D.svelte`)
- Authoritative **WebSocket** server (`ws`), mounted on Vite's dev/preview HTTP
  server via `vite-ws-plugin.ts` → `src/lib/server/gameServer.ts`
- In-memory run state, deterministic from a **seed** (no database)

The core vision/line-of-sight/lighting math is **ported from the RealmQuest
VTT** (`../realm-quest-vtt`) — see the header comments in `src/lib/game/los.ts`,
`vision.ts`, `lighting.ts`, `grid.ts`, which name the original functions.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

- Open the app, enter a name, **Host a new run** → you get a join code.
- Open a second browser (or share the code) and **Join** with that code.
- **Move** WASD / arrows / HJKL (+ YUBN diagonals). **Use stairs** Space / E.
  **Look** drag, **Zoom** wheel.
- `/debug` renders a top-down preview of the generator for tuning.

```sh
npm run test       # vitest — LoS / vision / dungeon connectivity + determinism
npm run check      # svelte-check (types)
```

## How it fits together

| Concern | Where |
| --- | --- |
| Seeded RNG (deterministic dungeons) | `src/lib/game/rng.ts` |
| Grid math + 3D distance | `src/lib/game/grid.ts` |
| Terrain model (height/depth/blockers) | `src/lib/game/terrain.ts` |
| Elevation-aware line of sight | `src/lib/game/los.ts` |
| Vision falloff + fog memory | `src/lib/game/vision.ts` |
| Light sources + LoS-gated lit cells | `src/lib/game/lighting.ts` |
| Procedural dungeon generation | `src/lib/game/dungeon.ts` |
| Wire protocol | `src/lib/game/protocol.ts` |
| Authoritative server | `src/lib/server/gameServer.ts` |
| Reactive WS client | `src/lib/net.svelte.ts` |
| 3D renderer | `src/lib/components/DungeonView3D.svelte` |
| Lobby / play / debug routes | `src/routes/` |

Both server and client regenerate the dungeon from the seed, so only live
player state crosses the wire — never the map. The server validates all
movement, resolves pit falls (drop a level) and stairs (descend/ascend), and
broadcasts everyone's positions; each client computes fog/vision for rendering.

## Known limitations (slice scope)

- The `ws` server is wired for `npm run dev` / `npm run preview`. The
  standalone `adapter-node` build (`node build/index.js`) does **not** yet mount
  it — a custom prod entry is a follow-up.
- Fog of war is presentation-only client-side (fine for co-op PvE; not a
  hidden-information guarantee against a modified client).
- Deferred: monsters/AI, combat, items/inventory, permadeath, persistence,
  audio, a 2D fallback view.
