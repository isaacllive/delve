// Deterministic seeded RNG. Same seed → same stream on server and every
// client, so a dungeon can be regenerated anywhere from just its seed string.
// mulberry32 (fast, decent distribution) seeded via xmur3 string hash — both
// tiny, dependency-free, and well-known.

/** Hash a string to a 32-bit seed. */
export function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** A stateful PRNG. `next()` returns a float in [0, 1). */
export interface Rng {
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
}

/** mulberry32 stepping function over a 32-bit state. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build an Rng from a seed string (or number). */
export function makeRng(seed: string | number): Rng {
  const s = typeof seed === 'number' ? seed >>> 0 : xmur3(seed);
  const next = mulberry32(s);
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

/** A human-friendly random seed string (used when the host doesn't supply one). */
export function randomSeed(): string {
  const words = [
    'ash', 'bone', 'crypt', 'dusk', 'ember', 'fang', 'grim', 'hollow',
    'iron', 'jet', 'karst', 'lurk', 'mire', 'null', 'ochre', 'pyre',
  ];
  // Non-deterministic on purpose — this is the entropy source for a NEW run.
  const r = () => words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(Math.random() * 900 + 100);
  return `${r()}-${r()}-${n}`;
}
