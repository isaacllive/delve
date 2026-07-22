# Faithfully recreating Brogue in Delve — a fidelity analysis

Companion to [`brogue-features.md`](./brogue-features.md). That doc is a
*shopping list* of portable mechanics; this one asks the harder question the
project name implies: **how faithful a Brogue can Delve actually become, and
what would it cost?**

It scores each of Brogue's design pillars against Delve's *current* code, rates
achievable fidelity, and lays out a phased path — grounded in the real files
(`src/lib/game/*`, `gameServer.ts`, `protocol.ts`).

Source for the Brogue side: BrogueCE (`tmewett/BrogueCE`) `Rogue.h` /
`GlobalsBrogue.c`, the Brogue wikis, and anderoonies' generation write-ups.
Key confirmed constants are cited inline.

---

## 0. The one decision that governs everything: the clock

Brogue is **strictly turn-based on an energy budget**. A normal turn is
**100 ticks**; haste = 50, slow = 200; every actor has independent move/attack
delays (fast jackal moves every 50, an ogre's hit costs 200). *All* of Brogue's
tactics — hit-and-run, kiting, "the ogre gets one swing then I retreat", speed
potions — fall out of this decoupled timing.

Delve is **real-time and co-op**: a global heartbeat (`tickRun` in
`gameServer.ts`) advances every monster on a wall-clock interval, independent of
what players do. Two delvers act simultaneously. There is no per-actor energy.

These two models are **mutually exclusive**, and the choice is upstream of every
other system:

| | **Path A — Turn-based (true Brogue)** | **Path B — Real-time co-op (Delve today)** |
|---|---|---|
| Fidelity ceiling | ~95% — the real thing | ~70% — a "Brogue-like", not Brogue |
| Multiplayer | Needs a lockstep/initiative scheme for N players (hard, and a genre unto itself) | Native — already works |
| Timing tactics | Full (haste/slow, monster speeds, hit-and-run) | Approximated (speed = tick-rate multipliers) |
| Effort | **XL** — new scheduler, every system reworked around energy | Reuse the existing tick |
| Risk | Fights the co-op identity Delve has already committed to | None — it's the status quo |

**Recommendation: commit to Path B and be honest about it.** A "faithful
recreation" here should mean *faithful to Brogue's design pillars* — no XP,
item-identification, terrain simulation, hand-authored machines, resource
scarcity — **not** a literal port of its turn scheduler. Every section below is
written for Path B. If the goal is genuinely a solo turn-based Brogue, that is a
different (and much larger) project than extending this app, and should be
scoped as such before anything else is built.

Everything downstream assumes Path B.

---

## 1. Fidelity scorecard

Rated against Brogue's eight pillars (see `research` summary / Brogue wiki).
**Fidelity** = how close Delve is *today*. **Ceiling** = realistic best under
Path B.

| # | Brogue pillar | Delve today | Fidelity | Ceiling (Path B) | Gap size |
|---|---|---|---|---|---|
| 1 | **No XP / power from items only** | ✅ No XP already; gold is cosmetic-ish, HP fixed by class | 🟡 40% | 🟢 95% | **M** |
| 2 | **Item-identification game** | ❌ One known healing potion | 🔴 5% | 🟢 90% | **L** |
| 3 | **Hand-tuned small item kit** (potions/scrolls/staffs/wands/charms/rings) | ❌ Gold + potion only | 🔴 5% | 🟢 85% | **XL** |
| 4 | **Enchant economy = progression** | ❌ None | 🔴 0% | 🟢 90% | **L** |
| 5 | **Emergent terrain sim** (fire⇄gas⇄water⇄fungus⇄lava) | 🟡 Static water/pit/lava-as-palette; no propagation | 🟡 20% | 🟢 85% | **L** |
| 6 | **Information as gameplay** (detect-magic polarity, telepathy, clairvoyance, scent/stealth) | 🟡 Stealth states ✅; persistent fog ✅; no magic-sight/scent | 🟡 35% | 🟢 85% | **M** |
| 7 | **Machines** (reward vaults, guardian puzzles, captives, altars) | ❌ CA caves only — no rooms/doors/keys | 🔴 10% | 🟡 70% | **XL** |
| 8 | **Tactical positioning, no grinding** (monster geometry, hordes, OOD, mutations) | 🟡 5 tiers HP/dmg + stealth AI; no geometry/hordes/mutations | 🟡 30% | 🟢 80% | **L** |
| — | **Amulet + ascension run** | 🟡 Boss + exit-portal win (a substitute) | 🟡 50% | 🟡 60% | **M** |

**Headline:** Delve has faithfully captured the *cheap, high-feel* pillars
already — **no-XP, stealth states, persistent fog, traps, permadeath, descent
pressure, deterministic seeds**. What remains is the **expensive core that makes
Brogue deep**: the item/identification/enchant triad (3+2+4), the live terrain
simulation (5), and hand-authored machines (7). Those three clusters are ~80% of
the remaining work and ~90% of the "why Brogue is Brogue".

---

## 2. Pillar-by-pillar: gap and what "faithful" requires

### Pillar 1 — No stat treadmill (🟡→🟢, effort M)
*Brogue:* only **Health** and **Strength**, both raised solely by consumables
(Potion of Life, Potion of Strength). Gear + positioning is all your power.

*Delve:* already no XP — good. But there's no **Strength** stat, gear doesn't
exist, and the only "growth" is buying healing potions with gold. Gold is a
soft XP-substitute, which is *slightly* off-pillar.

*To be faithful:*
- Add a **Strength** stat to `PlayerState` (start ~12, matching Brogue), gated
  by consumables not levels.
- Introduce **Potion of Life** (+max HP, full heal) and **Potion of Strength**
  (+1 STR) as the *only* permanent character growth.
- Reframe gold: in Brogue there's no shop economy at all. Delve's camp shops are
  a co-op-friendly divergence — keep them, but make gear/enchants the real
  progression so gold stops being pseudo-XP.

### Pillar 2 — Identification game (🔴→🟢, effort L)
*Brogue:* consumables have **randomized appearances per seed**; Detect Magic
shows a **good(blue)/bad(red) polarity**; use-ID, throw-to-ID, cursed items.

*To be faithful:*
- A **per-run identity table** seeded from the run seed (so every co-op member
  sees the same "fizzy red potion" → whatever). Deterministic; lives in a pure
  `src/lib/game/identify.ts`.
- `PlayerState` (or run state) tracks **discovered** identities; identification
  is shared party knowledge (co-op divergence, and a good one).
- Resolve quaff/read/throw effects + reveal in `gameServer.ts`. Detect-Magic
  polarity as an item.
- *Co-op note:* one player IDs "potion of caustic gas" the hard way → the whole
  party now knows. Fun, and natural for the shared-run model.

### Pillar 3 — The item kit (🔴→🟢, effort XL — the big one)
*Brogue:* ~16 potions, ~14 scrolls, ~11 staffs, ~8 wands, charms, rings,
weapons, armor — **each hand-balanced, zero filler**.

*To be faithful (phased — do NOT try to ship all at once):*
- Pure `src/lib/game/items.ts`: item defs + effect functions, no IO.
- Inventory on `PlayerState`; a `use-item` intent + targeting in the protocol.
- **Order of introduction by value/effort:**
  1. Potions (reuse the `use` path) — heal, life, strength, caustic-gas (thrown),
     descent, telepathy.
  2. Scrolls — **enchanting** (see Pillar 4), identify, teleport, magic-mapping.
  3. Staffs (charged, recharge over time) — lightning/firebolt use the
     bolt-trace (`los.ts`); needs Pillar 5 for fire.
  4. Wands (fixed charges) — slowness, teleport-other, domination (→ Pillar 8
     allies).
  5. Charms (cooldown self-buffs), then weapons/armor with **strength reqs**.
- **Copy Brogue's numbers**, don't re-invent them — pull `potionTable`,
  `scrollTable`, weapon/armor damage & STR reqs straight from
  `GlobalsBrogue.c`. This is the single highest-leverage fidelity move: the kit
  *is* the balance.

### Pillar 4 — Enchant economy (🔴→🟢, effort L, depends on 3)
*Brogue:* **Scroll of Enchanting** is the only progression currency; supply is
**metered** (a roughly fixed number over 26 levels); each enchant raises power
**and lowers strength requirement by 1**. Investment decisions are the meta-game.

*To be faithful:*
- Weapons/armor/staffs/rings carry an **enchant level**; combat math reads it.
- Enchant scrolls drop on a **metered schedule** keyed to depth (extend
  `spawnLoot`), not pure random — this preserves "no grinding for more".
- Combat formulas from Brogue: accuracy `×1.065` per weapon enchant; strength
  `+0.25 enchant`/point over req, `−2.5`/point under; displayed armor = internal
  ÷10, `~5.2 armor halves` enemy hit chance. Delve's combat is currently
  **fixed-damage with no accuracy or armor roll** — this pillar is what turns it
  into real Brogue combat.

### Pillar 5 — Emergent terrain (🟡→🟢, effort L)
*Brogue:* gases diffuse & dissipate; fire ignites grass/bog/bridges/webs and
spreads, makes steam over water, burns dropped items; lava; deep water sweeps
your pack; chasms as deliberate fast-descent.

*Delve:* has the *substrate* — `hazardAt`, water/pit cells, the `tickRun`
heartbeat perfect for cellular propagation — but nothing propagates; lava is
just a palette colour.

*To be faithful:*
- Pure deterministic step function `src/lib/game/hazards.ts` (CA on the seeded
  grid), driven each `tickRun`; broadcast changed cells as transient state.
- Ship in order: **fire spread** (needs a flammable terrain kind — grass) →
  **gas clouds** (caustic/confusion, pairs with thrown potions from Pillar 3) →
  **deep-water item drift** → **real lava damage**.
- *Co-op note:* PvE means friendly-fire-optional; fire/gas hitting monsters is
  the point. This is the pillar that generates the most memorable moments per
  unit of code — high priority after items exist to interact with it.

### Pillar 6 — Information as gameplay (🟡→🟢, effort M)
*Delve:* already has **stealth states** (sleeping/wandering/hunting, sneak ×2 —
`monsters.ts`) and **persistent fog** ✅. Missing: **scent trails**, magic-sight
channels (telepathy/clairvoyance/magic-map), and Detect-Magic polarity (→
Pillar 2).

*To be faithful:*
- **Scent:** hunting monsters follow a decaying scent field the player emits
  (Brogue: 3%/turn to lose the track when out of stealth range). A scalar grid
  updated in `tickRun`.
- **Stealth radius** modulated by movement/light/armor weight (heavier armor
  from Pillar 3 = louder), shrunk by standing still.
- Telepathy/clairvoyance/magic-map arrive naturally as items (Pillar 3); the
  client already separates "seen" from "remembered", so a "known via magic"
  channel is a small rendering add.

### Pillar 7 — Machines (🔴→🟡, effort XL, capped ceiling)
*Brogue:* the signature — **room-accretion** generation with **blueprint
machines** stitched in: reward vaults, **guardian puzzles** (mirror-movement
statues, pressure plates, keys/portcullises), captive/ally rooms, commutation &
other **altars**, flavor set-pieces, each with a **difficulty budget**.

*Delve:* generates **cellular-automata caves only** — no rooms, doors, keys,
levers, or authored set-pieces. This is the **deepest architectural gap** and
the reason the ceiling is 🟡 70%, not 🟢: Brogue machines assume *rooms with
door slots*, and Delve's caves have neither.

*To be faithful — two sub-paths:*
- **Cheaper (fits caves):** carve **guaranteed pockets** into the CA cave — a
  reserved sub-region tagged as a "vault", sealed by a lever/portcullis or a
  guardian monster, containing metered loot. Reuses `interact` for
  levers/altars; `ensureMonsters` for guardians. Gets ~50% of the *feel* at
  **M–L** effort. **Recommended first.**
- **Faithful (big rewrite):** add a **room-accretion generator** alongside the
  cave one (Brogue's actual algorithm: seed room → accrete shaped rooms at door
  slots → add loops until ~30 or 500 tries), then port the blueprint/machine
  system on top. Rooms become a *biome* (fits the existing biome bands —
  "Ruins"/"Ancient City" *should* be architectural, not caves). **XL**, but it's
  the only route to real guardian puzzles and the thing that makes levels feel
  *authored*.
- Altars (commutation especially) are high-value and mostly depend on the item
  system (Pillar 3/4), less on room gen — can land earlier.

### Pillar 8 — Monsters: geometry, hordes, OOD, mutations (🟡→🟢, effort L)
*Brogue:* monsters are defined by **behavior geometry** (pink jelly splits, eel
lurks in deep water, monkey steals & flees, acid mound corrodes weapons, turrets
are immobile ranged, casters summon), spawn as **hordes** (leader + companions,
~6 asleep per level), roll **mutations from depth 11**, and appear **out-of-depth**
as rare danger spikes.

*Delve:* 5 tiers of pure **HP + damage** with shared stealth AI and one boss.
Faithful in *stealth*, thin in *variety*.

*To be faithful:*
- Give monsters **ability flags** (split-on-hit, ranged/turret, steal-and-flee,
  corrode, summon, aquatic) resolved in `tickRun`/combat — this is where tactical
  depth lives, and it composes with terrain (Pillar 5) and items.
- **Horde spawning**: replace flat per-floor counts with leader+companion tables
  (extend `spawnMonsters`).
- **Out-of-depth** spawns: small chance to draw from a deeper tier (widen the
  table in `spawnMonsters`) — cheap, high-tension, on-pillar ("no safe floor").
- **Mutations** past a depth threshold: a post-spawn roll applying stat/behavior
  modifiers (Brogue's explosive/agile/juggernaut/etc.). Cheap and very Brogue.

### The win condition (🟡, effort M)
Brogue = grab the **Amulet at depth 26**, then **climb back out** (the ascension
gauntlet). Delve = kill the **bottom boss**, an exit portal opens, step through.
The boss substitute is fine and co-op-friendly. To move toward fidelity without a
full redesign: make the bottom floor an **amulet pickup** that *seals the exits
and re-activates every floor's monsters* for a climb-back-out victory lap — the
single most iconic Brogue beat, and it reuses existing descent/stairs code in
reverse. (Note: Delve is 100 floors vs Brogue's 26 — the depth *count* is
already a deliberate divergence; fidelity here is about the *ascension beat*, not
matching 26.)

---

## 3. What Delve already gets right (don't regress these)

- **No experience points.** The hardest pillar to add *back* once a game has XP —
  Delve never took the bait. ✅
- **Deterministic seeds**, per-floor `seed#depth`. ✅ (matches Brogue's
  no-hidden-RNG ethos)
- **Permadeath** per character. ✅
- **Stealth states + sneak attacks** (`monsters.ts`). ✅
- **Persistent explored-terrain memory.** ✅
- **Hidden traps** (pit/dart, spotted-adjacent). ✅
- **Descent pressure** via escalating tiers + biome bands. ✅ (Brogue uses
  hunger as the clock; Delve uses monster escalation — a reasonable co-op swap,
  though a lightweight **food/nutrition** timer would add the missing "can't
  dawdle" pillar cheaply — **S–M**.)

---

## 4. Recommended roadmap (Path B)

Ordered by **fidelity-per-unit-effort**, respecting dependencies. Each phase is
shippable and testable on its own (`*.test.ts` next to pure logic per
`CLAUDE.md`).

**Phase 1 — Character model & the item spine (unlocks everything).**
1. Strength stat + Potion of Life / Potion of Strength (Pillar 1). `S–M`
2. `items.ts` + inventory + `use-item` intent; first potions & scrolls. `M`
3. Per-run **identification** table + Detect Magic (Pillar 2). `M`
4. **Enchant** on gear + Scroll of Enchanting + real accuracy/armor combat math
   (Pillar 4). `M–L`

**Phase 2 — Living dungeon.**
5. **Terrain simulation**: fire spread → gas clouds (Pillar 5), pairs with
   thrown potions from Phase 1. `L`
6. **Monster geometry + hordes + OOD + mutations** (Pillar 8). `L`
7. **Scent + stealth-radius** modulation (Pillar 6). `M`

**Phase 3 — Authored texture.**
8. **Vault pockets** in caves: levers/portcullis/guardian + metered loot, and
   **altars** (commutation) once items exist (Pillar 7, cheap path). `M–L`
9. **Nutrition/food** clock (descent pressure). `S–M`
10. **Ascension victory lap** — amulet → sealed exits → climb out (win rework).
    `M`

**Phase 4 — the faithful stretch (optional, big).**
11. **Room-accretion generator** as an alternate biome, then the full
    **blueprint/machine** system on top (Pillar 7, faithful path). `XL`

Phases 1→3 land a game that hits ~80% Brogue fidelity while staying co-op and
real-time. Phase 4 is the only remaining "true Brogue" piece and the largest
single lift — worth doing only if authored guardian puzzles are a must-have.

---

## 5. Honest limits of a faithful recreation here

- **Turn-based tactics** (energy timing, haste/slow interplay, monster-speed
  kiting) can only be *approximated* under real-time co-op. This caps combat
  fidelity around 🟢-minus regardless of item work.
- **Solo-run identity.** Brogue is a lonely, tense solo descent; Delve is a
  party game. Shared identification and party pets are *fun divergences*, not
  betrayals — but they change the emotional register. That's a feature, not a
  bug, as long as it's a deliberate choice.
- **Machines need rooms.** The single biggest authored-content gap is
  architectural (CA caves vs accreted rooms). Everything else can be layered
  onto the current engine; real guardian-puzzle machines cannot, without Phase 4.

**Bottom line:** Delve can become a genuinely faithful *Brogue-like* — same
design pillars, same tensions, same "power comes from items and positioning, not
grinding" soul — by executing Phases 1–3. It can only become *Brogue itself*
(turn-based, machine-authored, solo) by also taking on Phase 4 and re-opening the
clock decision in §0. The recommendation is the former: build the Brogue soul on
the co-op body Delve already has.
</content>
</invoke>
