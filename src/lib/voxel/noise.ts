// Seeded gradient (Perlin) noise in 3D, plus fractal Brownian motion and domain
// warping. This is the only module that knows a concrete noise implementation;
// everything else depends on the NoiseProvider interface, so the algorithm can
// be swapped without touching the cave logic.

import { mulberry32 } from './seed.ts';

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

export interface FbmOptions {
  frequency: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
}

export class NoiseProvider {
  /** 512-entry permutation (doubled) built deterministically from the seed. */
  private readonly perm: Uint8Array;

  constructor(seed: number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Seeded Fisher–Yates shuffle.
    const rand = mulberry32(seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private grad(hash: number, x: number, y: number, z: number): number {
    const g = GRAD3[hash % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  }

  /** Classic Perlin noise in roughly [-1, 1]. */
  perlin3(x: number, y: number, z: number): number {
    const p = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    return lerp(
      lerp(
        lerp(this.grad(p[AA], xf, yf, zf), this.grad(p[BA], xf - 1, yf, zf), u),
        lerp(this.grad(p[AB], xf, yf - 1, zf), this.grad(p[BB], xf - 1, yf - 1, zf), u),
        v,
      ),
      lerp(
        lerp(this.grad(p[AA + 1], xf, yf, zf - 1), this.grad(p[BA + 1], xf - 1, yf, zf - 1), u),
        lerp(this.grad(p[AB + 1], xf, yf - 1, zf - 1), this.grad(p[BB + 1], xf - 1, yf - 1, zf - 1), u),
        v,
      ),
      w,
    );
  }

  /** Fractal Brownian motion — layered octaves, normalized to ~[-1, 1]. */
  fbm3(x: number, y: number, z: number, o: FbmOptions): number {
    let freq = o.frequency;
    let amp = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < o.octaves; i++) {
      sum += amp * this.perlin3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= o.persistence;
      freq *= o.lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /** Domain-warp a point by sampling an offset noise field. Returns the warped
   *  coordinates; caller feeds them back into another noise call for organic,
   *  non-grid-aligned shapes. */
  warp(x: number, y: number, z: number, strength: number, frequency: number): [number, number, number] {
    const wx = this.perlin3((x + 31.4) * frequency, (y + 12.7) * frequency, (z + 5.1) * frequency);
    const wy = this.perlin3((x - 7.2) * frequency, (y + 88.3) * frequency, (z - 44.6) * frequency);
    const wz = this.perlin3((x + 3.9) * frequency, (y - 19.5) * frequency, (z + 63.2) * frequency);
    return [x + wx * strength, y + wy * strength, z + wz * strength];
  }
}
