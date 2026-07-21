// Deterministic seeding + coordinate hashing. Every cave decision derives from
// the world seed and ABSOLUTE world coordinates through these functions, so
// output never depends on chunk order, threads, or runtime RNG state.
//
// Different systems draw from INDEPENDENT derived seeds (terrain, caves,
// tunnels, caverns, ores) so their randomness can't correlate.

/** Final avalanche mix (murmur3 fmix32) → well-distributed uint32. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Hash a string to a uint32 (xmur3-style). */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return fmix32(h);
}

/** Combine a running hash with another 32-bit value. */
export function mix(h: number, k: number): number {
  h = Math.imul(h ^ (k | 0), 0x27d4eb2f);
  return fmix32(h);
}

/** Derive an independent sub-seed for a named subsystem. */
export function deriveSeed(worldSeed: number, name: string): number {
  return mix(worldSeed >>> 0, hashString(name));
}

/** Deterministic uint32 hash of two signed integer coordinates + a salt.
 *  Correct for negative coordinates (32-bit two's-complement via `| 0`). */
export function hash2i(x: number, y: number, salt: number): number {
  let h = salt | 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2f);
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  return fmix32(h);
}

/** Deterministic uint32 hash of three signed integer coordinates + a salt. */
export function hash3i(x: number, y: number, z: number, salt: number): number {
  let h = salt | 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2f);
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  h = Math.imul(h ^ (z | 0), 0xc2b2ae35);
  return fmix32(h);
}

/** Hash three integer coords to a float in [0, 1). */
export function hashUnit3(x: number, y: number, z: number, salt: number): number {
  return hash3i(x, y, z, salt) / 4294967296;
}

/** A small deterministic PRNG (mulberry32) — used for ordered sequences such as
 *  a tunnel's path nodes, where each step must advance a stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
