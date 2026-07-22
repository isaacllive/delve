import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.ts';
import {
  WEAPONS,
  ARMORS,
  WEAPON_BY_ID,
  ARMOR_BY_ID,
  isWeaponId,
  isArmorId,
  gearKind,
  makeGear,
  enchantItem,
  revealEnchant,
  effectiveStrengthReq,
  weaponNetEnchant,
  armorNetEnchant,
  equippedAccuracy,
  equippedDefense,
  displayedArmor,
  weaponDamageRoll,
  weaponDamageRange,
  isDaggerEquipped,
  gearDisplayName,
  FIST_DAMAGE,
} from './gear.ts';
import { netEnchant, weaponAccuracy } from './combat.ts';

describe('catalog', () => {
  it('weapons are self-consistent and indexable by id', () => {
    for (const w of WEAPONS) {
      expect(WEAPON_BY_ID[w.id]).toBe(w);
      expect(w.category).toBe('weapon');
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.strengthRequired).toBeGreaterThan(0);
      expect(w.damage.max).toBeGreaterThanOrEqual(w.damage.min);
      expect(w.baseAccuracy).toBe(100);
    }
  });

  it('armors are self-consistent and indexable by id', () => {
    for (const a of ARMORS) {
      expect(ARMOR_BY_ID[a.id]).toBe(a);
      expect(a.category).toBe('armor');
      expect(a.armor).toBeGreaterThan(0);
      expect(a.strengthRequired).toBeGreaterThan(0);
    }
  });

  it('ports the exact BrogueCE numbers for the starter set', () => {
    // weaponTable (Globals.c): strengthRequired + {min,max,clump}
    expect(WEAPON_BY_ID.dagger).toMatchObject({ strengthRequired: 12, sneakRunic: true });
    expect(WEAPON_BY_ID.dagger.damage).toEqual({ min: 3, max: 4, clumpFactor: 1 });
    expect(WEAPON_BY_ID.sword.damage).toEqual({ min: 7, max: 9, clumpFactor: 1 });
    expect(WEAPON_BY_ID.mace.damage).toEqual({ min: 16, max: 20, clumpFactor: 1 });
    expect(WEAPON_BY_ID.warHammer).toMatchObject({ strengthRequired: 20 });
    expect(WEAPON_BY_ID.warHammer.damage).toEqual({ min: 25, max: 35, clumpFactor: 1 });
    // armorTable (Globals.c): internal armor value (displayed = /10)
    expect(ARMOR_BY_ID.leather).toMatchObject({ strengthRequired: 10, armor: 30 });
    expect(ARMOR_BY_ID.plate).toMatchObject({ strengthRequired: 19, armor: 110 });
  });

  it('only the dagger carries the sneak runic', () => {
    expect(WEAPONS.filter((w) => w.sneakRunic).map((w) => w.id)).toEqual(['dagger']);
  });

  it('type guards + gearKind resolve across both catalogs', () => {
    expect(isWeaponId('sword')).toBe(true);
    expect(isWeaponId('leather')).toBe(false);
    expect(isArmorId('plate')).toBe(true);
    expect(gearKind('weapon', 'axe')).toBe(WEAPON_BY_ID.axe);
    expect(gearKind('armor', 'chain')).toBe(ARMOR_BY_ID.chain);
  });
});

describe('instance model + enchant', () => {
  it('gear is created +0 and enchant-unknown (base type known on pickup)', () => {
    const g = makeGear('weapon', 'sword', 'w1');
    expect(g).toEqual({
      instId: 'w1',
      category: 'weapon',
      kindId: 'sword',
      enchantLevel: 0,
      enchantKnown: false,
    });
  });

  it('enchantItem is pure: +1 level, does not mutate or reveal', () => {
    const g = makeGear('weapon', 'sword', 'w1');
    const g2 = enchantItem(g);
    expect(g.enchantLevel).toBe(0); // original untouched
    expect(g2.enchantLevel).toBe(1);
    expect(g2.enchantKnown).toBe(false); // enchanting does not identify
    expect(g2).not.toBe(g);
  });

  it('revealEnchant flips only the known flag', () => {
    const g = makeGear('armor', 'plate', 'a1', 2);
    const r = revealEnchant(g);
    expect(r.enchantKnown).toBe(true);
    expect(r.enchantLevel).toBe(2);
    expect(revealEnchant(r)).toBe(r); // idempotent, returns same ref
  });

  it('each enchant lowers effective strength requirement by 1, clamped at 0', () => {
    const hammer = makeGear('weapon', 'warHammer', 'h', 0); // base strReq 20
    expect(effectiveStrengthReq(hammer)).toBe(20);
    expect(effectiveStrengthReq({ ...hammer, enchantLevel: 3 })).toBe(17);
    expect(effectiveStrengthReq({ ...hammer, enchantLevel: 20 })).toBe(0);
    expect(effectiveStrengthReq({ ...hammer, enchantLevel: 25 })).toBe(0); // never negative
  });
});

