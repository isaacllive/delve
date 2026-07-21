// Monsters. Kinds scale with the biome tier (every 20 floors). The server
// spawns them per floor (deterministic count/positions from the seed) and runs
// their AI; combat is bump-to-attack. The bottom-floor boss is a monster too —
// killing it opens the exit.

import { cellIndex } from './grid.ts';
import { makeRng } from './rng.ts';
import type { DungeonLevel } from './dungeon.ts';
import { FLOORS_PER_BIOME } from './biomes.ts';

export interface MonsterKind {
  id: string;
  name: string;
  hp: number;
  damage: number;
  color: number;
  boss?: boolean;
}

// One or two kinds per biome tier (index = biome band).
const TIERS: MonsterKind[][] = [
  [
    { id: 'rat', name: 'Cave Rat', hp: 6, damage: 2, color: 0x9a8a70 },
    { id: 'goblin', name: 'Goblin', hp: 11, damage: 3, color: 0x7ba05a },
  ],
  [
    { id: 'skeleton', name: 'Skeleton', hp: 15, damage: 4, color: 0xd8d2c0 },
    { id: 'ghoul', name: 'Ghoul', hp: 20, damage: 5, color: 0x8a9a6a },
  ],
  [
    { id: 'imp', name: 'Cinder Imp', hp: 17, damage: 6, color: 0xff7a3a },
    { id: 'hound', name: 'Magma Hound', hp: 24, damage: 7, color: 0xd0431a },
  ],
  [
    { id: 'sentinel', name: 'Sentinel', hp: 28, damage: 7, color: 0xffd070 },
    { id: 'wraith', name: 'Wraith', hp: 22, damage: 9, color: 0x9a7fff },
  ],
  [
    { id: 'horror', name: 'Horror', hp: 32, damage: 9, color: 0x7a5cff },
    { id: 'fiend', name: 'Void Fiend', hp: 38, damage: 11, color: 0x66ff8a },
  ],
];

const BOSS: MonsterKind = {
  id: 'warden-of-the-deep',
  name: 'Warden of the Deep',
  hp: 220,
  damage: 16,
  color: 0xff2020,
  boss: true,
};

export interface Monster {
  id: string;
  kindId: string;
  name: string;
  color: number;
  col: number;
  row: number;
  hp: number;
  hpMax: number;
  damage: number;
  boss: boolean;
}

function tierFor(depth: number): MonsterKind[] {
  return TIERS[Math.min(TIERS.length - 1, Math.floor(depth / FLOORS_PER_BIOME))];
}

/** Deterministic monster population for a floor (empty in the base camp). */
export function spawnMonsters(seed: string, level: DungeonLevel): Monster[] {
  if (level.depth < 0) return []; // camp is safe
  const rng = makeRng(`${seed}#mon#${level.depth}`);
  const kinds = tierFor(level.depth);
  const out: Monster[] = [];

  // Open floor cells that aren't the entry / stairs / boss anchor.
  const reserved = new Set<number>();
  const mark = (p?: { col: number; row: number }) => {
    if (p) reserved.add(cellIndex(p.col, p.row, level.cols));
  };
  mark(level.entry);
  mark(level.stairsUp);
  mark(level.stairsDown);
  mark(level.boss);
  const open: number[] = [];
  for (let i = 0; i < level.cells.length; i++) {
    if (level.cells[i].kind === 'floor' && !reserved.has(i)) open.push(i);
  }
  if (open.length === 0) return out;

  const count = Math.min(18, 3 + Math.floor(level.depth / 6) + rng.int(0, 3));
  let n = 0;
  for (let tries = 0; n < count && tries < count * 20; tries++) {
    const idx = open[rng.int(0, open.length - 1)];
    const col = idx % level.cols;
    const row = Math.floor(idx / level.cols);
    // Don't spawn right on top of the arrival point.
    if (Math.abs(col - level.entry.col) + Math.abs(row - level.entry.row) < 6) continue;
    const k = rng.pick(kinds);
    out.push(makeMonster(k, col, row, `${level.depth}-${n}`));
    n++;
  }

  // Boss stands guard on its floor.
  if (level.boss) out.push(makeMonster(BOSS, level.boss.col, level.boss.row, `${level.depth}-boss`));
  return out;
}

function makeMonster(k: MonsterKind, col: number, row: number, id: string): Monster {
  return {
    id,
    kindId: k.id,
    name: k.name,
    color: k.color,
    col,
    row,
    hp: k.hp,
    hpMax: k.hp,
    damage: k.damage,
    boss: k.boss ?? false,
  };
}
