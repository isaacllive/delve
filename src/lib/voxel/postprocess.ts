// Bounded, in-chunk cleanup: fill lone air voxels fully surrounded by solid,
// and remove lone solid voxels fully surrounded by air. Only INTERIOR voxels
// (all 6 neighbours in-bounds) are touched, so the result stays deterministic
// and border-seamless — cross-chunk single-voxel cases are intentionally left
// alone (they'd require neighbour chunks and could break determinism).

import type { CaveConfig } from './config.ts';
import { canCarve } from './config.ts';
import type { VoxelChunk } from './chunk.ts';

export class CavePostProcessor {
  constructor(private readonly config: CaveConfig) {}

  process(chunk: VoxelChunk): void {
    const c = this.config;
    if (!c.removeIsolatedAir && !c.removeIsolatedSolid) return;

    // Snapshot so all decisions read the pre-pass state (order-independent).
    const src = chunk.data.slice();
    const air = c.airBlock;
    const idx = (x: number, y: number, z: number) => x + chunk.sizeX * (z + chunk.sizeZ * y);

    for (let y = 1; y < chunk.sizeY - 1; y++) {
      for (let z = 1; z < chunk.sizeZ - 1; z++) {
        for (let x = 1; x < chunk.sizeX - 1; x++) {
          const here = src[idx(x, y, z)];
          const n = [
            src[idx(x - 1, y, z)],
            src[idx(x + 1, y, z)],
            src[idx(x, y - 1, z)],
            src[idx(x, y + 1, z)],
            src[idx(x, y, z - 1)],
            src[idx(x, y, z + 1)],
          ];
          const airN = n.filter((v) => v === air).length;

          if (c.removeIsolatedAir && here === air && airN === 0) {
            // Lone air pocket → fill with a neighbour's solid block.
            const solid = n.find((v) => v !== air)!;
            chunk.set(x, y, z, solid);
          } else if (c.removeIsolatedSolid && here !== air && airN === 6 && canCarve(c, here)) {
            chunk.set(x, y, z, air);
          }
        }
      }
    }
  }
}
