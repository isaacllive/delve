// Development-only diagnostics: deterministic chunk hashing (for regression
// tests) and ASCII slice export (for eyeballing cave shape). No runtime cost
// unless called; safe to tree-shake out of production.

import type { VoxelChunk } from './chunk.ts';

/** Stable FNV-1a hash of a chunk's voxel buffer — for regression assertions. */
export function hashChunk(chunk: VoxelChunk): number {
  let h = 2166136261;
  const d = chunk.data;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
  return h >>> 0;
}

export function countAir(chunk: VoxelChunk, air = 0): number {
  let n = 0;
  const d = chunk.data;
  for (let i = 0; i < d.length; i++) if (d[i] === air) n++;
  return n;
}

/** Horizontal (X–Z) slice at local Y: '#' solid, '·' cave-air. */
export function asciiSliceXZ(chunk: VoxelChunk, ly: number, air = 0): string {
  const rows: string[] = [];
  for (let z = 0; z < chunk.sizeZ; z++) {
    let row = '';
    for (let x = 0; x < chunk.sizeX; x++) row += chunk.get(x, ly, z) === air ? '·' : '#';
    rows.push(row);
  }
  return rows.join('\n');
}

/** Vertical (X–Y) slice at local Z (Y increases downward in the string). */
export function asciiSliceXY(chunk: VoxelChunk, lz: number, air = 0): string {
  const rows: string[] = [];
  for (let y = chunk.sizeY - 1; y >= 0; y--) {
    let row = '';
    for (let x = 0; x < chunk.sizeX; x++) row += chunk.get(x, y, lz) === air ? '·' : '#';
    rows.push(row);
  }
  return rows.join('\n');
}
