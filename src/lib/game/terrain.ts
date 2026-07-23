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
  | 'grass'
  | 'gate' // a vault portcullis: blocks movement (until a lever opens it), but
  // you can see through the bars to the reward behind
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

// ── the terrain kind registry ────────────────────────────────────────────────
// ONE row per kind, and every derived question below (default elevation, does it
// block movement, does it occlude sight, is entering it a hazard, does it burn)
// is answered by reading this table. Previously each of those lived in its own
// per-kind `switch`/`Set`, so adding a terrain kind meant finding all five and
// risking a silent default. Adding a kind is now a single row — which is what
// makes the terrain-breadth work (deep water, lava, chasm, bog, webs, bridges;
// gap G13) additive instead of a five-way diff.

/** How a kind blocks sight: `full` = wall-tall regardless of elevation,
 *  `height` = occludes up to its own (positive) elevation, `none` = never. */
export type OccluderMode = 'full' | 'height' | 'none';

export interface TerrainProps {
  /** Default elevation of a freshly-made cell of this kind. */
  elevation: number;
  /** Blocks a walker from entering (walls, closed gates). */
  blocksMove: boolean;
  /** How this kind occludes line of sight. */
  occluder: OccluderMode;
  /** Entering it is a fall/dunk event the move handler resolves, not a block. */
  entryHazard: 'pit' | 'water' | null;
  /** Fire can ignite, spread through, and consume it (burns away to floor). */
  flammable: boolean;
}

export const TERRAIN_PROPS: Record<TerrainKind, TerrainProps> = {
  floor: { elevation: 0, blocksMove: false, occluder: 'height', entryHazard: null, flammable: false },
  wall: { elevation: WALL_HEIGHT, blocksMove: true, occluder: 'full', entryHazard: null, flammable: false },
  pit: { elevation: PIT_DEPTH, blocksMove: false, occluder: 'height', entryHazard: 'pit', flammable: false },
  water: { elevation: WATER_DEPTH, blocksMove: false, occluder: 'height', entryHazard: 'water', flammable: false },
  ledge: { elevation: LEDGE_HEIGHT, blocksMove: false, occluder: 'height', entryHazard: null, flammable: false },
  // Groundcover: walkable and sightless, but it BURNS — the fuel the fire
  // simulation (hazards.ts) spreads through.
  grass: { elevation: 0, blocksMove: false, occluder: 'height', entryHazard: null, flammable: true },
  // A vault portcullis: blocks movement like a wall until its lever is pulled
  // (the server swaps it to floor), but sits at elevation 0 so you can see
  // through the bars to the reward behind.
  gate: { elevation: 0, blocksMove: true, occluder: 'height', entryHazard: null, flammable: false },
  stairsDown: { elevation: 0, blocksMove: false, occluder: 'height', entryHazard: null, flammable: false },
  stairsUp: { elevation: 0, blocksMove: false, occluder: 'height', entryHazard: null, flammable: false },
};

/** Canonical cell for a kind (its default elevation). */
export function makeCell(kind: TerrainKind): TerrainCell {
  return { kind, elevation: TERRAIN_PROPS[kind].elevation };
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
  return TERRAIN_PROPS[c.kind].blocksMove;
}

/** Occluder height at a cell for sight. 0 == not an occluder. Walls stand
 *  WALL_HEIGHT tall; raised ledges occlude up to their own elevation (so a
 *  higher viewer sees over them); floors/pits/water don't occlude. */
export function occluderHeight(level: Level, col: number, row: number): number {
  const c = cellAt(level, col, row);
  if (!c) return WALL_HEIGHT; // treat off-map as solid
  const mode = TERRAIN_PROPS[c.kind].occluder;
  if (mode === 'full') return WALL_HEIGHT;
  if (mode === 'none') return 0;
  // 'height': raised ledges/platforms occlude up to their own elevation, so a
  // higher viewer sees over them. Sunken cells (pits/water) never occlude.
  return c.elevation > 0 ? c.elevation : 0;
}

/** Is entering this cell a hazard (a fall / dunk)? */
export function hazardAt(level: Level, col: number, row: number): 'pit' | 'water' | null {
  const c = cellAt(level, col, row);
  return c ? TERRAIN_PROPS[c.kind].entryHazard : null;
}

// ── flammability (fuel for the fire simulation, hazards.ts) ──────────────────

/** The `flammable` flag for a terrain kind — can fire catch here? */
export function isFlammableKind(kind: TerrainKind): boolean {
  return TERRAIN_PROPS[kind].flammable;
}

/** Is the cell at (col,row) flammable fuel? Out-of-bounds is not. */
export function isFlammable(level: Level, col: number, row: number): boolean {
  const c = cellAt(level, col, row);
  return c ? isFlammableKind(c.kind) : false;
}
