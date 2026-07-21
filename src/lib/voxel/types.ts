// Shared voxel types. Kept dependency-free and rendering-agnostic — this whole
// module emits voxel DATA; nothing here knows about Three.js or the game.

export type Voxel = number;

/** Built-in block ids used by the reference terrain + carver. A host engine can
 *  map these onto its own block set; the generator only needs "solid vs air"
 *  plus a protected-block predicate (see CaveConfig). */
export const Block = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  GRASS: 3,
  BEDROCK: 4,
  WATER: 5,
  MOSS: 6,
  DEEP_STONE: 7,
} as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ChunkCoord {
  cx: number;
  cy: number;
  cz: number;
}

/** Integer axis-aligned box in world space (inclusive min, exclusive max). */
export interface Box3 {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}
