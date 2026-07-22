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

### Wave 1 (parallel subagents) — LANDED
Four worktree-isolated agents built pure modules against the Phase-0 contract;
all merged to this branch (382 tests, 0 type errors). See
`docs/parallelization.md`.
- [x] **Terrain simulation** — `hazards.ts` (deterministic fire-spread + gas
      diffusion CA) + `grass`/`flammable` in `terrain.ts`. 13 tests.
- [x] **Room-accretion generator** — `roomgen.ts` (Brogue-style accrete + loops,
      room/door metadata for future machines). 12 tests.
- [x] **Monster catalog** — `monsters.ts` expanded: per-kind speeds
      (`actionTicks`, now read by the scheduler), ability flags, hordes,
      out-of-depth, mutations. 19 tests.
- [x] **Gear + enchant** — `gear.ts` (weapons/armor catalog, instance model,
      enchant economy, combat derivations) + `scroll of enchanting` +
      `spawnGear`. 20 tests.

### Wave 2 (serial integration) — LANDED
Wired the Wave-1 modules through the Phase-0 seams (intent registry + world
systems). 382 tests, 0 type errors throughout.
- [x] **Gear**: `PlayerState` carries gear + equipped weapon/armor; start with a
      dagger + leather; `spawnGear` drops per floor (broadcast as `gear` loot,
      picked up); combat routes through `gear.ts` (accuracy/defense/damage/dagger
      sneak ×5); Scroll of Enchanting enchants equipped gear, Identify reveals
      gear enchant; `equip` intent; HUD gear list; 3D floor-gear markers.
- [x] **Terrain**: grass fuel placed in gen; `stepHazards` world system spreads
      fire/gas each turn and burns actors; fire/gas broadcast + rendered (flame
      cones / gas clouds); `throw` intent hurls incineration/caustic potions
      (facing-based) as the ignition source (Shift+# to throw).
- [x] **Monster abilities**: resolved splitsOnHit, explodesOnDeath, corrodesWeapon,
      ranged, immobile, flees, flies, stealsAndFlees in `actMonster`/combat, then
      **aquatic** (water-confined + hidden ambush), **summons** (cooldown thralls),
      **poisons** (per-turn HP drain world system) + **client ability tint** (glyph)
      and aquatic concealment. All 11 flags now resolved.
- [x] **Room gen**: `generateRoomLevel` now carves Ruins + Ancient City;
      other biomes stay caves; shared decoration layers on either.

### Refocus progress
- [x] **Turn/energy scheduler** — pure `src/lib/game/energy.ts` (100/50/200-tick
      turns, per-actor speeds, `nextToAct`/`runUntilPlayer`) + tests. *(Not yet
      wired into `gameServer.ts` — that swaps the real-time `tickRun` heartbeat
      for a turn loop; next integration step.)*
- [x] **Brogue combat math** — pure `src/lib/game/combat.ts` (hit =
      `accuracy×0.987^defense`, `1.065^netEnchant` accuracy/damage, strength
      modifier +0.25/−2.5, sneak ×3 / dagger ×5, `randClump` damage) + tests.
      Numbers ported verbatim from BrogueCE.
- [x] **Wire turn loop into `gameServer.ts`** — the wall-clock heartbeat is gone;
      the game is turn-based. A player action (move / attack / use-item / **wait**)
      costs ticks; `takeMonsterTurns` runs the floor's monsters via
      `runUntilPlayer` (per-monster energy on `Monster.ticksUntilTurn`, so future
      fast/slow kinds get more/fewer turns); passive HP **regeneration** over 300
      turns. Combat now routes through `combat.ts`: player & monster **accuracy
      rolls vs defense**, clumped enchant/strength-scaled **damage rolls**, sneak
      ×3. Monsters gained `accuracy`/`defense` stats (hand-set ramp; faithful
      per-kind catalog is a later port). Rest with `z` / `.`.
  - [ ] **Per-kind monster speeds** (jackal 50, ogre attack 200) — the scheduler
        already supports it; needs values from the monster catalog.
  - [ ] **Player armor → defense** (monsters currently hit at raw accuracy) and
        **weapons → accuracy/damage/enchant** (unarmed is netEnchant 0 today).
- [x] **Strength stat + HP/STR-from-items only** — pure `character.ts` (Brogue
      baselines STR 12 / HP 30; `potionOfStrength` +1, `potionOfLife` +10 max HP
      & full heal; `healBy` cap) + tests. `strength` added to `PlayerState`,
      initialized to 12 for every delver, shown in the HUD. *(The Potion of
      Life/Strength pickups that TRIGGER the growth arrive with the item system;
      starting HP is still class-driven — see the classless note below.)*
  - [x] **Retire classes → classless Adventurer** (Brogue is classless). One
        Adventurer (HP 30, STR 12); lobby class picker removed; `classId`
        plumbing kept inert. *(A future pass can delete the field entirely.)*
- [x] **Live playtest** — ran the app (dev server + Playwright): lobby → camp
      → dungeon, ws connectivity, turn-based movement, gear equipped, HUD, and
      3D render all verified with no runtime errors.
- [x] **Item system spine** (`items.ts`): pure catalog + per-run identification
      (potions disguised as colours, scrolls as gibberish titles, shuffled from
      the seed) + `displayName`. Inventory on `PlayerState`, `use-item` intent,
      floor loot drops real (hidden) kinds, mystery-potion shop, shared
      `discovered` set with use-ID + Scroll of Identify. Starter kinds whose
      effects fit the engine: potions of **life / strength / descent**, scrolls
      of **identify / teleportation / aggravate-monsters**. HUD inventory (press
      1–9 or click to use). *(Deferred: Detect-Magic polarity sigil; enchant on
      gear + Scroll of Enchanting effect — needs weapons/armor; metered item
      generation; thrown potions — need the gas/fire sim.)*
  - [ ] **Enchant on gear + Scroll of Enchanting** (needs weapons/armor items).
  - [ ] **Detect Magic** polarity + metered generation; thrown/gas potions.
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
