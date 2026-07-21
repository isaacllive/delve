# Delve — task tracker

Living checklist of changes. Newest intent at top; tick items as they land.

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

## Deferred / backlog

- Wire class **abilities** (Cleave, Volley, Arcane Bolt, …) into combat.
- Gear / inventory beyond gold + potions.
- Persistence / accounts (SQLite) for cross-run banking.
- Production `ws` wiring for the `adapter-node` build.
- Audio.
