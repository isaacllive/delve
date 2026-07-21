// Larger rooms and chambers. Cavern centres live on their own (coarser) world
// region grid; each chunk queries nearby regions and carves the overlapping
// part of any noise-distorted ellipsoid. Same world-space determinism + border
// seamlessness as the tunnels.

import type { Box3, Voxel } from './types.ts';
import type { CaveConfig } from './config.ts';
import { canCarve } from './config.ts';
import { hash3i, mulberry32 } from './seed.ts';
import { floorDiv } from './coords.ts';
import type { NoiseProvider } from './noise.ts';
import type { VoxelChunk } from './chunk.ts';

interface Cavern {
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  vScale: number;
  box: Box3;
}

export class CavernCarver {
  private readonly cache = new Map<string, Cavern | null>();
  private readonly reach: number;

  constructor(
    private readonly config: CaveConfig,
    private readonly noise: NoiseProvider,
    private readonly seed: number,
  ) {
    this.reach = Math.ceil((config.maxCavernRadius * 1.4) / config.cavernRegionSize) + 1;
  }

  /** At most one cavern per region (or none). Memoized, deterministic. */
  cavernForRegion(rcx: number, rcy: number, rcz: number): Cavern | null {
    const key = `${rcx},${rcy},${rcz}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const cavern = this.generate(rcx, rcy, rcz);
    this.cache.set(key, cavern);
    return cavern;
  }

  private generate(rcx: number, rcy: number, rcz: number): Cavern | null {
    const c = this.config;
    const rand = mulberry32(hash3i(rcx, rcy, rcz, this.seed));
    if (rand() >= c.cavernChance) return null;
    const size = c.cavernRegionSize;
    const cx = rcx * size + rand() * size;
    let cy = rcy * size + rand() * size;
    const cz = rcz * size + rand() * size;
    const radius = c.minCavernRadius + rand() * (c.maxCavernRadius - c.minCavernRadius);
    cy = Math.max(c.minCaveY + radius, Math.min(c.maxCaveY - radius, cy));
    const vScale = c.cavernVerticalScale;
    const rExt = radius * 1.4;
    const rv = rExt * vScale;
    return {
      cx,
      cy,
      cz,
      radius,
      vScale,
      box: {
        minX: cx - rExt,
        minY: cy - rv,
        minZ: cz - rExt,
        maxX: cx + rExt,
        maxY: cy + rv,
        maxZ: cz + rExt,
      },
    };
  }

  /** Chunk-independent test: is this world voxel inside any cavern? */
  isCaveAt(wx: number, wy: number, wz: number): boolean {
    const size = this.config.cavernRegionSize;
    const rx0 = floorDiv(wx, size) - this.reach;
    const rx1 = floorDiv(wx, size) + this.reach;
    const ry0 = floorDiv(wy, size) - this.reach;
    const ry1 = floorDiv(wy, size) + this.reach;
    const rz0 = floorDiv(wz, size) - this.reach;
    const rz1 = floorDiv(wz, size) + this.reach;
    for (let rz = rz0; rz <= rz1; rz++) {
      for (let ry = ry0; ry <= ry1; ry++) {
        for (let rx = rx0; rx <= rx1; rx++) {
          const cav = this.cavernForRegion(rx, ry, rz);
          if (cav && this.contains(cav, wx, wy, wz)) return true;
        }
      }
    }
    return false;
  }

  private contains(cav: Cavern, wx: number, wy: number, wz: number): boolean {
    const dx = wx - cav.cx;
    const dy = wy - cav.cy;
    const dz = wz - cav.cz;
    const rv = cav.radius * cav.vScale;
    const norm = (dx * dx + dz * dz) / (cav.radius * cav.radius) + (dy * dy) / (rv * rv);
    const wobble = this.noise.perlin3(wx * 0.12, wy * 0.12, wz * 0.12) * 0.4;
    return norm <= 1 + wobble;
  }

  carveChunk(chunk: VoxelChunk): void {
    const c = this.config;
    const size = c.cavernRegionSize;
    const ox = chunk.origin.x;
    const oy = chunk.origin.y;
    const oz = chunk.origin.z;
    const chunkBox: Box3 = {
      minX: ox,
      minY: oy,
      minZ: oz,
      maxX: ox + chunk.sizeX,
      maxY: oy + chunk.sizeY,
      maxZ: oz + chunk.sizeZ,
    };
    const r0x = floorDiv(ox, size) - this.reach;
    const r1x = floorDiv(ox + chunk.sizeX, size) + this.reach;
    const r0y = floorDiv(oy, size) - this.reach;
    const r1y = floorDiv(oy + chunk.sizeY, size) + this.reach;
    const r0z = floorDiv(oz, size) - this.reach;
    const r1z = floorDiv(oz + chunk.sizeZ, size) + this.reach;

    for (let rz = r0z; rz <= r1z; rz++) {
      for (let ry = r0y; ry <= r1y; ry++) {
        for (let rx = r0x; rx <= r1x; rx++) {
          const cavern = this.cavernForRegion(rx, ry, rz);
          if (cavern && boxesOverlap(cavern.box, chunkBox)) this.carve(chunk, cavern, chunkBox);
        }
      }
    }
  }

  private carve(chunk: VoxelChunk, cav: Cavern, chunkBox: Box3): void {
    const c = this.config;
    const minX = Math.max(Math.floor(cav.box.minX), chunkBox.minX);
    const minY = Math.max(Math.floor(cav.box.minY), chunkBox.minY);
    const minZ = Math.max(Math.floor(cav.box.minZ), chunkBox.minZ);
    const maxX = Math.min(Math.ceil(cav.box.maxX), chunkBox.maxX - 1);
    const maxY = Math.min(Math.ceil(cav.box.maxY), chunkBox.maxY - 1);
    const maxZ = Math.min(Math.ceil(cav.box.maxZ), chunkBox.maxZ - 1);

    for (let wy = minY; wy <= maxY; wy++) {
      const ly = wy - chunk.origin.y;
      for (let wz = minZ; wz <= maxZ; wz++) {
        const lz = wz - chunk.origin.z;
        for (let wx = minX; wx <= maxX; wx++) {
          if (!this.contains(cav, wx, wy, wz)) continue;
          const lx = wx - chunk.origin.x;
          const block: Voxel = chunk.get(lx, ly, lz);
          if (canCarve(c, block)) chunk.set(lx, ly, lz, c.airBlock);
        }
      }
    }
  }
}

function boxesOverlap(a: Box3, b: Box3): boolean {
  return (
    a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY && a.minZ < b.maxZ && a.maxZ > b.minZ
  );
}
