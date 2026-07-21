// Vision falloff + per-player fog accumulation. Ported from RealmQuest VTT
// `tokenVisibility` (src/lib/sceneMap.ts): full brightness within a clear
// radius, then a falloff ramp out to the vision range, gated by line of sight.
// Also the "explore the dark" fog-of-war model: a per-level set of cells the
// player has ever seen (revealed), rendered dim when out of current view.

import type { Cell } from './grid.ts';

/** Max vision radius in cells (RealmQuest default). Beyond this: dark. */
export const VISION_RANGE_CELLS = 12;
/** Fraction of the vision radius that stays fully bright before falloff. */
export const VISION_CLEAR_FRAC = 0.2;

export interface VisionSource extends Cell {
  elevation?: number;
  /** Light/sight radius this source casts (cells). Defaults to VISION_RANGE. */
  range?: number;
}

/**
 * Brightness multiplier 0..1 for a cell from a set of vision sources.
 * 1 inside the clear radius, ramping to 0 at the source's range, `falloff`
 * exponent on the ramp. A source only contributes if it has line of sight
 * (`hasLos`) to the cell. Pure — LoS is a caller callback so terrain/height
 * lookups stay out of here.
 */
export function cellVisibility(opts: {
  cell: Cell;
  sources: readonly VisionSource[];
  hasLos: (from: VisionSource, to: Cell) => boolean;
  falloff?: number;
}): number {
  const { cell, sources, hasLos } = opts;
  const falloff = opts.falloff ?? 1;
  let best = 0;
  for (const s of sources) {
    const range = s.range ?? VISION_RANGE_CELLS;
    const d = Math.max(Math.abs(cell.col - s.col), Math.abs(cell.row - s.row));
    if (d > range) continue;
    if (!hasLos(s, cell)) continue;
    const clear = range * VISION_CLEAR_FRAC;
    let v: number;
    if (d <= clear) v = 1;
    else v = Math.pow((range - d) / (range - clear), falloff);
    if (v > best) best = v;
  }
  return best;
}

/**
 * Per-level fog memory. `revealed[level]` is the set of flat cell indices the
 * player has ever seen. Mutated as the player explores; the renderer shows
 * currently-visible cells bright, revealed-but-unseen cells dim, and unseen
 * cells not at all.
 */
export type FogMemory = Map<number, Set<number>>;

export function emptyFog(): FogMemory {
  return new Map();
}

/** Record that a set of flat cell indices are now (or were) visible on a level. */
export function rememberCells(fog: FogMemory, level: number, indices: Iterable<number>): void {
  let set = fog.get(level);
  if (!set) {
    set = new Set();
    fog.set(level, set);
  }
  for (const i of indices) set.add(i);
}

export function isRevealed(fog: FogMemory, level: number, index: number): boolean {
  return fog.get(level)?.has(index) ?? false;
}
