// Loot scattered on dungeon floors: gold piles and unidentified items (potions
// and scrolls from the catalog — see items.ts). Deterministic per floor
// (seed#loot#depth), spawned server-side and picked up by walking onto the cell.
// Gold + items you carry back to camp are banked by surviving; die in the
// dungeon and it's all lost with the character (permadeath).
//
// The item's true KIND is decided here (deterministically) but stays hidden from
// the player: on the floor it shows only as "a potion" / "a scroll", and in the
// pack it's disguised by its per-run appearance until identified.

import { cellIndex } from './grid.ts';
import { makeRng } from './rng.ts';
import type { DungeonLevel } from './dungeon.ts';
import { ITEM_KINDS, ITEM_KIND_BY_ID, type ItemCategory, type ItemKindId } from './items.ts';
import { WEAPONS, ARMORS, type GearCategory, type GearKindId } from './gear.ts';

export type LootKind = 'gold' | 'item';

export interface Loot {
  id: string;
  kind: LootKind;
  col: number;
  row: number;
  /** Gold value (for `gold`); 0 for items. */
  amount: number;
  /** The item kind (for `item`) — server-side truth, not revealed on the floor. */
  kindId?: ItemKindId;
  /** The item category (for `item`) — the only thing shown on the floor. */
  category?: ItemCategory;
}

/**
 * A piece of gear waiting on the floor. Kept as a SEPARATE drop stream from
 * `Loot` (see `spawnGear`) rather than a third `LootKind`, because the wire type
 * `LootState.kind` (protocol.ts) is a fixed `'gold' | 'item'` that the server
 * serializes directly — widening `Loot` would break that untouched contract.
 * The Wave-2 integrator merges these into the floor's pickups (adding the
 * matching protocol/server support) and builds a `GearInstance` via
 * `gear.makeGear(gearCategory, gearKindId, id, enchantLevel)`.
 */
export interface GearDrop {
  id: string;
  col: number;
  row: number;
  /** Weapon or armor — the base type IS known to the player on pickup. */
  gearCategory: GearCategory;
  /** The base weapon/armor kind id (see gear.ts). */
  gearKindId: GearKindId;
  /** Enchant level the dropped gear carries (usually 0 — the enchant economy's
   *  real supply is Scrolls of Enchanting, not floor gear). Stays HIDDEN from the
   *  player until identified, exactly like a consumable's true kind. */
  enchantLevel: number;
}

/** Gold a monster drops when slain, scaled by how dangerous it is. */
export function monsterReward(damage: number, boss: boolean): number {
  return boss ? 500 : 3 + damage * 2;
}

/** Cost of a mystery potion from the camp Provisioner. */
export const POTION_COST = 15;

/** Chance a given loot drop is a consumable item (vs a gold pile). */
const ITEM_DROP_CHANCE = 0.35;

/** Kinds that drop at random on the floor. Excludes the Scroll of Enchanting —
 *  its supply is METERED separately (see spawnLoot) to keep the enchant economy
 *  finite. Food + all other potions/scrolls drop normally. */
const DROPPABLE_KINDS = ITEM_KINDS.filter((k) => k.id !== 'enchanting');

/** Per-attempt chance a floor yields a piece of gear (see `spawnGear`).
 *  Deliberately low so gear stays rarer than consumables — weapons/armor are
 *  scarce in Brogue and power comes from enchanting the few you find. */
const GEAR_DROP_CHANCE = 0.35;

/** Small chance a floor gear drop arrives already +1. Most gear is +0 — the
 *  enchant economy is meant to run on Scrolls of Enchanting, not found gear. */
const PRE_ENCHANT_CHANCE = 0.1;

