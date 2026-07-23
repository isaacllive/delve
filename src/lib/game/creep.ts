// Slow terrain growth — creeping lichen colonising a level, as a pure
// deterministic cellular automaton over TERRAIN KINDS.
//
// Deliberately separate from hazards.ts: that module simulates a transient
// FIELD overlaid on the grid (fire intensity, gas concentration) and only
// touches terrain to burn fuel away. Creep is the opposite — it has no field of
// its own, it just rewrites terrain kinds slowly. Keeping them apart means
// neither has to know the other's data model. (If they ever want a shared
// per-turn driver, `stepCreep` folds into hazards.ts's step untouched.)
//
// Determinism: every roll comes from the seeded Rng (rng.ts) the caller passes,
// never Date.now / Math.random, so a run replays identically everywhere.

import { DIRS4, cellIndex, inBounds } from './grid.ts';
import type { Rng } from './rng.ts';
import { makeCell, terrainProps, type Level, type TerrainKind } from './terrain.ts';

/**
 * What creeping terrain can colonise: bare ground and grass.
 *
 * This is the SIM's policy, not a property of the terrain being grown, so it
 * lives here rather than in TERRAIN_PROPS. Lichen takes root in dirt and turf;
 * it does not climb stairs, scale ledges, cross bridges, or grow on liquids,
 * and it may never overwrite structural terrain (stairs, gates) because doing
 * so could strand a level's only route.
 */
const COLONISABLE: ReadonlySet<TerrainKind> = new Set<TerrainKind>(['floor', 'grass']);

/** Can creeping terrain take root at this cell? */
export function isColonisable(level: Level, col: number, row: number): boolean {
  if (!inBounds(col, row, level.cols, level.rows)) return false;
  return COLONISABLE.has(level.cells[cellIndex(col, row, level.cols)].kind);
}

/**
 * Advance creeping terrain one turn, in place. Every cell whose kind has a
 * positive `spreadChance` rolls once; on a hit it colonises ONE randomly-chosen
 * orthogonal neighbour that is colonisable.
 *
 * Growth is collected from the CURRENT generation and applied afterwards, so a
 * cell grown this turn cannot itself spread until the next one — bounded,
 * order-independent growth, the same discipline the fire sim uses.
 *
 * Returns the number of cells newly colonised (0 when nothing grew), which lets
 * the server skip broadcasting an unchanged level.
 */
export function stepCreep(level: Level, rng: Rng): number {
  const { cols, cells } = level;
  const grown = new Map<number, TerrainKind>();

  for (let i = 0; i < cells.length; i++) {
    const kind = cells[i].kind;
    const chance = terrainProps(kind).spreadChance;
    if (chance <= 0 || !rng.chance(chance)) continue;

    const col = i % cols;
    const row = (i / cols) | 0;
    // Roll the direction unconditionally (not only when a target is free) so
    // the RNG stream advances the same way regardless of local geometry.
    const dir = DIRS4[rng.int(0, DIRS4.length - 1)];
    const nc = col + dir.col;
    const nr = row + dir.row;
    if (!isColonisable(level, nc, nr)) continue;
    grown.set(cellIndex(nc, nr, cols), kind);
  }

  for (const [index, kind] of grown) cells[index] = makeCell(kind);
  return grown.size;
}