describe('combat derivations (delegate to combat.ts, Brogue numbers)', () => {
  it('weaponNetEnchant matches combat.netEnchant against the effective str req', () => {
    // +2 sword (base strReq 14 → effective 12) at strength 12: modifier 0, net 2.
    const sword = makeGear('weapon', 'sword', 's', 2);
    expect(weaponNetEnchant(sword, 12)).toBeCloseTo(netEnchant(2, 12, 12));
    expect(weaponNetEnchant(sword, 12)).toBeCloseTo(2);
  });

  it('under-strength is punishing (−2.5 net per point below requirement)', () => {
    const sword = makeGear('weapon', 'sword', 's'); // strReq 14, +0
    // strength 12 → diff −2 → −5 net.
    expect(weaponNetEnchant(sword, 12)).toBeCloseTo(-5);
    // accuracy falls below the base 100.
    expect(equippedAccuracy(sword, 12)).toBeCloseTo(weaponAccuracy(-5));
    expect(equippedAccuracy(sword, 12)).toBeLessThan(100);
  });

  it('over-strength gives a small bonus (+0.25 net per point above requirement)', () => {
    const sword = makeGear('weapon', 'sword', 's'); // strReq 14
    expect(weaponNetEnchant(sword, 18)).toBeCloseTo(1); // (18-14)*0.25
    expect(equippedAccuracy(sword, 18)).toBeCloseTo(weaponAccuracy(1));
    expect(equippedAccuracy(sword, 18)).toBeGreaterThan(100);
  });

  it('unarmed uses base accuracy 100 and fist damage', () => {
    expect(equippedAccuracy(null, 12)).toBeCloseTo(100);
    const rng = makeRng('fist');
    for (let i = 0; i < 50; i++) {
      const d = weaponDamageRoll(null, 12, makeRng(`fist#${i}`));
      expect(d).toBeGreaterThanOrEqual(FIST_DAMAGE.min);
      expect(d).toBeLessThanOrEqual(FIST_DAMAGE.max);
    }
    // one live roll to exercise the seeded stream
    expect(weaponDamageRoll(null, 12, rng)).toBeGreaterThanOrEqual(1);
  });

  it('armor internal defense = value + 10×netEnchant, displayed = ÷10', () => {
    // leather (armor 30, strReq 10) at strength 10, +0: net 0 → defense 30.
    const leather = makeGear('armor', 'leather', 'l');
    expect(armorNetEnchant(leather, 10)).toBeCloseTo(0);
    expect(equippedDefense(leather, 10)).toBe(30);
    expect(displayedArmor(leather, 10)).toBeCloseTo(3);
    // strength 12 (2 over req): net +0.5 → defense trunc(30+5)=35.
    expect(equippedDefense(leather, 12)).toBe(35);
    // +1 leather (effective strReq 9) at strength 10: net 1 + 0.25 = 1.25 → 42.
    expect(equippedDefense({ ...leather, enchantLevel: 1 }, 10)).toBe(42);
    // unarmored is 0 defense.
    expect(equippedDefense(null, 12)).toBe(0);
  });

  it('enchanting a weapon raises both accuracy and damage-range bounds', () => {
    const base = makeGear('weapon', 'sword', 's'); // strReq 14 at str 14 → net 0
    const plus3 = makeGear('weapon', 'sword', 's', 3);
    expect(equippedAccuracy(plus3, 14)).toBeGreaterThan(equippedAccuracy(base, 14));
    const r0 = weaponDamageRange(base, 14);
    const r3 = weaponDamageRange(plus3, 14);
    expect(r3.min).toBeGreaterThanOrEqual(r0.min);
    expect(r3.max).toBeGreaterThan(r0.max);
  });

  it('weaponDamageRoll is deterministic for a given seed and stays in range', () => {
    const sword = makeGear('weapon', 'sword', 's', 5); // enchant boosts damage
    const a = weaponDamageRoll(sword, 20, makeRng('roll-seed'));
    const b = weaponDamageRoll(sword, 20, makeRng('roll-seed'));
    expect(a).toBe(b); // same seed → same roll
    expect(a).toBeGreaterThan(0);
  });
});

describe('presentation', () => {
  it('isDaggerEquipped drives the ×5 sneak runic only for daggers', () => {
    expect(isDaggerEquipped(makeGear('weapon', 'dagger', 'd'))).toBe(true);
    expect(isDaggerEquipped(makeGear('weapon', 'sword', 's'))).toBe(false);
    expect(isDaggerEquipped(null)).toBe(false);
  });

  it('gearDisplayName hides enchant until known, then shows a signed prefix', () => {
    const g = makeGear('weapon', 'mace', 'm', 2);
    expect(gearDisplayName(g)).toBe('mace'); // enchant unknown
    expect(gearDisplayName(revealEnchant(g))).toBe('+2 mace');
    expect(gearDisplayName(revealEnchant({ ...g, enchantLevel: 0 }))).toBe('mace'); // +0 shows bare
    expect(gearDisplayName(revealEnchant({ ...g, enchantLevel: -1 }))).toBe('-1 mace');
  });
});
