// Central, validated configuration for the whole cave system. Every tunable
// lives here (no scattered magic numbers), and `validateCaveConfig` rejects
// nonsensical values up front.

import { Block, type Voxel } from './types.ts';

export interface CaveConfig {
  // Chunk dimensions (voxels).
  chunkSizeX: number;
  chunkSizeY: number;
  chunkSizeZ: number;

  // Vertical band caves may occupy (world Y).
  minCaveY: number;
  maxCaveY: number;

  // Density noise.
  baseNoiseFrequency: number;
  detailNoiseFrequency: number;
  warpNoiseFrequency: number;
  warpStrength: number;
  noiseOctaves: number;
  noisePersistence: number;
  noiseLacunarity: number;
  /** Vertical frequency multiplier (<1 → longer horizontal caves). */
  verticalSquash: number;

  // Density "spaghetti" tube thresholds by depth (tube radius in noise space).
  shallowCaveThreshold: number;
  deepCaveThreshold: number;
  /** Detail noise wobble added to the surface (kept small so it doesn't dominate). */
  detailStrength: number;

  // Tunnels (region-based, world-space).
  tunnelRegionSize: number;
  tunnelSpawnChance: number;
  minTunnelLength: number;
  maxTunnelLength: number;
  minTunnelRadius: number;
  maxTunnelRadius: number;
  tunnelStepLength: number;
  /** Vertical radius = horizontal radius * this (<1 → wider than tall). */
  tunnelVerticalScale: number;
  /** Max |dy/step| for a tunnel direction (limits extreme slopes). */
  maxTunnelSlope: number;
  directionJitter: number;
  verticalBias: number;

  // Branching.
  branchChance: number;
  maxBranches: number;
  maxBranchDepth: number;
  branchLengthScale: number;
  branchRadiusScale: number;

  // Caverns.
  cavernRegionSize: number;
  cavernChance: number;
  minCavernRadius: number;
  maxCavernRadius: number;
  cavernVerticalScale: number;

  // Surface openings (0 disables).
  surfaceOpeningChance: number;

  // Post-processing.
  removeIsolatedAir: boolean;
  removeIsolatedSolid: boolean;

  // Carving rules.
  /** Block ids that must never be carved (bedrock, structures, …). */
  protectedBlocks: Voxel[];
  /** Block written where carving succeeds. */
  airBlock: Voxel;
}

export const DEFAULT_CAVE_CONFIG: CaveConfig = {
  chunkSizeX: 32,
  chunkSizeY: 32,
  chunkSizeZ: 32,

  minCaveY: -160,
  maxCaveY: 40,

  baseNoiseFrequency: 0.02,
  detailNoiseFrequency: 0.08,
  warpNoiseFrequency: 0.03,
  warpStrength: 8,
  noiseOctaves: 3,
  noisePersistence: 0.5,
  noiseLacunarity: 2,
  verticalSquash: 0.65,

  shallowCaveThreshold: 0.06,
  deepCaveThreshold: 0.12,
  detailStrength: 0.03,

  tunnelRegionSize: 48,
  tunnelSpawnChance: 0.65,
  minTunnelLength: 40,
  maxTunnelLength: 120,
  minTunnelRadius: 1.6,
  maxTunnelRadius: 4.0,
  tunnelStepLength: 2.0,
  tunnelVerticalScale: 0.7,
  maxTunnelSlope: 0.6,
  directionJitter: 0.4,
  verticalBias: -0.1,

  branchChance: 0.25,
  maxBranches: 3,
  maxBranchDepth: 2,
  branchLengthScale: 0.6,
  branchRadiusScale: 0.7,

  cavernRegionSize: 96,
  cavernChance: 0.4,
  minCavernRadius: 5,
  maxCavernRadius: 12,
  cavernVerticalScale: 0.6,

  surfaceOpeningChance: 0.08,

  removeIsolatedAir: true,
  removeIsolatedSolid: true,

  protectedBlocks: [Block.BEDROCK],
  airBlock: Block.AIR,
};

