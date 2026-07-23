# Faithfully recreating Brogue in Delve — fidelity analysis & gap catalog

Companion to [`brogue-features.md`](./brogue-features.md) (mechanic shopping
list) and [`parallelization.md`](./parallelization.md) (how the remaining work
splits across agents).

This doc answers two questions:

1. **How faithful is Delve today?** — §1 scorecard, scored against the code as
   it actually stands (not the plan).
2. **What's left, and in what order?** — §3 the **gap catalog** (`G1`…`G20`),
   the authoritative backlog. `parallelization.md` schedules these IDs; don't
   restate their content anywhere else.

Brogue side: BrogueCE (`tmewett/BrogueCE`) — `Rogue.h`, `GlobalsBrogue.c`,
`Combat.c`, `Items.c`, `Movement.c`, `Architect.c`, `Monsters.c`.

> **Licensing note (decide before any public release).** BrogueCE is
> **AGPL-3.0**. Delve already ports numeric tables verbatim (see the header of
> `gear.ts`). Game *mechanics* aren't copyrightable, but verbatim table data
> copied out of AGPL source plausibly is. Either (a) accept AGPL for Delve, (b)
> re-derive the numbers independently, or (c) keep it private. This is a
> decision, not a blocker — but it should be a conscious one.

---

## 0. The clock decision — settled

The previous revision of this doc recommended keeping Delve real-time and co-op
("Path B", fidelity ceiling ~70%). **That recommendation was overridden and the
code has moved on.** Delve is now **strictly turn-based on an energy budget**
(Path A): `energy.ts` (100-tick turn, haste 50, slow 200) is wired through
`gameServer.ts`; the wall-clock heartbeat is gone; per-kind `actionTicks` drive
monster scheduling. Real-time co-op is shelved as a future extension.

**Consequence: the fidelity ceiling is now ~95%, and every gap below is scored
against that ceiling.** Multiplayer still works (multiple sockets on one run),
but it is no longer the constraint that shapes design choices — solo Brogue is.

---

## 1. Fidelity scorecard (against the code, today)

| # | Brogue pillar | Delve today | Fidelity | Gap IDs |
|---|---|---|---|---|
| 0 | **Turn/energy clock** | ✅ `energy.ts` wired; per-kind speeds; regen; nutrition drain | 🟢 85% | G2 (haste/slow *statuses*), G19 |
| 1 | **No XP / power from items** | ✅ classless, STR 12 / HP 30, growth only via potions of life & strength | 🟢 90% | G19 |
| 2 | **Identification game** | ✅ per-run seeded appearances, shared `discovered` set, use-ID + Scroll of Identify | 🟡 65% | G10 (polarity, curses) |
| 3 | **Hand-tuned item kit** | 🟡 5 potions, 4 scrolls, 1 food, 6 weapons, 6 armors. **No staffs, wands, rings, charms, runics** | 🟡 35% | G6, G7, G8, G9, G10, G11 |
| 4 | **Enchant economy** | ✅ per-instance enchant, +1 enchant / −1 STR req, metered scrolls, commutation altars | 🟢 80% | G10 (negative enchant/curses) |
| 5 | **Emergent terrain sim** | 🟡 fire + 2 gases as a CA — but **confusion gas has no effect**, lava is palette-only, no steam/item-burning/bog/webs | 🟡 40% | G13, G15 |
| 6 | **Information as gameplay** | 🟡 stealth states, persistent fog, traps. **No scent, telepathy, magic-map, clairvoyance, detect-magic** | 🟡 30% | G3, G9, G17, G18 |
| 7 | **Machines** | 🟡 one vault archetype (portcullis + lever + mirror guardians) + commutation altars. No blueprint framework, no captives, no flavor machines | 🟡 30% | G12, G14 |
| 8 | **Monster geometry** | 🟡 ~24 kinds, 11 ability flags all resolved, hordes, OOD, 4 mutations. **AI is greedy sign-stepping** (no pathfinding), no monster spells, no allies | 🟡 45% | G3, G4, G5, G18 |
| 9 | **Amulet + ascension** | ✅ depth 26, amulet wakes the dungeon, climb-out win | 🟢 85% | G20 |
| 10 | **Presentation / feedback** | 🟡 HUD, minimap, 3D voxel view. No monster sidebar, no message history, no level feeling, no inspect | 🟡 35% | G16, G17 |

