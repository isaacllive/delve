// Coordinates the generation stages for one chunk. This class only sequences
// stages + owns the derived sub-seeds; it contains no cave math itself and no
// rendering. Meshing is the caller's concern (kept fully separate).

import type { ChunkCoord } from './types.ts';
import type { CaveConfig } from './config.ts';
import { canCarve, makeCaveConfig, validateCaveConfig } from './config.ts';
import { deriveSeed, hashString } from './seed.ts';
import { NoiseProvider } from './noise.ts';
import { VoxelChunk } from './chunk.ts';
import { BaseTerrainGenerator, type TerrainOptions } from './terrain.ts';
import { CaveDensityGenerator } from './density.ts';
import { TunnelCarver } from './tunnels.ts';
import { CavernCarver } from './caverns.ts';
import { CavePostProcessor } from './postprocess.ts';

export class CaveGenerationPipeline {
  readonly worldSeed: number;
  private readonly terrain: BaseTerrainGenerator;
  private readonly density: CaveDensityGenerator;
  private readonly tunnels: TunnelCarver;
  private readonly caverns: CavernCarver;
  private readonly post: CavePostProcessor;

  constructor(
    worldSeed: number | string,
    readonly config: CaveConfig = makeCaveConfig(),
    terrainOpts?: TerrainOptions,
  ) {
    validateCaveConfig(config);
    this.worldSeed = typeof worldSeed === 'string' ? hashString(worldSeed) : worldSeed >>> 0;

    this.terrain = new BaseTerrainGenerator(
      new NoiseProvider(deriveSeed(this.worldSeed, 'terrain')),
      config,
      terrainOpts,
    );
    this.density = new CaveDensityGenerator(new NoiseProvider(deriveSeed(this.worldSeed, 'caves')), config);
    this.tunnels = new TunnelCarver(config, deriveSeed(this.worldSeed, 'tunnels'));
    this.caverns = new CavernCarver(
      config,
      new NoiseProvider(deriveSeed(this.worldSeed, 'cavernShape')),
      deriveSeed(this.worldSeed, 'caverns'),
    );
    this.post = new CavePostProcessor(config);
  }

  /** Generate one chunk's voxels. Pure w.r.t. (worldSeed, coord). */
  generateChunk(coord: ChunkCoord): VoxelChunk {
    const chunk = new VoxelChunk(coord, this.config.chunkSizeX, this.config.chunkSizeY, this.config.chunkSizeZ);
    this.terrain.fill(chunk);
    this.carveDensity(chunk);
    this.tunnels.carveChunk(chunk);
    this.caverns.carveChunk(chunk);
    this.post.process(chunk);
    return chunk;
  }

  /** Chunk-independent voxel at a world position (terrain + all carvers, no
   *  post-processing). Both neighbouring chunks agree with this — the basis of
   *  the border-seamlessness test. */
  sampleSolid(wx: number, wy: number, wz: number): number {
    const c = this.config;
    const surface = this.terrain.surfaceHeight(wx, wz);
    const block = this.terrain.blockAt(wy, surface);
    if (!canCarve(c, block)) return block;
    if (
      (wy >= c.minCaveY && wy <= c.maxCaveY && this.density.isCaveAt(wx, wy, wz)) ||
      this.tunnels.isCaveAt(wx, wy, wz) ||
      this.caverns.isCaveAt(wx, wy, wz)
    ) {
      return c.airBlock;
    }
    return block;
  }

  /** Remove stone where the continuous density field says "cave". */
  private carveDensity(chunk: VoxelChunk): void {
    const c = this.config;
    for (let ly = 0; ly < chunk.sizeY; ly++) {
      const wy = chunk.origin.y + ly;
      if (wy < c.minCaveY || wy > c.maxCaveY) continue;
      for (let lz = 0; lz < chunk.sizeZ; lz++) {
        const wz = chunk.origin.z + lz;
        for (let lx = 0; lx < chunk.sizeX; lx++) {
          const block = chunk.get(lx, ly, lz);
          if (!canCarve(c, block)) continue;
          if (this.density.isCaveAt(chunk.origin.x + lx, wy, wz)) {
            chunk.set(lx, ly, lz, c.airBlock);
          }
        }
      }
    }
  }
}