/** Throw on invalid configuration (called once at pipeline construction). */
export function validateCaveConfig(c: CaveConfig): void {
  const err: string[] = [];
  const positive = (v: number, n: string) => {
    if (!(v > 0)) err.push(`${n} must be > 0 (got ${v})`);
  };
  const prob = (v: number, n: string) => {
    if (v < 0 || v > 1) err.push(`${n} must be within 0..1 (got ${v})`);
  };
  const range = (lo: number, hi: number, n: string) => {
    if (lo > hi) err.push(`${n} min (${lo}) must be ≤ max (${hi})`);
  };

  positive(c.chunkSizeX, 'chunkSizeX');
  positive(c.chunkSizeY, 'chunkSizeY');
  positive(c.chunkSizeZ, 'chunkSizeZ');
  range(c.minCaveY, c.maxCaveY, 'caveY');

  positive(c.baseNoiseFrequency, 'baseNoiseFrequency');
  if (!Number.isInteger(c.noiseOctaves) || c.noiseOctaves < 1 || c.noiseOctaves > 8) {
    err.push(`noiseOctaves must be an integer in 1..8 (got ${c.noiseOctaves})`);
  }
  positive(c.noiseLacunarity, 'noiseLacunarity');
  prob(c.noisePersistence, 'noisePersistence');
  positive(c.verticalSquash, 'verticalSquash');

  positive(c.tunnelRegionSize, 'tunnelRegionSize');
  prob(c.tunnelSpawnChance, 'tunnelSpawnChance');
  range(c.minTunnelLength, c.maxTunnelLength, 'tunnelLength');
  range(c.minTunnelRadius, c.maxTunnelRadius, 'tunnelRadius');
  positive(c.minTunnelRadius, 'minTunnelRadius');
  positive(c.tunnelStepLength, 'tunnelStepLength');
  positive(c.tunnelVerticalScale, 'tunnelVerticalScale');

  prob(c.branchChance, 'branchChance');
  if (!Number.isInteger(c.maxBranches) || c.maxBranches < 0) err.push('maxBranches must be a non-negative integer');
  if (!Number.isInteger(c.maxBranchDepth) || c.maxBranchDepth < 0) err.push('maxBranchDepth must be a non-negative integer');

  positive(c.cavernRegionSize, 'cavernRegionSize');
  prob(c.cavernChance, 'cavernChance');
  range(c.minCavernRadius, c.maxCavernRadius, 'cavernRadius');
  positive(c.minCavernRadius, 'minCavernRadius');

  prob(c.surfaceOpeningChance, 'surfaceOpeningChance');

  if (err.length) throw new Error('Invalid CaveConfig:\n  - ' + err.join('\n  - '));
}

/** Merge partial overrides onto the defaults. */
export function makeCaveConfig(overrides: Partial<CaveConfig> = {}): CaveConfig {
  const c = { ...DEFAULT_CAVE_CONFIG, ...overrides };
  validateCaveConfig(c);
  return c;
}

/** Depth 0 at maxCaveY → 1 at minCaveY. Drives depth-interpolated parameters. */
export function depthFactor(c: CaveConfig, worldY: number): number {
  const t = (c.maxCaveY - worldY) / (c.maxCaveY - c.minCaveY);
  return Math.max(0, Math.min(1, t));
}

/** Cave tube threshold, interpolated shallow→deep by depth (deeper = roomier). */
export function caveThresholdAt(c: CaveConfig, worldY: number): number {
  const t = depthFactor(c, worldY);
  return c.shallowCaveThreshold + (c.deepCaveThreshold - c.shallowCaveThreshold) * t;
}

const PROTECTED = Symbol('protected');
type WithCache = CaveConfig & { [PROTECTED]?: Set<Voxel> };

/** Whether a block may be carved: solid (non-air) and not protected. */
export function canCarve(c: CaveConfig, block: Voxel): boolean {
  const cc = c as WithCache;
  let set = cc[PROTECTED];
  if (!set) {
    set = new Set(c.protectedBlocks);
    cc[PROTECTED] = set;
  }
  return block !== c.airBlock && !set.has(block);
}
