// Coordinate conversion — the ONE place that knows how world, chunk, and local
// coordinates relate. All conversions are correct for negative coordinates
// (floored division + positive modulo), which naive `/` and `%` get wrong.

import type { ChunkCoord, Vec3 } from './types.ts';

/** Floored integer division (correct for negatives): floorDiv(-1, 32) = -1. */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Positive modulo (correct for negatives): mod(-1, 32) = 31. */
export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** Converts between world, chunk, and chunk-local coordinate spaces for a fixed
 *  chunk size. Stateless aside from the size; safe to share. */
export class CoordinateConverter {
  constructor(
    readonly sizeX: number,
    readonly sizeY: number,
    readonly sizeZ: number,
  ) {}

  worldToChunk(wx: number, wy: number, wz: number): ChunkCoord {
    return {
      cx: floorDiv(wx, this.sizeX),
      cy: floorDiv(wy, this.sizeY),
      cz: floorDiv(wz, this.sizeZ),
    };
  }

  worldToLocal(wx: number, wy: number, wz: number): Vec3 {
    return {
      x: mod(wx, this.sizeX),
      y: mod(wy, this.sizeY),
      z: mod(wz, this.sizeZ),
    };
  }

  chunkOrigin(c: ChunkCoord): Vec3 {
    return { x: c.cx * this.sizeX, y: c.cy * this.sizeY, z: c.cz * this.sizeZ };
  }

  localToWorld(c: ChunkCoord, lx: number, ly: number, lz: number): Vec3 {
    return {
      x: c.cx * this.sizeX + lx,
      y: c.cy * this.sizeY + ly,
      z: c.cz * this.sizeZ + lz,
    };
  }
}
