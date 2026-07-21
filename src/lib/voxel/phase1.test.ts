import { describe, it, expect } from 'vitest';
import { deriveSeed, hash3i, hashUnit3, mulberry32 } from './seed.ts';
import { CoordinateConverter, floorDiv, mod } from './coords.ts';
import { VoxelChunk } from './chunk.ts';
import { NoiseProvider } from './noise.ts';
import { makeCaveConfig, validateCaveConfig, canCarve, DEFAULT_CAVE_CONFIG } from './config.ts';
import { Block } from './types.ts';

describe('seed hashing', () => {
  it('is deterministic and handles negative coordinates', () => {
    expect(hash3i(-5, 12, -1000, 42)).toBe(hash3i(-5, 12, -1000, 42));
    expect(hashUnit3(-5, 12, -1000, 42)).toBeGreaterThanOrEqual(0);
    expect(hashUnit3(-5, 12, -1000, 42)).toBeLessThan(1);
  });
  it('different coords / salts give different hashes', () => {
    expect(hash3i(1, 2, 3, 0)).not.toBe(hash3i(1, 2, 4, 0));
    expect(hash3i(1, 2, 3, 0)).not.toBe(hash3i(1, 2, 3, 1));
  });
  it('derives distinct independent sub-seeds', () => {
    const s = 12345;
    const a = deriveSeed(s, 'caves');
    const b = deriveSeed(s, 'tunnels');
    expect(a).not.toBe(b);
    expect(deriveSeed(s, 'caves')).toBe(a); // stable
  });
  it('mulberry32 is a stable stream', () => {
    const r1 = mulberry32(7);
    const r2 = mulberry32(7);
    expect(r1()).toBe(r2());
    expect(r1()).toBe(r2());
  });
});

describe('coordinate conversion (negatives)', () => {
  it('floorDiv / mod are correct for negatives', () => {
    expect(floorDiv(-1, 32)).toBe(-1);
    expect(mod(-1, 32)).toBe(31);
    expect(floorDiv(-32, 32)).toBe(-1);
    expect(mod(-32, 32)).toBe(0);
  });
  it('round-trips world → chunk+local → world', () => {
    const cc = new CoordinateConverter(32, 32, 32);
    for (const [wx, wy, wz] of [[-1, -1, -1], [0, 0, 0], [33, -33, 100], [-100, 5, -5]]) {
      const c = cc.worldToChunk(wx, wy, wz);
      const l = cc.worldToLocal(wx, wy, wz);
      const w = cc.localToWorld(c, l.x, l.y, l.z);
      expect([w.x, w.y, w.z]).toEqual([wx, wy, wz]);
    }
  });
});

describe('VoxelChunk', () => {
  it('stores + reads voxels and tracks dirty bounds', () => {
    const chunk = new VoxelChunk({ cx: -1, cy: 0, cz: 2 }, 32, 32, 32, Block.STONE);
    expect(chunk.get(1, 2, 3)).toBe(Block.STONE);
    expect(chunk.isDirty()).toBe(false);
    chunk.set(1, 2, 3, Block.AIR);
    expect(chunk.get(1, 2, 3)).toBe(Block.AIR);
    expect(chunk.dirtyBounds()).toEqual({ min: { x: 1, y: 2, z: 3 }, max: { x: 1, y: 2, z: 3 } });
    expect(chunk.origin).toEqual({ x: -32, y: 0, z: 64 });
  });
  it('ignores out-of-bounds access', () => {
    const chunk = new VoxelChunk({ cx: 0, cy: 0, cz: 0 }, 8, 8, 8);
    expect(chunk.get(-1, 0, 0, 99)).toBe(99);
    chunk.set(100, 0, 0, Block.STONE); // no throw
    expect(chunk.isDirty()).toBe(false);
  });
});

describe('NoiseProvider', () => {
  it('is deterministic per seed and varies by seed', () => {
    const a = new NoiseProvider(1);
    const b = new NoiseProvider(1);
    const c = new NoiseProvider(2);
    let sameAB = true;
    let diffAC = 0;
    for (let i = 0; i < 50; i++) {
      const x = i * 0.7 + 0.3, y = i * 1.1 + 0.6, z = i * 0.4 + 0.9;
      if (a.perlin3(x, y, z) !== b.perlin3(x, y, z)) sameAB = false;
      if (a.perlin3(x, y, z) !== c.perlin3(x, y, z)) diffAC++;
    }
    expect(sameAB).toBe(true); // identical seed → identical field
    expect(diffAC).toBeGreaterThan(20); // different seed → different field
  });
  it('fbm stays within a sane range', () => {
    const n = new NoiseProvider(9);
    for (let i = 0; i < 200; i++) {
      const v = n.fbm3(i * 0.7, i * 1.3, i * 0.2, { frequency: 0.05, octaves: 4, lacunarity: 2, persistence: 0.5 });
      expect(v).toBeGreaterThanOrEqual(-1.2);
      expect(v).toBeLessThanOrEqual(1.2);
    }
  });
});

describe('CaveConfig', () => {
  it('accepts the defaults', () => {
    expect(() => validateCaveConfig(DEFAULT_CAVE_CONFIG)).not.toThrow();
  });
  it('rejects invalid values', () => {
    expect(() => makeCaveConfig({ minTunnelRadius: -1 })).toThrow();
    expect(() => makeCaveConfig({ minTunnelLength: 200, maxTunnelLength: 10 })).toThrow();
    expect(() => makeCaveConfig({ tunnelSpawnChance: 2 })).toThrow();
    expect(() => makeCaveConfig({ noiseOctaves: 0 })).toThrow();
  });
  it('protects configured blocks from carving', () => {
    const c = makeCaveConfig();
    expect(canCarve(c, Block.STONE)).toBe(true);
    expect(canCarve(c, Block.BEDROCK)).toBe(false);
    expect(canCarve(c, Block.AIR)).toBe(false);
  });
});
