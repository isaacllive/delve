// Face-culled voxel mesher: turns a VoxelChunk into raw geometry arrays (no
// Three.js dependency — the renderer builds the BufferGeometry). Only faces
// between a solid voxel and air/out-of-bounds are emitted, with baked per-face
// directional shading for the blocky Minecraft look. A per-vertex column UV is
// emitted so the renderer can drive per-column lighting from a small texture.

import type { VoxelChunk } from './chunk.ts';

export interface MeshData {
  positions: Float32Array;
  colors: Float32Array; // base colour (block tint × face shade), pre-lighting
  uvs: Float32Array; // per-vertex (col, row) UV into the lighting texture
  indices: Uint32Array;
}

/** Colour callback: base RGB for a voxel's face (0..1), before lighting. */
export type ColorOf = (block: number, x: number, y: number, z: number, face: number) => [number, number, number];

// 6 faces: +X, -X, +Y(top), -Y(bottom), +Z, -Z.
const FACES = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.8 },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.8 },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.9 },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.68 },
];

export function meshChunk(chunk: VoxelChunk, colorOf: ColorOf): MeshData {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const { sizeX, sizeY, sizeZ } = chunk;
  const invX = 1 / sizeX;
  const invZ = 1 / sizeZ;
  let vert = 0;

  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const block = chunk.get(x, y, z);
        if (block === 0) continue; // air
        const u = (x + 0.5) * invX;
        const w = (z + 0.5) * invZ;
        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          // Emit the face only if the neighbour is air / outside.
          const nb = chunk.get(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
          if (nb !== 0) continue;
          const [r, g, b] = colorOf(block, x, y, z, f);
          const s = face.shade;
          for (const c of face.corners) {
            positions.push(x + c[0], y + c[1], z + c[2]);
            colors.push(r * s, g * s, b * s);
            uvs.push(u, w);
          }
          indices.push(vert, vert + 1, vert + 2, vert, vert + 2, vert + 3);
          vert += 4;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}
