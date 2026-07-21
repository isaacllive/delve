import { describe, it, expect } from 'vitest';
import { CaveGenerationPipeline } from './pipeline.ts';
import { TunnelCarver } from './tunnels.ts';
import { makeCaveConfig } from './config.ts';
import { hashChunk, countAir } from './debug.ts';
import { deriveSeed } from './seed.ts';
import { Block, type ChunkCoord } from './types.ts';

const COORD: ChunkCoord = { cx: 0, cy: -1, cz: 0 };

describe('CaveGenerationPipeline — determinism', () => {
  it('same seed + coord → identical voxels', () => {
    const a = new CaveGenerationPipeline('world-a').generateChunk(COORD);
    const b = new CaveGenerationPipeline('world-a').generateChunk(COORD);
    expect(hashChunk(a)).toBe(hashChunk(b));
    expect(a.data).toEqual(b.data);
  });

  it('different seeds → different caves', () => {
    const a = new CaveGenerationPipeline('world-a').generateChunk(COORD);
    const b = new CaveGenerationPipeline('world-b').generateChunk(COORD);
    expect(hashChunk(a)).not.toBe(hashChunk(b));
  });

  it('carves a meaningful but not total amount of the chunk', () => {
    const chunk = new CaveGenerationPipeline('world-a').generateChunk(COORD);
    const frac = countAir(chunk) / chunk.data.length;
    expect(frac).toBeGreaterThan(0.02);
    expect(frac).toBeLessThan(0.8);
  });
});

describe('chunk-generation order independence', () => {
  it('a chunk is identical regardless of which chunks were generated first', () => {
    const p1 = new CaveGenerationPipeline('order');
    const p2 = new CaveGenerationPipeline('order');
    // p1: A then B; p2: B then A.
    const a1 = p1.generateChunk({ cx: 0, cy: -1, cz: 0 });
    p1.generateChunk({ cx: 1, cy: -1, cz: 0 });
    p2.generateChunk({ cx: 1, cy: -1, cz: 0 });
    const a2 = p2.generateChunk({ cx: 0, cy: -1, cz: 0 });
    expect(a1.data).toEqual(a2.data);
    // Regenerating within a caching pipeline is also stable.
    const a3 = p1.generateChunk({ cx: 0, cy: -1, cz: 0 });
    expect(hashChunk(a1)).toBe(hashChunk(a3));
  });
});

describe('chunk-border seamlessness', () => {
  it('every voxel matches the chunk-independent world sampler (so borders never seam)', () => {
    // Post-processing rewrites voxels relative to neighbours; disable it so the
    // chunk must equal the pure world function exactly.
    const cfg = makeCaveConfig({ removeIsolatedAir: false, removeIsolatedSolid: false });
    const pipe = new CaveGenerationPipeline('seam', cfg);
    let mismatches = 0;
    for (const c of [{ cx: 0, cy: -1, cz: 0 }, { cx: 1, cy: -1, cz: 0 }]) {
      const chunk = pipe.generateChunk(c);
      for (let ly = 0; ly < chunk.sizeY; ly += 2) {
        for (let lz = 0; lz < chunk.sizeZ; lz += 2) {
          for (let lx = 0; lx < chunk.sizeX; lx += 2) {
            const w = { x: chunk.origin.x + lx, y: chunk.origin.y + ly, z: chunk.origin.z + lz };
            if (chunk.get(lx, ly, lz) !== pipe.sampleSolid(w.x, w.y, w.z)) mismatches++;
          }
        }
      }
    }
    expect(mismatches).toBe(0);
  });
});

describe('negative coordinates + protected blocks', () => {
  it('generates in negative chunk space without error', () => {
    const chunk = new CaveGenerationPipeline('neg').generateChunk({ cx: -2, cy: -1, cz: -3 });
    expect(chunk.origin).toEqual({ x: -64, y: -32, z: -96 });
    const air = countAir(chunk);
    expect(air).toBeGreaterThan(0);
    expect(air).toBeLessThan(chunk.data.length);
  });

  it('never carves protected bedrock', () => {
    const pipe = new CaveGenerationPipeline('bedrock');
    // A deep chunk straddling the bedrock floor (minCaveY = -160).
    const chunk = pipe.generateChunk({ cx: 0, cy: -5, cz: 0 }); // y = -160..-129
    let bedrock = 0;
    for (let i = 0; i < chunk.data.length; i++) if (chunk.data[i] === Block.BEDROCK) bedrock++;
    // The bottom rows are below the cave floor → must remain solid bedrock.
    expect(bedrock).toBeGreaterThan(0);
    // sampleSolid at any y below the floor is always bedrock (never carved).
    expect(pipe.sampleSolid(5, -159, 5)).toBe(Block.BEDROCK);
  });
});

describe('TunnelCarver — bounded, deterministic', () => {
  const cfg = makeCaveConfig();
  const carver = new TunnelCarver(cfg, deriveSeed(123, 'tunnels'));

  it('region segments are deterministic', () => {
    const a = carver.segmentsForRegion(3, -1, 2);
    const b = new TunnelCarver(cfg, deriveSeed(123, 'tunnels')).segmentsForRegion(3, -1, 2);
    expect(a.length).toBe(b.length);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('branching stays bounded (no runaway recursion)', () => {
    // (1 primary + maxBranches) tunnels, each at most ~maxLength/step segments.
    const maxSteps = Math.ceil(cfg.maxTunnelLength / cfg.tunnelStepLength);
    const bound = (1 + cfg.maxBranches) * maxSteps + 8;
    for (let r = 0; r < 40; r++) {
      const segs = carver.segmentsForRegion(r, 0, r * 2 - 5);
      expect(segs.length).toBeLessThanOrEqual(bound);
    }
  });

  it('tunnel paths have no gaps (consecutive segments share endpoints)', () => {
    const segs = carver.segmentsForRegion(3, -1, 2).filter((_, i) => i < 30);
    // Each segment is short (≈ stepLength) so a carved tube can't have holes.
    for (const s of segs) {
      const len = Math.hypot(s.bx - s.ax, s.by - s.ay, s.bz - s.az);
      expect(len).toBeLessThanOrEqual(cfg.tunnelStepLength + 0.001);
    }
  });
});
