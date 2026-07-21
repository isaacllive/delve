// Voxel storage for a single chunk. Contiguous typed array (no per-voxel
// objects), fast index math, bounds validation, and dirty-region tracking so a
// mesher can rebuild only what changed.

import type { ChunkCoord, Vec3, Voxel } from './types.ts';

export class VoxelChunk {
  readonly data: Uint16Array;
  readonly origin: Vec3;
  /** Inclusive dirty bounds in local coords, or null when clean. */
  private dMinX = 0;
  private dMinY = 0;
  private dMinZ = 0;
  private dMaxX = -1;
  private dMaxY = -1;
  private dMaxZ = -1;

  constructor(
    readonly coord: ChunkCoord,
    readonly sizeX: number,
    readonly sizeY: number,
    readonly sizeZ: number,
    fill: Voxel = 0,
  ) {
    this.data = new Uint16Array(sizeX * sizeY * sizeZ);
    if (fill !== 0) this.data.fill(fill);
    this.origin = { x: coord.cx * sizeX, y: coord.cy * sizeY, z: coord.cz * sizeZ };
  }

  /** Row-major index: x fastest, then z, then y. */
  index(x: number, y: number, z: number): number {
    return x + this.sizeX * (z + this.sizeZ * y);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 && y >= 0 && z >= 0 && x < this.sizeX && y < this.sizeY && z < this.sizeZ
    );
  }

  /** Read a voxel; out-of-bounds reads return `oob` (default AIR=0). */
  get(x: number, y: number, z: number, oob: Voxel = 0): Voxel {
    if (!this.inBounds(x, y, z)) return oob;
    return this.data[this.index(x, y, z)];
  }

  /** Write a voxel; ignores out-of-bounds writes and marks the region dirty. */
  set(x: number, y: number, z: number, v: Voxel): void {
    if (!this.inBounds(x, y, z)) return;
    const i = this.index(x, y, z);
    if (this.data[i] === v) return;
    this.data[i] = v;
    this.markDirty(x, y, z);
  }

  fill(v: Voxel): void {
    this.data.fill(v);
    this.dMinX = this.dMinY = this.dMinZ = 0;
    this.dMaxX = this.sizeX - 1;
    this.dMaxY = this.sizeY - 1;
    this.dMaxZ = this.sizeZ - 1;
  }

  private markDirty(x: number, y: number, z: number): void {
    if (this.dMaxX < this.dMinX) {
      this.dMinX = this.dMaxX = x;
      this.dMinY = this.dMaxY = y;
      this.dMinZ = this.dMaxZ = z;
      return;
    }
    if (x < this.dMinX) this.dMinX = x;
    else if (x > this.dMaxX) this.dMaxX = x;
    if (y < this.dMinY) this.dMinY = y;
    else if (y > this.dMaxY) this.dMaxY = y;
    if (z < this.dMinZ) this.dMinZ = z;
    else if (z > this.dMaxZ) this.dMaxZ = z;
  }

  isDirty(): boolean {
    return this.dMaxX >= this.dMinX;
  }

  dirtyBounds(): { min: Vec3; max: Vec3 } | null {
    if (!this.isDirty()) return null;
    return {
      min: { x: this.dMinX, y: this.dMinY, z: this.dMinZ },
      max: { x: this.dMaxX, y: this.dMaxY, z: this.dMaxZ },
    };
  }

  clearDirty(): void {
    this.dMaxX = -1;
    this.dMinX = 0;
  }
}
