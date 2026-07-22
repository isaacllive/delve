// Procedural terrain tile textures (floor / wall / ceiling), drawn into a single
// canvas ATLAS. No Three.js dependency — this is pure canvas/DOM so it stays out
// of the `game/` (deterministic, no-DOM) zone; the renderer wraps the returned
// canvas in a THREE.CanvasTexture.
//
// The tiles are NEUTRAL grey rock: the renderer already tints every cell by the
// biome palette (per-instance colour) and bakes per-face shading, so colour is
// owned there (DRY — one source of tint). These textures only add surface
// DETAIL, kept near full brightness (mean luminance ≈ 0.82) so multiplying them
// onto the existing colour adds relief without darkening the scene.
//
// Generation is DETERMINISTIC (a fixed integer hash — no Math.random), matching
// the repo's seed-driven ethos: the same build always produces the same tiles.

/** A sub-rectangle of the atlas in normalised UV space: [u0, v0, u1, v1]. */
export type UVRect = readonly [number, number, number, number];

export interface TerrainAtlas {
  /** 3-tile atlas canvas (floor | wall | ceiling), left→right. */
  canvas: HTMLCanvasElement;
  /** Where each surface's tile lives in UV space (inset to avoid edge bleed). */
  rects: { floor: UVRect; wall: UVRect; ceiling: UVRect };
}

const TILE = 64; // px per tile — plenty of detail at voxel scale, cheap to build
const TILES = 3; // floor, wall, ceiling
const W = TILE * TILES;
const H = TILE;

// ── deterministic value noise (periodic, so tiles are seamless) ──────────────

/** 2D integer hash → [0, 1). No global state; pure function of its inputs. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (n: number, p: number) => ((n % p) + p) % p;

/** Value noise on a lattice of period `p` — wrapping the lattice makes the
 *  result tile seamlessly whenever `p` divides the sampling span (TILE). */
function noise(x: number, y: number, p: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const a = hash(wrap(xi, p), wrap(yi, p), seed);
  const b = hash(wrap(xi + 1, p), wrap(yi, p), seed);
  const c = hash(wrap(xi, p), wrap(yi + 1, p), seed);
  const d = hash(wrap(xi + 1, p), wrap(yi + 1, p), seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Fractal (multi-octave) seamless noise in [0, 1]. `base` octaves double each
 *  step; every period divides TILE so the whole stack tiles. */
function fbm(px: number, py: number, base: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    const p = base << o; // 4,8,16,32 — all divide TILE (64) → seamless
    sum += amp * noise((px / TILE) * p, (py / TILE) * p, p, seed + o);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

// ── tile painters (write neutral grey into an offset column of the atlas) ─────

type Painter = (data: Uint8ClampedArray, ox: number) => void;

/** Write a grey pixel (r=g=b) with the atlas's row stride. */
function put(data: Uint8ClampedArray, ox: number, x: number, y: number, lum: number) {
  const i = (y * W + (ox + x)) * 4;
  const c = Math.max(0, Math.min(255, Math.round(lum * 255)));
  data[i] = c;
  data[i + 1] = c;
  data[i + 2] = c;
  data[i + 3] = 255;
}

/** Floor: mortared flagstones — a 2×2 grid of stones with darker grout seams,
 *  each stone lightly varied, plus fine grain. Seamless across the grid. */
const paintFloor: Painter = (data, ox) => {
  const cells = 2; // stones per axis
  const cellPx = TILE / cells;
  const seam = 3; // grout half-width in px
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // Distance to the nearest grid seam (wrapping), in px.
      const dx = Math.min((x % cellPx) + 1, cellPx - (x % cellPx));
      const dy = Math.min((y % cellPx) + 1, cellPx - (y % cellPx));
      const edge = Math.min(dx, dy);
      const stone = 0.5 + hash(Math.floor(x / cellPx), Math.floor(y / cellPx), 11) * 0.18;
      const grain = fbm(x, y, 8, 11) * 0.22;
      let lum = 0.66 + stone * 0.35 + grain - 0.11;
      if (edge < seam) lum *= 0.45 + (edge / seam) * 0.55; // darken the grout
      put(data, ox, x, y, lum);
    }
  }
};

/** Wall: rough hewn rock with vertical strata + a couple of dark cracks. The
 *  vertical bias keeps it reading well even when a tall wall column stretches a
 *  single tile over its height. */
const paintWall: Painter = (data, ox) => {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // Vertical streaks: strong horizontal variation, gentle vertical.
      const strata = fbm(x * 2, y * 0.5, 8, 23);
      const grain = fbm(x, y, 16, 24) * 0.18;
      let lum = 0.6 + strata * 0.4 + grain - 0.09;
      // A pair of diagonal-ish cracks carved with a periodic sine, so they wrap.
      const crackA = Math.abs(x - (32 + 10 * Math.sin((y / TILE) * Math.PI * 2)));
      const crackB = Math.abs(((x + 40) % TILE) - (20 + 8 * Math.sin((y / TILE) * Math.PI * 2 + 1)));
      const crack = Math.min(crackA, crackB);
      if (crack < 2) lum *= 0.5 + crack * 0.25;
      put(data, ox, x, y, lum);
    }
  }
};

/** Ceiling: coarse, pitted rock — lumpier, low-frequency mass with scattered
 *  dark pocks (stalactite roots). Slightly darker mean than floor/wall. */
const paintCeiling: Painter = (data, ox) => {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const mass = fbm(x, y, 4, 37);
      const grain = fbm(x, y, 16, 38) * 0.16;
      let lum = 0.58 + mass * 0.38 + grain - 0.08;
      // Dark pocks where the high-frequency field peaks.
      const pock = fbm(x, y, 32, 39);
      if (pock > 0.82) lum *= 0.55;
      put(data, ox, x, y, lum);
    }
  }
};

/** Build the terrain tile atlas. Call once (needs a DOM canvas); the renderer
 *  caches the resulting texture for the session. */
export function buildTerrainAtlas(): TerrainAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for terrain atlas');
  const img = ctx.createImageData(W, H);
  paintFloor(img.data, TILE * 0);
  paintWall(img.data, TILE * 1);
  paintCeiling(img.data, TILE * 2);
  ctx.putImageData(img, 0, 0);

  // Inset each tile's UV rect by half a texel so linear filtering never samples
  // the neighbouring tile at the seam (the atlas has no gutter between tiles).
  const gx = 0.5 / W;
  const gy = 0.5 / H;
  const rect = (i: number): UVRect => [i / TILES + gx, gy, (i + 1) / TILES - gx, 1 - gy];
  return { canvas, rects: { floor: rect(0), wall: rect(1), ceiling: rect(2) } };
}
