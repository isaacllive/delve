// Minimal example: generate one chunk and return a slice + stats. Run the
// bundled `voxel-demo.test.ts` (or import `demoChunk`) to see it work.

import { CaveGenerationPipeline } from './pipeline.ts';
import { asciiSliceXZ, asciiSliceXY, countAir, hashChunk } from './debug.ts';
import type { ChunkCoord } from './types.ts';

export function demoChunk(seed: string | number = 'delve-caves', coord: ChunkCoord = { cx: 0, cy: -1, cz: 0 }) {
  const pipeline = new CaveGenerationPipeline(seed);
  const chunk = pipeline.generateChunk(coord);
  const total = chunk.sizeX * chunk.sizeY * chunk.sizeZ;
  const air = countAir(chunk);
  return {
    seed,
    coord,
    hash: hashChunk(chunk),
    airFraction: air / total,
    sliceXZ: asciiSliceXZ(chunk, Math.floor(chunk.sizeY / 2)),
    sliceXY: asciiSliceXY(chunk, Math.floor(chunk.sizeZ / 2)),
    chunk,
    pipeline,
  };
}
