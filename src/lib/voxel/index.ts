// Public API for the voxel cave generator. Import from here; the internal
// modules are implementation detail.

export * from './types.ts';
export { CoordinateConverter, floorDiv, mod } from './coords.ts';
export { VoxelChunk } from './chunk.ts';
export { NoiseProvider, type FbmOptions } from './noise.ts';
export {
  type CaveConfig,
  DEFAULT_CAVE_CONFIG,
  makeCaveConfig,
  validateCaveConfig,
  canCarve,
  depthFactor,
  caveThresholdAt,
} from './config.ts';
export { BaseTerrainGenerator, DEFAULT_TERRAIN, type TerrainOptions } from './terrain.ts';
export { CaveDensityGenerator } from './density.ts';
export { TunnelCarver } from './tunnels.ts';
export { CavernCarver } from './caverns.ts';
export { CavePostProcessor } from './postprocess.ts';
export { CaveGenerationPipeline } from './pipeline.ts';
export {
  deriveSeed,
  hashString,
  hash3i,
  hashUnit3,
  mulberry32,
} from './seed.ts';
export { hashChunk, countAir, asciiSliceXZ, asciiSliceXY } from './debug.ts';
export { meshChunk, type MeshData, type ColorOf } from './mesher.ts';
