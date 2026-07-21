// Continuous 3D cave-density field. Produces winding "spaghetti" tunnels from
// the intersection of two warped noise fields (both near zero → cave), squashed
// vertically so caves run mostly horizontal, with a depth-dependent threshold.
// Pure over world coordinates → seamless across chunks by construction.

import type { CaveConfig } from './config.ts';
import { caveThresholdAt } from './config.ts';
import type { NoiseProvider } from './noise.ts';
import type { FbmOptions } from './noise.ts';

export class CaveDensityGenerator {
  private readonly fbm: FbmOptions;

  constructor(
    private readonly noise: NoiseProvider,
    private readonly config: CaveConfig,
  ) {
    this.fbm = {
      frequency: config.baseNoiseFrequency,
      octaves: config.noiseOctaves,
      lacunarity: config.noiseLacunarity,
      persistence: config.noisePersistence,
    };
  }

  /** True when the world voxel is carved cave-air by the density field. */
  isCaveAt(wx: number, wy: number, wz: number): boolean {
    const c = this.config;
    if (wy < c.minCaveY || wy > c.maxCaveY) return false;

    // Domain-warp in world space for organic, non-grid-aligned shapes.
    const [x, y, z] = this.noise.warp(wx, wy, wz, c.warpStrength, c.warpNoiseFrequency);
    const ys = y * c.verticalSquash;

    // Two decorrelated fields; a cave tube forms where BOTH are near zero.
    const n1 = this.noise.fbm3(x, ys, z, this.fbm);
    const n2 = this.noise.fbm3(x + 1013.5, ys + 517.9, z - 733.1, this.fbm);
    const tube = n1 * n1 + n2 * n2;

    // Small high-frequency wobble on the tube radius (surface modifier only).
    const detail =
      this.noise.perlin3(wx * c.detailNoiseFrequency, wy * c.detailNoiseFrequency, wz * c.detailNoiseFrequency) *
      c.detailStrength;

    const threshold = caveThresholdAt(c, wy) + detail;
    return tube < threshold;
  }
}
