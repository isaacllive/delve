# Brogue features we could port to Delve

A shortlist of mechanics from **Brogue** (Brian Walker's coffee-break roguelike)
that map well onto Delve's current shape: a **co-op PvE**, seed-deterministic,
server-authoritative dungeon crawler where geometry regenerates on both sides
from `seed#depth` and only live state crosses the wire.

This is a **review/selection document**, not a plan. Each item notes rough
**effort** (S/M/L), **value**, and **where it would live** given our
architecture (pure logic in `src/lib/game/*`, authority in `gameServer.ts`, wire
in `protocol.ts`). Ordered roughly by value-to-effort within each group.

Constraints that shape every choice:

- **Determinism** — any generation must run off the seeded `rng.ts`, identically
  on client and server. No `Date.now` / `Math.random` in gen.
- **Server authority** — anything that changes state (combat, terrain changes,
  item effects, identification) resolves in `gameServer.ts`; the client only
  sends intents and renders broadcasts.
- **Co-op, not PvP** — no anti-cheat/hidden-info hardening needed, but features
  must make sense with *multiple* delvers on a shared floor.

---

## 1. High value, low-to-medium effort (best first ports)

### Stealth & monster awareness states — **M**
Brogue monsters cycle **sleeping → wandering → hunting**, with sneak attacks
(bonus damage) against the unaware. We already have aggro range (`AGGRO = 9`);
this extends it into a small state machine per monster.
- *Where:* `monsters.ts` (state field + transitions), `gameServer.ts` `tickRun`
  (drive transitions from proximity/line-of-sight), `protocol.ts`
  `MonsterState` gains a `state` for client tinting (💤 / ❓ / ‼️).
- *Co-op note:* awareness keys off the **nearest** delver, which we already do.

### Auto-explore / travel-to (click-to-path) — **M**
Brogue's `x`/travel pathfinds to the nearest unexplored cell or a clicked tile.
We already have a grid and BFS (`bfsDistances` in `dungeon.ts`).
- *Where:* pure pathfinder in `src/lib/game/pathfind.ts` (unit-testable);
  client sends a stream of `move` intents (server still validates each step).
- *Value:* big QoL win for the sprawling deeper floors.

### Explored-terrain memory (persistent fog) — **S–M**
Brogue dims-but-remembers seen terrain. We compute fog client-side already;
this is remembering the max-seen set per floor instead of only current LoS.
- *Where:* client-only (`DungeonView3D` / a `discovered` set keyed by floor).
  No protocol change — pure rendering memory.

### Terrain hazards: fire that spreads, gas that diffuses — **M**
Brogue's signature dynamism: grass/bog catches fire and propagates; gas clouds
(caustic, confusion) diffuse and dissipate. We already have `hazardAt` and a
`tickRun` heartbeat to drive cellular spread.
- *Where:* pure step function in `src/lib/game/hazards.ts` (deterministic CA on
  the seeded grid), applied in `tickRun`; broadcast affected cells as transient
  state. Start with **fire on existing water/pit/floor** before adding gases.
- *Co-op note:* friendly-fire-free by default (PvE) — fire damages monsters and
  optionally the careless.

### Potion/scroll identification game — **M**
Unidentified consumables (identify-by-use or by scroll). Adds the classic
risk/tension and pairs with our existing potion economy.
- *Where:* per-run identity table seeded from the run seed (deterministic, so
  all party members share the same appearances); resolution in `gameServer.ts`.
  Extends the shop + `use` intent we just have.

---

## 2. High value, larger effort

### Item system: wands / staffs / charms / rings — **L**
Brogue's depth comes from its item kit. We currently have gold + healing
potions only. A minimal port: a couple of **wands** (e.g. *slowness*,
*teleport-other*) and **charms** (health, protection) with cooldowns.
- *Where:* `src/lib/game/items.ts` (pure defs + effects), inventory on
  `PlayerState`, new `use-item` intent, resolution + targeting in `gameServer.ts`.
- *Co-op angle:* support items (haste an ally, shield the frontline) shine with
  a party.

### Capturable / allied monsters — **L**
Brogue lets you free caged captives who then fight for you. In co-op this is a
natural "party pet" that all players see.
- *Where:* monster gains an `ally: playerId?`/faction; `tickRun` targeting and
  combat already exist — allies just flip whom they attack. New `interact` case
  to free a caged monster (reuse the tile-interact path).

### Runic weapons/armor + enchant scrolls — **L**
Loot with enchantments and an enchant resource to pour into gear. Gives the
deeper floors a reward curve beyond gold.
- *Where:* extends the item system above; drops via existing `spawnLoot`.

### Vaults / guarded treasure rooms — **M–L**
Brogue's commutation/reward rooms: guaranteed loot behind a guardian puzzle or
a tough monster. Fits our deterministic gen.
- *Where:* `dungeon.ts` generation (seeded room tagging), guardian spawn in
  `ensureMonsters`, loot in `spawnLoot`.

---

## 3. Flavor / polish (cheap wins)

### Bolt line-of-fire + reflection — **M**
Ranged attacks (our Ranger's *Volley*, wands) travel as bolts along LoS and can
bounce. We already have `los.ts`.
- *Where:* pure bolt trace in `los.ts`/a helper; resolve hits server-side.

### Secret doors / searchable walls / levers — **S–M**
Hidden passages found by searching, and levers that open remote doors.
- *Where:* `dungeon.ts` tags secret cells (seeded); a `search` intent or
  passive reveal in `handleMove`; levers reuse the tile-interact path.

### Pressure plates & trap doors — **S**
Stepping triggers a trap (dart, net, pit → fall to next floor). We *already*
have pit-fall resolution in `handleMove` — traps are the same mechanic, hidden.
- *Where:* `terrain.ts` kind + `hazardAt`, resolved in `handleMove`.

### Descent pressure / out-of-depth monsters — **S**
Brogue never rewards grinding; occasional tougher-than-floor monsters create
tension. We control spawns in `ensureMonsters` — just widen the table by depth.
- *Where:* `monsters.ts` spawn weights.

### Richer death/telemetry messages ("killed by … on depth N") — **S**
Brogue's terse, evocative log. We have a shared `log` channel already.
- *Where:* `gameServer.ts` log lines.

---

## Deliberately skip (poor fit for Delve today)

- **Single-hero permadeath framing** — we're co-op; Brogue's solo-run identity
  doesn't map. (We keep *per-character* permadeath, which we already have.)
- **Amulet-of-Yendor ascension run** — we have a boss + exit-portal win; a
  return-trip win would be a redesign, not a port.
- **Turn-based lockstep timing** — Delve runs a real-time server tick; Brogue's
  energy/turn scheduler would fight our model. Port *behaviors*, not its clock.

---

### Suggested first slice (if/when we implement)
1. **Monster awareness states** (visible, self-contained, great feel).
2. **Explored-terrain memory** (pure client, no protocol change).
3. **Traps/pressure plates** (reuses existing pit-fall path).

These three touch different subsystems, so they can be built in parallel per the
repo's "parallelize independent work" guideline.
