// Bridges the 2D dungeon grid to the voxel engine: turns a DungeonLevel into a
// grid-aligned VoxelChunk so the renderer can draw the floor as a real
// face-culled voxel mesh. Gameplay stays 2D — the floor SURFACE sits exactly at
// the cell's elevation (where the avatar stands) and walls stay solid, so what
// you see matches where you can walk. Sub-cell blockiness comes from the height
// differences between cells (ledges, pits, walls, uneven quantized ceilings).

import { VoxelChunk } from '$lib/voxel/index.ts';
import { cellIndex } from './grid.ts';
import type { DungeonLevel } from './dungeon.ts';
import type { BiomePalette } from './biomes.ts';

/** Bottom / top of the rock volume in world Y (one voxel = one unit). */
export const VOX_BASE = -3;
export const VOX_TOP = 11;
const SIZE_Y = VOX_TOP - VOX_BASE;

/** Voxel kinds (non-zero = solid); map to biome palette colours. */
export const Kind = {
  AIR: 0,
  FLOOR: 1,
  WALL: 2,
  LEDGE: 3,
  PIT: 4,
  WATER: 5,
  STAIRS: 6,
  ROCK: 7,
} as const;

function surfaceKind(cellKind: string): number {
  switch (cellKind) {
    case 'wall': return Kind.WALL;
    case 'ledge': return Kind.LEDGE;
    case 'pit': return Kind.PIT;
    case 'water': return Kind.WATER;
    case 'stairsDown':
    case 'stairsUp': return Kind.STAIRS;
    default: return Kind.FLOOR;
  }
}

/** Base colour for a voxel kind from the level's biome palette (0..1 RGB). */
export function colorForKind(palette: BiomePalette, kind: number): [number, number, number] {
  let hex: number;
  switch (kind) {
    case Kind.WALL: hex = palette.wall; break;
    case Kind.LEDGE: hex = palette.ledge; break;
    case Kind.PIT: hex = palette.pit; break;
    case Kind.WATER: hex = palette.water; break;
    case Kind.STAIRS: hex = palette.stairsDown; break;
    case Kind.ROCK: hex = palette.rock; break;
    default: hex = palette.floor;
  }
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

const clampLayer = (y: number) => Math.max(0, Math.min(SIZE_Y - 1, y - VOX_BASE));

/** Voxelize a dungeon floor into a grid-aligned VoxelChunk (x=col, y=height,
 *  z=row). Air where you can walk; solid rock everywhere else. */
export function voxelizeLevel(level: DungeonLevel): VoxelChunk {
  const chunk = new VoxelChunk({ cx: 0, cy: 0, cz: 0 }, level.cols, SIZE_Y, level.rows);
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      const cell = level.cells[cellIndex(col, row, level.cols)];
      if (cell.kind === 'wall') {
        for (let y = 0; y < SIZE_Y; y++) chunk.set(col, y, row, Kind.WALL);
        continue;
      }
      // Floor mass: the topmost solid voxel's TOP FACE sits at the cell's
      // elevation, so the surface you see is where the avatar stands.
      const surfaceLayer = clampLayer(Math.round(cell.elevation)) - 1;
      for (let y = 0; y <= surfaceLayer; y++) {
        chunk.set(col, y, row, y === surfaceLayer ? surfaceKind(cell.kind) : Kind.ROCK);
      }
      // Roof mass: solid from the ceiling up (its underside sits at ceiling).
      const ceilLayer = clampLayer(Math.round(cell.ceiling ?? VOX_TOP - 2));
      for (let y = ceilLayer; y < SIZE_Y; y++) chunk.set(col, y, row, Kind.ROCK);
    }
  }
  return chunk;
}
