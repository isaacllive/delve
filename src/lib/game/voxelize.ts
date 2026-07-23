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
import { fillsColumn, type TerrainKind } from './terrain.ts';

/** Bottom / top of the rock volume in world Y (one voxel = one unit). */
export const VOX_BASE = -3;
export const VOX_TOP = 15;
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
  DEEP_WATER: 8,
  LAVA: 9,
  BOG: 10,
  WEB: 11,
  LICHEN: 12,
  BRIDGE: 13,
} as const;

/**
 * Which voxel surface a terrain kind paints. Mirrors `TERRAIN_PROPS` one-for-one
 * — `Record<TerrainKind, …>` makes a missing row a compile error, so a new
 * terrain kind can never ship invisible.
 */
const SURFACE_KIND: Record<TerrainKind, number> = {
  floor: Kind.FLOOR,
  wall: Kind.WALL,
  ledge: Kind.LEDGE,
  pit: Kind.PIT,
  water: Kind.WATER,
  deepWater: Kind.DEEP_WATER,
  lava: Kind.LAVA,
  bog: Kind.BOG,
  web: Kind.WEB,
  lichen: Kind.LICHEN,
  bridge: Kind.BRIDGE,
  // An unfound secret door is wall rock in the mesh too (it fills its column,
  // like `wall`), so the geometry never gives it away. Revealing one replaces
  // the cell with plain floor, so this surface is only a fallback.
  secretDoor: Kind.WALL,
  grass: Kind.FLOOR,
  gate: Kind.FLOOR,
  stairsDown: Kind.STAIRS,
  stairsUp: Kind.STAIRS,
};

/**
 * Colours for the terrain kinds whose material does NOT vary by biome — molten
 * rock is orange in every zone, silk is pale everywhere.
 *
 * They live here rather than in `BiomePalette` on purpose: adding fields to the
 * palette means editing every sub-biome in biomes.ts (a file this workstream
 * doesn't own) to restate the same colour ten times. A later pass can promote
 * any of these to the palette if a biome genuinely wants its own shade.
 */
const LAVA_COLOR = 0xff5a1e;
const BOG_COLOR = 0x4a3a24;
const WEB_COLOR = 0xd8d8d0;
const LICHEN_COLOR = 0x6f9a4a;
const BRIDGE_COLOR = 0x7a5a34;
/** Deep water is the biome's water darkened toward black — same body of water,
 *  read as depth rather than as a different liquid. */
const DEEP_WATER_DARKEN = 0.55;

function darken(hex: number, factor: number): number {
  const r = Math.round(((hex >> 16) & 255) * factor);
  const g = Math.round(((hex >> 8) & 255) * factor);
  const b = Math.round((hex & 255) * factor);
  return (r << 16) | (g << 8) | b;
}

/** Base colour for a voxel kind from the level's biome palette (0..1 RGB). */
export function colorForKind(palette: BiomePalette, kind: number): [number, number, number] {
  let hex: number;
  switch (kind) {
    case Kind.WALL: hex = palette.wall; break;
    case Kind.LEDGE: hex = palette.ledge; break;
    case Kind.PIT: hex = palette.pit; break;
    case Kind.WATER: hex = palette.water; break;
    case Kind.DEEP_WATER: hex = darken(palette.water, DEEP_WATER_DARKEN); break;
    case Kind.LAVA: hex = LAVA_COLOR; break;
    case Kind.BOG: hex = BOG_COLOR; break;
    case Kind.WEB: hex = WEB_COLOR; break;
    case Kind.LICHEN: hex = LICHEN_COLOR; break;
    case Kind.BRIDGE: hex = BRIDGE_COLOR; break;
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
      // Solid rock fills its whole column — walls, and the secret doors that
      // imitate them, so the mesh never gives an unfound door away.
      if (fillsColumn(cell.kind)) {
        for (let y = 0; y < SIZE_Y; y++) chunk.set(col, y, row, Kind.WALL);
        continue;
      }
      // Floor mass: the topmost solid voxel's TOP FACE sits at the cell's
      // elevation, so the surface you see is where the avatar stands.
      const surfaceLayer = clampLayer(Math.round(cell.elevation)) - 1;
      for (let y = 0; y <= surfaceLayer; y++) {
        chunk.set(col, y, row, y === surfaceLayer ? SURFACE_KIND[cell.kind] : Kind.ROCK);
      }
      // Roof mass: solid from the ceiling up (its underside sits at ceiling).
      const ceilLayer = clampLayer(Math.round(cell.ceiling ?? VOX_TOP - 2));
      for (let y = ceilLayer; y < SIZE_Y; y++) chunk.set(col, y, row, Kind.ROCK);
    }
  }
  return chunk;
}
