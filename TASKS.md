# Delve — task tracker

Living checklist of changes. Newest intent at top; tick items as they land.

## 🎯 PROJECT REFOCUS — faithful Brogue recreation

Delve is being refocused into a **faithful recreation of Brogue** (Brian
Walker's coffee-break roguelike), keeping the **voxel 3D visuals** as the
"updated look". Two governing decisions are locked in:

- **Turn-based, solo-first.** We are moving off the real-time co-op wall-clock
  tick to a **turn/energy scheduler** (Brogue timing: 100-tick turns, haste 50,
  slow 200). Real-time co-op is **shelved as a future extension** — the base
  game comes first.
- **Faithful Brogue scale & numbers.** 26 depths, a **Strength** stat, and
  item/monster/combat tables ported from BrogueCE (`GlobalsBrogue.c`,
  `PowerTables.c`, `Combat.c`). Power comes from **items + positioning, never
  XP**. The 100-floor / 5-biome expansion is retired for now (a possible
  post-recreation extension).

Analysis + roadmap: **`docs/brogue-fidelity.md`** (pillar scorecard, phased
plan) and `docs/brogue-features.md` (mechanic selection). Roadmap phases:

1. **Character model & item spine** — Strength; item/identify/enchant system;
   Brogue combat math. ← *in progress*
2. **Living dungeon** — terrain simulation (fire/gas), monster geometry +
   hordes + OOD + mutations, scent/stealth.
3. **Authored texture** — vault pockets + altars, nutrition clock, ascension
   victory lap (amulet → climb out).
4. **(Stretch)** room-accretion generator + blueprint machines.

### Refocus progress
- [x] **Turn/energy scheduler** — pure `src/lib/game/energy.ts` (100/50/200-tick
      turns, per-actor speeds, `nextToAct`/`runUntilPlayer`) + tests. *(Not yet
      wired into `gameServer.ts` — that swaps the real-time `tickRun` heartbeat
      for a turn loop; next integration step.)*
- [x] **Brogue combat math** — pure `src/lib/game/combat.ts` (hit =
      `accuracy×0.987^defense`, `1.065^netEnchant` accuracy/damage, strength
      modifier +0.25/−2.5, sneak ×3 / dagger ×5, `randClump` damage) + tests.
      Numbers ported verbatim from BrogueCE.
- [ ] **Wire turn loop into `gameServer.ts`** — player action advances the
      clock; monsters act via `runUntilPlayer`; retire the wall-clock interval.
- [x] **Strength stat + HP/STR-from-items only** — pure `character.ts` (Brogue
      baselines STR 12 / HP 30; `potionOfStrength` +1, `potionOfLife` +10 max HP
      & full heal; `healBy` cap) + tests. `strength` added to `PlayerState`,
      initialized to 12 for every delver, shown in the HUD. *(The Potion of
      Life/Strength pickups that TRIGGER the growth arrive with the item system;
      starting HP is still class-driven — see the classless note below.)*
  - [ ] **Retire classes → classless STR 12 / HP 30 for all** (Brogue is
        classless; classes become a possible future extension). Touches lobby /
        join flow / HUD — deferred, out of scope for the stat change.
- [ ] **Item system** (`items.ts`): inventory, `use-item` intent, first
      potions/scrolls; per-run identification table; enchant on gear.
- [ ] **26-depth structure + amulet win** replacing the 100-floor boss/portal.

*(The items below predate the refocus and are largely on hold; several — stealth
states, persistent fog, traps, permadeath, no-XP — already align with Brogue and
carry forward.)*

---

## In progress (this session)

- [ ] **Debug view: terrain always visible (lighting-only).** Don't hide
      terrain outside vision range — render all terrain, apply lighting/vision
      as brightness only, so the terrain is easy to appreciate while debugging.
      Keep behind a `DEBUG_*` flag so fog-of-war can be switched back on.
- [ ] **Level progression groundwork — 100 floors.**
  - [ ] Per-level deterministic seeding so any floor generates independently
        (`makeRng(seed#depth)`), enabling lazy generation.
  - [ ] Lazy level generation + cache (don't build 100 floors up front).
  - [ ] `levelCount = 100`.
  - [ ] Final floor (100) carries a **boss** + a sealed **exit portal**.
  - [ ] Reach the bottom → defeat the boss → portal opens → interact to
        **teleport out** = win. (Boss "defeat" is a placeholder interaction
        until the combat system exists.)
- [ ] **Biomes.** 100 floors split into 5 biomes (20 floors each):
      **Caves → Ruins → Lava Zone → Ancient City → Corrupted Halls**. Each has
      multiple **sub-biomes** that vary generation (cave density, hazard mix,
      light fixtures, palette), chosen deterministically per floor.
- [ ] **Maps grow larger with depth** — floor size scales up the deeper a PC
      descends (capped).

## Next groundwork (queued, not yet started)

- [x] **Voxel caves (Minecraft-style look).** Renderer rebuilt as a solid rock
      VOLUME with carved air: per cell a ground rock mass (floor→surface, walls
      full-column) + a roof rock mass (ceiling→top), unit blocks with baked
      per-face shading (bright tops, dark sides) × per-cell biome/lighting
      colour. Ceiling quantized to integer voxel steps. Grid gameplay unchanged.
  - [ ] Future: TRUE 3D voxel *gameplay* — a real cols×rows×height volume with
        overhangs, vertical shafts, and 3D movement — is a much larger rewrite
        (movement/vision/AI are all 2D-grid today). Also: greedy meshing +
        per-cell floor-height noise for even blockier terrain.

- [x] **Combat.** Monsters per floor (biome-tiered, deterministic spawn), a
      server AI tick loop that chases + bites, and bump-to-attack using class
      damage. The bottom-floor boss is a real fight now (`monsters.ts`).
- [x] **Permadeath as the norm.** HP hits 0 → the character falls (no respawn),
      "YOU DIED" overlay → back to lobby. Surviving = retreating to camp.
- [x] **Expedition loop + base camp.** Start in a safe base camp (depth -1) with
      a descent portal + (placeholder) shops; descend on an expedition; floor 0's
      up-stair (and the boss exit) retreat you to camp. Shops/economy + banking
      persistence still to come.
- [x] **Character creation.** Lobby class-picker + "Surprise me" randomize;
      choice flows through the join URL → server applies the class's stats.
- [x] **Class system.** Four classes (Warden/Ranger/Delver/Mystic) split across
      combat / exploration / hybrid, each with HP, vision radius, and two
      signature abilities (data now; wire into combat when it lands). Shown in
      the lobby + in-game HUD (`src/lib/game/classes.ts`).

## Standing preferences

- [x] Always restart the dev server when a change requires it to be visible
      (the `ws` server doesn't HMR). Recorded in agent memory.

## Done

- [x] Fresh SvelteKit + Three.js + ws project scaffold.
- [x] Ported vision / line-of-sight / lighting math from RealmQuest.
- [x] Procedural **cave** generation (cellular automata), big maps, height
      (ledges) + depth (pits/water) + stairs + light fixtures.
- [x] Authoritative multiplayer server (join codes, movement, per-player fog).
- [x] 3D renderer: extruded terrain, torch lighting, fog reveal.
- [x] Descent (stairs up/down) + pit falls.
- [x] Facing + camera-relative compass; camera follows the player.
- [x] Enclosed cave: uneven generated ceiling (in unison with floor) + oculus.
- [x] Smooth terrain/vision fade (continuous falloff + temporal fade-in).

## Done (cont.)

- [x] **Items + economy.** Floor loot (gold + potions, deterministic per floor),
      monster gold drops, the camp Provisioner sells potions, quaff to heal (Q).
      Gold/potions are carried and lost on death (`loot.ts`). Still to do:
      cross-run banking/persistence, gear/inventory, the Smith's stock.

- [x] **Voxel cave generator** (`src/lib/voxel/`) — a standalone, chunk-based,
      world-space-deterministic voxel cave engine (data only, no rendering
      coupling): seeded hashing + coords + typed-array chunks + Perlin/fBm/warp
      noise; validated config; base terrain; density "spaghetti" caves;
      region-origin winding tunnels with bounded branching + capsule carving;
      noise-distorted ellipsoid caverns; bounded post-processing; pipeline;
      debug slices; example. **23 tests** cover determinism, chunk-order
      independence, border seamlessness, negative coords, protected blocks,
      bounded branching. Groundwork for a future true-3D voxel Delve.
  - [ ] Remaining (extension points wired): surface openings, full depth/biome
        profiles, regional connectivity flood-fill, materials/ores/fluids,
        coarse density interpolation, bounded async generation. See
        `src/lib/voxel/README.md`.

## Deferred / backlog

- Wire class **abilities** (Cleave, Volley, Arcane Bolt, …) into combat.
- Gear / inventory beyond gold + potions.
- Persistence / accounts (SQLite) for cross-run banking.
- Production `ws` wiring for the `adapter-node` build.
- Audio.
