// Reference base terrain: a simple heightmap of solid rock the caves carve
// into. A host engine can replace this wholesale — the cave system only needs
// carveable solid blocks and a protected bedrock floor. Deterministic over
// world X/Z from an independent terrain seed.

import type { CaveConfig } from './config.ts';
import type { VoxelChunk } from './chunk.ts';
import type { NoiseProvider } from './noise.ts';
import { Block } from './types.ts';

export interface TerrainOptions {
  /** Average surface height (world Y). */
  surfaceLevel: number;
  /** Vertical amplitude of the rolling surface. */
  amplitude: number;
  /** Horizontal noise frequency. */
  frequency: number;
  /** Bedrock floor thickness above minCaveY. */
  bedrockDepth: number;
}

export const DEFAULT_TERRAIN: TerrainOptions = {
  surfaceLevel: 24,
  amplitude: 14,
  frequency: 0.01,
  bedrockDepth: 3,
};

export class BaseTerrainGenerator {
  constructor(
    private readonly noise: NoiseProvider,
    private readonly config: CaveConfig,
    private readonly opts: TerrainOptions = DEFAULT_TERRAIN,
  ) {}

  /** Solid surface height at a world column. */
  surfaceHeight(wx: number, wz: number): number {
    const o = this.opts;
    const n = this.noise.fbm3(wx * o.frequency, 0, wz * o.frequency, {
      frequency: 1,
      octaves: 4,
      lacunarity: 2,
      persistence: 0.5,
    });
    return Math.round(o.surfaceLevel + n * o.amplitude);
  }

  /** Fill a chunk with base terrain (bedrock floor / stone / dirt / grass / air). */
  fill(chunk: VoxelChunk): void {
    const floor = this.config.minCaveY + this.opts.bedrockDepth;
    for (let lz = 0; lz < chunk.sizeZ; lz++) {
      for (let lx = 0; lx < chunk.sizeX; lx++) {
        const wx = chunk.origin.x + lx;
        const wz = chunk.origin.z + lz;
        const surface = this.surfaceHeight(wx, wz);
        for (let ly = 0; ly < chunk.sizeY; ly++) {
          const wy = chunk.origin.y + ly;
          let block: number;
          if (wy < floor) block = Block.BEDROCK;
          else if (wy > surface) block = Block.AIR;
          else if (wy === surface) block = Block.GRASS;
          else if (wy > surface - 4) block = Block.DIRT;
          else if (wy < this.config.minCaveY + 40) block = Block.DEEP_STONE;
          else block = Block.STONE;
          if (block !== Block.AIR) chunk.set(lx, ly, lz, block);
        }
      }
    }
    chunk.clearDirty();
  }
}