**Headline.** The *skeleton* is now faithful — clock, combat math, character
model, identification, enchant economy, 26 depths, ascension. What's thin is
**breadth**: the item kit is ~20% of Brogue's, monster AI is a placeholder
under a faithful catalog shell, terrain has one working reaction (fire), and
the machine system is a single archetype. Breadth is *also* the most
parallelizable work in the project — see §4.

---

## 2. Two latent bugs found during this audit

Not new features — existing systems that don't do what their code claims:

- **Confusion gas is inert.** `hazards.ts` simulates a `confusion` gas field and
  the renderer draws it, but `hazardHitPlayer` / `stepFloorHazards` in
  `gameServer.ts` only read `caustic`. Nothing is ever confused. Fixed by G2
  (there is no status layer to apply it to). *Regression test owed.*
- **Monsters don't path.** `pathfind.ts` exists, is tested, and is used **only**
  by the client (travel-to / auto-explore). `actMonster` chases with
  `Math.sign` deltas and three fallback steps, so monsters stick on concave
  walls and lose the player around any corner. Fixed by G3.

---

## 3. Gap catalog

The backlog. **Effort**: S ≤ ½ day, M ≈ 1–2 days, L ≈ 3–5 days, XL ≈ a week+.
**Status**: ☐ not started · ◐ partial · ☑ done. Update status *here*; the wave
tracker in `parallelization.md` references these IDs only.

### Foundations (unlock most of the rest)

