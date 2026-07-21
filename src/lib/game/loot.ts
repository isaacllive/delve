// Loot scattered on dungeon floors: gold piles and the occasional healing
// potion. Deterministic per floor (seed#loot#depth), spawned server-side and
// picked up by walking onto the cell. Gold you carry back to camp is banked by
// surviving; die in the dungeon and it's lost with the character (permadeath).

import { cellIndex } from './grid.ts';
import { makeRng } from './rng.ts';
import type { DungeonLevel } from './dungeon.ts';

export type LootKind = 'gold' | 'potion';

export interface Loot {
  id: string;
  kind: LootKind;
  col: number;
  row: number;
  /** Gold value (for `gold`); ignored for potions. */
  amount: number;
}

/** Gold a monster drops when slain, scaled by how dangerous it is. */
export function monsterReward(damage: number, boss: boolean): number {
  return boss ? 500 : 3 + damage * 2;
}

/** Healing a potion restores, and its shop price. */
export const POTION_HEAL = 12;
export const POTION_COST = 15;

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
    if (rng.chance(0.25)) {
      out.push({ id: `${level.depth}-l${n}`, kind: 'potion', col, row, amount: 0 });
    } else {
      const base = 5 + level.depth * 2;
      out.push({ id: `${level.depth}-l${n}`, kind: 'gold', col, row, amount: base + rng.int(0, base) });
    }
  }
  return out;
}
