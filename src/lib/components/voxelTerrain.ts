// Renders a dungeon floor as a real face-culled VOXEL MESH (via the voxel
// engine) instead of per-cell boxes. Per-column lighting/fog/occlusion is fed
// through a tiny cols×rows data texture that the shader samples per vertex — so
// the caller (DungeonView3D) keeps computing the 2D vision and just writes the
// `light` / `alpha` arrays each frame; the GPU does the per-voxel shading.

import type { DungeonLevel } from '$lib/game/dungeon.ts';
import type { BiomePalette } from '$lib/game/biomes.ts';
import { voxelizeLevel, colorForKind, VOX_BASE } from '$lib/game/voxelize.ts';
import { VoxelChunk, meshChunk } from '$lib/voxel/index.ts';

type ThreeNS = typeof import('three');

const VERTEX = `
  attribute vec3 aColor;
  attribute vec2 aCell;
  varying vec3 vColor;
  varying vec2 vCell;
  void main() {
    vColor = aColor;
    vCell = aCell;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAGMENT = `
  uniform sampler2D uLight;
  varying vec3 vColor;
  varying vec2 vCell;
  void main() {
    vec4 L = texture2D(uLight, vCell); // R = brightness, G = alpha
    if (L.g < 0.02) discard;           // unrevealed / fully occluded
    gl_FragColor = vec4(vColor * L.r, L.g);
  }`;

export class VoxelTerrain {
  mesh: import('three').Mesh | null = null;
  cols = 1;
  rows = 1;
  /** Per-cell brightness 0..1 (write, then call `upload`). */
  light = new Float32Array(0);
  /** Per-cell alpha 0..1 = reveal × (1 − occlusion). */
  alpha = new Float32Array(0);

  private tex: import('three').DataTexture | null = null;
  private data = new Float32Array(0);

  constructor(
    private readonly THREE: ThreeNS,
    private readonly scene: import('three').Scene,
  ) {}

  /** (Re)build the voxel mesh + lighting texture for a floor. */
  build(level: DungeonLevel, palette: BiomePalette): void {
    this.dispose();
    const T = this.THREE;
    const chunk: VoxelChunk = voxelizeLevel(level);
    const md = meshChunk(chunk, (block) => colorForKind(palette, block));

    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(md.positions, 3));
    geo.setAttribute('aColor', new T.BufferAttribute(md.colors, 3));
    geo.setAttribute('aCell', new T.BufferAttribute(md.uvs, 2));
    geo.setIndex(new T.BufferAttribute(md.indices, 1));

    this.cols = level.cols;
    this.rows = level.rows;
    const n = this.cols * this.rows;
    this.light = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.data = new Float32Array(n * 4);

    this.tex = new T.DataTexture(this.data, this.cols, this.rows, T.RGBAFormat, T.FloatType);
    this.tex.minFilter = T.NearestFilter;
    this.tex.magFilter = T.NearestFilter;
    this.tex.needsUpdate = true;

    const mat = new T.ShaderMaterial({
      transparent: true,
      uniforms: { uLight: { value: this.tex } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });

    this.mesh = new T.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    // Voxels span [col, col+1]; shift so a cell centres on its integer coord
    // (matching avatar/monster positions), and lift to the world-Y base.
    this.mesh.position.set(-0.5, VOX_BASE, -0.5);
    this.scene.add(this.mesh);
  }

  /** Push the current `light`/`alpha` arrays into the shader texture. */
  upload(): void {
    if (!this.tex) return;
    const d = this.data;
    const L = this.light;
    const A = this.alpha;
    for (let i = 0; i < L.length; i++) {
      d[i * 4] = L[i];
      d[i * 4 + 1] = A[i];
    }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as import('three').Material).dispose();
      this.mesh = null;
    }
    if (this.tex) {
      this.tex.dispose();
      this.tex = null;
    }
  }
}
