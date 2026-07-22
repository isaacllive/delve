// Terrain model. Each cell has a kind, an elevation (height in cells; negative
// for depth), and derived flags for movement / sight / hazard. The elevation +
// occluder-height maps feed the ported line-of-sight math (los.ts) so terrain
// verticality actually changes what you can see — stand on a ledge to see over
// a low wall; a chasm is a hole you fall into.
//
// Inspired by RealmQuest's `effectiveBlocked` (scene.ts): a single derivation
// point turns terrain into the boolean maps that movement, LoS, and lighting
// all consume, so they can never drift.

import { cellIndex } from './grid.ts';

export type TerrainKind =
  | 'floor'
  | 'wall'
  | 'pit'
  | 'water'
  | 'ledge'
  | 'stairsDown'
  | 'stairsUp';

export interface TerrainCell {
  kind: TerrainKind;
  /** Height in cells. floor=0, ledge>0, wall=WALL_HEIGHT, pit/water<0. */
  elevation: number;
  /** World-Y of the cave ROOF underside above this cell, set during generation
   *  so the ceiling is uneven rock (arching down to the walls, bumpy in the
   *  open) rather than a flat slab. Undefined on cells that predate ceiling
   *  generation; the renderer falls back to a default. */
  ceiling?: number;
}

/** How tall a wall stands for sight purposes. A sightline must rise above this
 *  to clear a wall — ported concept from RealmQuest `WALL_HEIGHT_CELLS`, but
 *  walls here are deliberately tall so they always block ground-level sight and
 *  rise to meet the (uneven) cave roof. */
export const WALL_HEIGHT = 7.5;
/** Roof height range (world-Y) for the generated cave ceiling. Tall + varied
 *  so chambers feel cavernous; the roof still arches down to the walls. */
export const CEIL_MIN = 4.5;
export const CEIL_MAX = 11;
/** Default height a raised ledge/platform stands. */
export const LEDGE_HEIGHT = 1;
/** Depth of an open pit / chasm (negative elevation). */
export const PIT_DEPTH = -2;
/** Depth of a water tile. */
export const WATER_DEPTH = -0.35;

/** Canonical cell for a kind (its default elevation). */
export function makeCell(kind: TerrainKind): TerrainCell {
  switch (kind) {
    case 'wall':
      return { kind, elevation: WALL_HEIGHT };
    case 'ledge':
      return { kind, elevation: LEDGE_HEIGHT };
    case 'pit':
      return { kind, elevation: PIT_DEPTH };
    case 'water':
      return { kind, elevation: WATER_DEPTH };
    default:
      return { kind, elevation: 0 };
  }
}

/** A single dungeon level: a cols×rows grid of terrain cells, row-major. */
export interface Level {
  cols: number;
  rows: number;
  cells: TerrainCell[];
  /** Where a player arriving via the stairs-up (or the run start) spawns. */
  entry: { col: number; row: number };
  /** stairsDown location on this level (undefined on the deepest level). */
  stairsDown?: { col: number; row: number };
  /** stairsUp location (undefined on the top level). */
  stairsUp?: { col: number; row: number };
}

export function cellAt(level: Level, col: number, row: number): TerrainCell | undefined {
  if (col < 0 || row < 0 || col >= level.cols || row >= level.rows) return undefined;
  return level.cells[cellIndex(col, row, level.cols)];
}

/** Can a walker normally occupy this cell? Walls block; everything else is
 *  enterable (pits/water are enterable — entering them is a hazard event,
 *  resolved by the move handler, not a movement block). Out-of-bounds blocks. */
export function blocksMove(level: Level, col: number, row: number): boolean {
  const c = cellAt(level, col, row);
  if (!c) return true;
  return c.kind === 'wall';
}

/** Occluder height at a cell for sight. 0 == not an occluder. Walls stand
 *  WALL_HEIGHT tall; raised ledges occlude up to their own elevation (so a
 *  higher viewer sees over them); floors/pits/water don't occlude. */
export function occluderHeight(level: Level, col: number, row: number): number {
  const c = cellAt(level, col, row);
  if (!c) return WALL_HEIGHT; // treat off-map as solid
  if (c.kind === 'wall') return WALL_HEIGHT;
  if (c.elevation > 0) return c.elevation; // ledges / platforms
  return 0;
}

/** Is entering this cell a hazard (a fall / dunk)? */
export function hazardAt(level: Level, col: number, row: number): 'pit' | 'water' | null {
  const c = cellAt(level, col, row);
  if (!c) return null;
  if (c.kind === 'pit') return 'pit';
  if (c.kind === 'water') return 'water';
  return null;
}
