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

/** Gold a monster drops when slain, scaled by how dangerous it is. */
export function monsterReward(damage: number, boss: boolean): number {
  return boss ? 500 : 3 + damage * 2;
}

/** Cost of a mystery potion from the camp Provisioner. */
export const POTION_COST = 15;

/** Chance a given loot drop is an item (vs a gold pile). */
const ITEM_DROP_CHANCE = 0.35;

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
      const kind = rng.pick(ITEM_KINDS);
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
