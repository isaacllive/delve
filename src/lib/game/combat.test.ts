import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.ts';
import {
  strengthModifier,
  netEnchant,
  accuracyFraction,
  damageFraction,
  weaponAccuracy,
  hitChance,
  rollHit,
  randClump,
  rollDamage,
  sneakMultiplier,
  ENCHANT_FACTOR,
  NET_ENCHANT_MIN,
  NET_ENCHANT_MAX,
} from './combat.ts';

describe('strengthModifier', () => {
  it('is 0 when strength exactly meets the requirement', () => {
    expect(strengthModifier(14, 14)).toBe(0);
  });
  it('grants +0.25 enchant per point of strength over the requirement', () => {
    expect(strengthModifier(18, 14)).toBeCloseTo(1.0, 10); // 4 × 0.25
  });
  it('costs -2.5 enchant per point under the requirement (punishing)', () => {
    expect(strengthModifier(12, 14)).toBeCloseTo(-5.0, 10); // -2 × 2.5
  });
});

describe('netEnchant', () => {
  it('adds strength modifier to the raw enchant level', () => {
    // +3 enchant weapon, 2 strength over req → +3 + 0.5
    expect(netEnchant(3, 16, 14)).toBeCloseTo(3.5, 10);
  });
  it('clamps to Brogue bounds', () => {
    expect(netEnchant(999, 30, 10)).toBe(NET_ENCHANT_MAX);
    expect(netEnchant(-999, 1, 20)).toBe(NET_ENCHANT_MIN);
  });
});

describe('accuracy/damage fractions match Brogue PowerTables (1.065^x)', () => {
  it('is exactly 1 at net enchant 0', () => {
    expect(accuracyFraction(0)).toBe(1);
    expect(damageFraction(0)).toBe(1);
  });
  it('matches the table value for +1 enchant (69795/65536 ≈ 1.065)', () => {
    // Brogue's fixed-point table entry for +1 enchant is 69795 (÷ 65536).
    expect(accuracyFraction(1)).toBeCloseTo(69795 / 65536, 4);
    expect(damageFraction(1)).toBeCloseTo(ENCHANT_FACTOR, 10);
  });
  it('accuracy and damage scale identically', () => {
    for (const n of [-5, -1, 0, 2, 7]) {
      expect(accuracyFraction(n)).toBeCloseTo(damageFraction(n), 12);
    }
  });
});

describe('weaponAccuracy', () => {
  it('is the base at net enchant 0', () => {
    expect(weaponAccuracy(0)).toBe(100);
  });
  it('grows 6.5% per net enchant', () => {
    expect(weaponAccuracy(1)).toBeCloseTo(106.5, 6);
  });
});

describe('hitChance', () => {
  it('equals accuracy% against 0 defense', () => {
    expect(hitChance(100, 0)).toBeCloseTo(1.0, 10);
    expect(hitChance(75, 0)).toBeCloseTo(0.75, 10);
  });
  it('falls off by 0.987 per internal defense point', () => {
    expect(hitChance(100, 1)).toBeCloseTo(0.987, 10);
    // ~5.2 displayed armor (52 internal) roughly halves hit chance.
    expect(hitChance(100, 52)).toBeCloseTo(Math.pow(0.987, 52), 10);
    expect(hitChance(100, 52)).toBeLessThan(0.55);
    expect(hitChance(100, 52)).toBeGreaterThan(0.45);
  });
  it('clamps into [0, 1]', () => {
    expect(hitChance(500, 0)).toBe(1); // >100% clamps
    expect(hitChance(0, 0)).toBe(0);
  });
});

describe('rollHit', () => {
  it('always lands at 100% and never at 0%', () => {
    const rng = makeRng('hit');
    for (let i = 0; i < 50; i++) {
      expect(rollHit(100, 0, rng)).toBe(true);
      expect(rollHit(0, 0, rng)).toBe(false);
    }
  });
  it('is deterministic for a seed', () => {
    const a = makeRng('same');
    const b = makeRng('same');
    const ra = Array.from({ length: 20 }, () => rollHit(60, 5, a));
    const rb = Array.from({ length: 20 }, () => rollHit(60, 5, b));
    expect(ra).toEqual(rb);
  });
});

describe('randClump', () => {
  it('stays within [lo, hi]', () => {
    const rng = makeRng('clump');
    for (let i = 0; i < 500; i++) {
      const v = randClump(3, 9, 2, rng);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
  it('with clumpFactor ≤ 1 is a flat inclusive roll', () => {
    const rng = makeRng('flat');
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) seen.add(randClump(1, 4, 1, rng));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });
  it('clumps toward the middle (variance lower than a flat roll)', () => {
    const flat = makeRng('v1');
    const clumped = makeRng('v1');
    const mean = 6; // range 3..9
    let flatVar = 0;
    let clumpVar = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      flatVar += (randClump(3, 9, 1, flat) - mean) ** 2;
      clumpVar += (randClump(3, 9, 3, clumped) - mean) ** 2;
    }
    expect(clumpVar / N).toBeLessThan(flatVar / N);
  });
});

describe('rollDamage', () => {
  it('scales base damage by the enchant fraction', () => {
    // A fixed 5–5 range removes roll variance so we can check the scaling.
    const rng = makeRng('dmg');
    const base = rollDamage({ min: 5, max: 5, clumpFactor: 1 }, 0, rng);
    expect(base).toBe(5);
    const boosted = rollDamage({ min: 5, max: 5, clumpFactor: 1 }, 4, makeRng('dmg'));
    expect(boosted).toBe(Math.floor(5 * Math.pow(1.065, 4)));
  });
});

describe('sneakMultiplier', () => {
  it('is ×3 normally and ×5 for a dagger', () => {
    expect(sneakMultiplier(false)).toBe(3);
    expect(sneakMultiplier(true)).toBe(5);
  });
});