/** Deterministic floor loot (none in the base camp). */
export function spawnLoot(seed: string, level: DungeonLevel): Loot[] {
  if (level.depth < 0) return [];
  const rng = makeRng(`${seed}#loot#${level.depth}`);

  const reserved = new Set<number>();
  const mark = (p?: { col: number; row: number }) => {
    if (p) reserved.add(cellIndex(p.col, p.row, level.cols));
  };
  mark(level.entry);
  mark(level.stairsDown);
  mark(level.boss);

  const open: number[] = [];
  for (let i = 0; i < level.cells.length; i++) {
    if (level.cells[i].kind === 'floor' && !reserved.has(i)) open.push(i);
  }
  if (open.length === 0) return [];

  const out: Loot[] = [];
  const count = 4 + rng.int(0, 4);
  for (let n = 0; n < count; n++) {
    const idx = open[rng.int(0, open.length - 1)];
    const col = idx % level.cols;
    const row = Math.floor(idx / level.cols);
    if (rng.chance(ITEM_DROP_CHANCE)) {
      const kind = rng.pick(DROPPABLE_KINDS);
      out.push({
        id: `${level.depth}-l${n}`,
        kind: 'item',
        col,
        row,
        amount: 0,
        kindId: kind.id,
        category: kind.category,
      });
    } else {
      const base = 5 + level.depth * 2;
      out.push({ id: `${level.depth}-l${n}`, kind: 'gold', col, row, amount: base + rng.int(0, base) });
    }
  }

  // Metered enchant economy: guarantee a Scroll of Enchanting on a fixed cadence
  // (~every third floor) so its lifetime supply is finite and predictable — the
  // Brogue pillar that you invest a fixed number of enchants, never grind for more.
  if (level.depth % 3 === 2) {
    const idx = open[rng.int(0, open.length - 1)];
    out.push({
      id: `${level.depth}-ench`,
      kind: 'item',
      col: idx % level.cols,
      row: Math.floor(idx / level.cols),
      amount: 0,
      kindId: 'enchanting',
      category: 'scroll',
    });
  }
  return out;
}

/**
 * Deterministic floor gear (none in the base camp), a sibling stream to
 * `spawnLoot`. Gear is deliberately SCARCE — rarer than consumables — because in
 * Brogue power comes from enchanting the few weapons/armor you find, not from a
 * flood of drops. Seeded off a distinct namespace (`#gear#`) so it neither
 * perturbs nor depends on the consumable/gold stream.
 *
 * Cells are chosen from the same open-floor set `spawnLoot` uses; the caller
 * (Wave-2 integrator) is responsible for de-conflicting positions if it places
 * both on the same floor. Kept simple and flat (uniform kind choice) per YAGNI —
 * depth-weighted selection can layer on later.
 */
export function spawnGear(seed: string, level: DungeonLevel): GearDrop[] {
  if (level.depth < 0) return [];
  const rng = makeRng(`${seed}#gear#${level.depth}`);

  const reserved = new Set<number>();
  const mark = (p?: { col: number; row: number }) => {
    if (p) reserved.add(cellIndex(p.col, p.row, level.cols));
  };
  mark(level.entry);
  mark(level.stairsDown);
  mark(level.boss);

  const open: number[] = [];
  for (let i = 0; i < level.cells.length; i++) {
    if (level.cells[i].kind === 'floor' && !reserved.has(i)) open.push(i);
  }
  if (open.length === 0) return [];

  const out: GearDrop[] = [];
  // 0–2 pieces per floor, and only when the metered roll fires — so most floors
  // yield one piece or none, keeping gear scarce relative to consumables.
  const attempts = 2;
  for (let n = 0; n < attempts; n++) {
    if (!rng.chance(GEAR_DROP_CHANCE)) continue;
    const idx = open[rng.int(0, open.length - 1)];
    const col = idx % level.cols;
    const row = Math.floor(idx / level.cols);
    const kind = rng.chance(0.5) ? rng.pick(WEAPONS) : rng.pick(ARMORS);
    out.push({
      id: `${level.depth}-g${n}`,
      col,
      row,
      gearCategory: kind.category,
      gearKindId: kind.id,
      enchantLevel: rng.chance(PRE_ENCHANT_CHANCE) ? 1 : 0,
    });
  }
  return out;
}

/** A random item KIND for a mystery shop purchase (deterministic caller-seeded).
 *  The Provisioner sells sealed, unidentified potions. */
export function randomPotionKind(seed: string): ItemKindId {
  const rng = makeRng(seed);
  const potions = ITEM_KINDS.filter((k) => k.category === 'potion');
  return rng.pick(potions).id;
}

/** Guard: is this a real item kind id? (Defends the shop/use paths.) */
export function isItemKind(id: string): id is ItemKindId {
  return id in ITEM_KIND_BY_ID;
}
