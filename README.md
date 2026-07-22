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

Requires **Node 20.19+ or 22.12+** (the Vite 8 / rolldown toolchain uses
`node:util`'s `styleText`, added in Node 20.12/22.0 — older Node crashes on
startup). `.nvmrc` pins 22; run `nvm use` if you use nvm. `engine-strict` is
on, so `npm install` fails fast with a clear message on an unsupported Node.

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

### Share it (public URL)

```sh
npm run dev:tunnel   # build + preview + a Cloudflare quick tunnel
```

Prints an `https://<name>.trycloudflare.com` URL that forwards HTTP **and** the
`/ws` game socket to your local preview server — hand it to someone off-network
to playtest multiplayer. No Cloudflare account needed; the tunnel is ephemeral
(a new URL each run) and closes on Ctrl-C. Requires the `cloudflared` binary at
`./bin/cloudflared` (gitignored) — `scripts/dev-tunnel.sh` prints the one-line
`curl` to fetch it if it's missing.

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
