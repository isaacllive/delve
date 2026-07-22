// Hidden traps on dungeon floors: pressure plates that spring when stepped on.
// Deterministic per floor (seed#trap#depth), spawned server-side alongside
// monsters/loot. Two kinds reuse mechanics we already have:
//   • `pit`  — a trap door: fall through to the next floor (same as a chasm).
//   • `dart` — a dart volley: take damage on the spot.
// Traps are secret: the server never broadcasts an armed, un-spotted trap, so
// the client can't reveal their locations. They surface only once sprung or
// noticed by standing adjacent (see gameServer).

import { cellIndex } from './grid.ts';
import { makeRng } from './rng.ts';
import type { DungeonLevel } from './dungeon.ts';

export type TrapKind = 'pit' | 'dart';

export interface Trap {
  id: string;
  kind: TrapKind;
  col: number;
  row: number;
  /** Triggered + spent (won't fire again). */
  sprung: boolean;
  /** Shown to clients (sprung, or spotted by an adjacent delver). */
  revealed: boolean;
}

/** Damage a dart trap deals when it springs (scales gently with depth). */
export function dartDamage(depth: number): number {
  return 5 + Math.floor(depth / 4);
}

/** Deterministic trap layout for a floor (none in the base camp). Placed on
 *  open floor cells, never on the entry/stairs/boss anchors. A pit trap on the
 *  deepest floor would have nowhere to drop to, so only dart traps spawn there. */
export function spawnTraps(seed: string, level: DungeonLevel): Trap[] {
  if (level.depth < 0) return [];
  const rng = makeRng(`${seed}#trap#${level.depth}`);

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
  if (open.length === 0) return [];

  // The deepest floor has no floor below, so pit (trap-door) traps can't drop
  // anywhere — restrict it to dart traps.
  const noPit = level.stairsDown === undefined;

  const out: Trap[] = [];
  const count = Math.min(12, 2 + Math.floor(level.depth / 5) + rng.int(0, 2));
  const used = new Set<number>();
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const idx = open[rng.int(0, open.length - 1)];
    if (used.has(idx)) continue;
    const col = idx % level.cols;
    const row = Math.floor(idx / level.cols);
    // Don't arm a trap right on the arrival point's doorstep.
    if (Math.abs(col - level.entry.col) + Math.abs(row - level.entry.row) < 4) continue;
    used.add(idx);
    const kind: TrapKind = !noPit && rng.chance(0.5) ? 'pit' : 'dart';
    out.push({ id: `${level.depth}-t${out.length}`, kind, col, row, sprung: false, revealed: false });
  }
  return out;
}

/** The (single) trap at a cell, if any. */
export function trapAt(traps: Trap[], col: number, row: number): Trap | undefined {
  return traps.find((t) => t.col === col && t.row === row);
}