| ID | Gap | Effort | Depends on |
|---|---|---|---|
| ☑ **G1** | **Bolt engine** — new pure `bolt.ts`: trace a bolt from caster to target along `los.ts`, resolve stop/pass-through/reflect/bounce/tunnel per bolt kind, return the affected path. Brogue's staffs, wands and every monster spell are bolts; without this they can't exist. | M | — |
| ◐ **G2** | *(module landed; server wiring pending — the confusion-gas fix is in that pass)* **Status-effect layer** — new pure `status.ts`: a duration/stacking/decay model plus the Brogue status set (confusion, hallucination, levitation, telepathy, haste, slow, darkness, paralysis, discord, nausea, shielding, negation, fire immunity). Player carries only `poison` today. Wire one per-turn decay world-system + protocol field; **fixes the inert confusion gas**. | M | — |
| ◐ **G3** | *(modules landed; `actMonster` still runs the old rule until the integration pass)* **Scent map + real monster AI** — new pure `scent.ts` (decaying diffusion field the player emits, Brogue's actual pursuit substrate) and switch `actMonster` from sign-stepping to `pathfind.ts` + scent-following, with the Brogue chance-to-lose-the-track. | M | — |
| ◐ **G13** | *(kinds + rules landed; move-handler effects pending. Layering deliberately deferred — see the `terrain.ts` header for the decision and its cost. Statues + luminescent fungus still open; placement is G14)* **Terrain breadth + layer model** — Brogue cells stack layers (dungeon / liquid / surface / gas); Delve has one `TerrainKind` per cell. Add the layer model, then: deep vs shallow water (deep drops pack items, allows swimming), **real lava**, chasm-as-fast-descent, bog, spider webs, creeping lichen, bridges, statues, luminescent fungus, **secret doors**. | L | — |

### Item kit (the largest single fidelity block)

| ID | Gap | Effort | Depends on |
|---|---|---|---|
| ☐ **G6** | **Staffs & wands** — charge model (staffs recharge over turns, wands are fixed-charge), the bolt kinds (lightning, firebolt, poison, tunneling, blinking, entrancement, obstruction, discord, conjuration, healing, haste-other, slowness, negation, domination, plenty, beckoning, invisibility, empowerment). Needs a **targeting cursor** in the wire contract, not facing-only throwing. | L | G1, G2 |
| ☐ **G7** | **Rings** — clairvoyance, stealth, regeneration, transference, light, awareness, wisdom, reaping; enchantable, and **cursed negatives** are the point. | M | G2, G10 |
| ☐ **G8** | **Charms** — cooldown-gated self-buffs (health, protection, haste, fire immunity, invisibility, recall, negation, shattering, guardian, teleportation). Cheapest item category to add once statuses exist. | S | G2 |
| ☐ **G9** | **Potions & scrolls to full breadth** — remaining potions (telepathy, levitation, detect magic, hallucination, darkness, fire immunity, speed, paralysis, confusion, creature discord, invisibility, healing) and scrolls (magic mapping, recharging, protect armor/weapon, remove curse, summon monsters, cause fear, negation, shattering, sanctity, discord). | L | G2, G1, G3 |
| ☐ **G10** | **Curses, runics & Detect Magic** — negative enchant, cursed-on-pickup items you can't unequip, weapon/armor runics (both good and bad), and the good/bad **polarity** channel Detect Magic reveals. This is what makes identification a *risk*, not a formality. | M | — |
| ☐ **G11** | **Item generation fidelity** — replace flat `ITEM_DROP_CHANCE` / `GEAR_DROP_CHANCE` (0.35 each) with Brogue's frequency-weighted per-category tables and the metered lifetime budget over 26 depths (how many enchant scrolls, potions of life & strength a run may ever see). *Must land after the catalogs it meters.* | M | G6–G10 |

### Living dungeon

| ID | Gap | Effort | Depends on |
|---|---|---|---|
| ☐ **G4** | **Monster catalog fidelity** — grow ~24 hand-set kinds toward Brogue's ~60 with per-kind accuracy/defense/damage/regen, **monster spell bolts** (spark, firebolt, slow, discord, negation, healing, summon), morale/flee thresholds, leader↔follower bonds, and monsters that **carry items you can loot**. | L | G1, G2 |
| ☐ **G5** | **Allies & captives** — shackled captive monsters you free for a companion, ally leveling/feeding, domination, ally-specific AI (follow, guard, attack-my-target). One of Brogue's most distinctive loops; entirely absent. | L | G4, G12 |
| ☐ **G15** | **Terrain reaction completeness** — steam over water, fire burning dropped items, lava as an ignition source, gas welling from bog, webs burning away, and confusion gas actually confusing. Today only fire→grass and caustic→damage resolve. | M | G2, G13 |
| ☐ **G18** | **Stealth & noise fidelity** — per-turn monster perception rolls (vs. today's flat aggro-9 radius), stealth range modulated by resting/moving/armor weight/light, and **combat noise waking neighbours**. | M | G3 |
| ☐ **G19** | **Regeneration fidelity** — Brogue's regen rate scales with max HP (Delve uses a flat 300-turn full-heal); add monster regen and the ring-of-regeneration multiplier. | S | G7 |

### Authored content

| ID | Gap | Effort | Depends on |
|---|---|---|---|
| ☐ **G12** | **Blueprint / machine framework** — the real thing: a key↔lock dependency model with a **difficulty budget**, reward rooms (guarded, flooded, fire-trapped, statue-puzzle, captive, commutation), and flavor machines (goblin warren, sentinel sanctuary, kennel, vampire lair, witch-hazel grove). Delve has exactly one hand-built archetype today. | XL | G13, G14, items |
| ☐ **G14** | **Generation feature layer** — lakes with **bridges**, chasms, wreaths/halos around features, and Brogue's per-depth *autogenerator* table (which decorations, how many, at what depths). Currently decoration is ad-hoc per biome. | L | G13 |

### Player agency & presentation

| ID | Gap | Effort | Depends on |
|---|---|---|---|
| ☐ **G16** | **Tactical verbs** — a **targeting cursor** (throw/zap at an arbitrary cell, not just facing), throw *any* item, drop, **search for secret doors**, rest-until-healed, call/nickname unidentified items. Throwing is facing-only today. | M | G13 |
| ☐ **G17** | **Information UI** — Brogue's sidebar (visible monsters with health bars + statuses), scrolling message log with history, **level feeling** on arrival ("you sense a malevolent presence"), discovered-items screen, and monster/item inspect. | M | G2 |
| ☐ **G20** | **Endgame texture** — lumenstones as optional score, the endless dive below 26, a death/victory recap screen, and the seed catalog. | S | — |

### Deliberate divergences (not gaps — do not "fix")

- **Multiplayer co-op** on one run, and shared party identification.
- **3D voxel renderer** instead of a terminal grid — the whole point of Delve.
- **Base camp + shops** between expeditions (Brogue has no economy).
- **Real-time co-op**, shelved but not deleted.

---

## 4. Recommended order

Sequenced by *unlock value*, not by size:

1. **Foundations wave** — G1, G2, G3, G13 in parallel. Nothing downstream is
   possible without them, and they touch four disjoint new/owned modules.
2. **Breadth wave** — G4, G6, G7, G8, G9, G15, G18, G19 (each needs one or two
   foundations, and they parallelize by category once the item modules are
   split — see `parallelization.md`).
3. **Texture wave** — G10, G14, G16, G17, G20.
4. **Authored wave** — G12, then G5, then G11 last (it meters everything
   above, so it must see the finished catalogs).

Landing waves 1–2 puts Delve at roughly **75–80% fidelity**; wave 3 at ~85%;
wave 4 is what takes it to the ~95% ceiling the turn-based clock made possible.
