import { describe, it, expect } from 'vitest';
import { generateDungeon, getLevel } from './dungeon.ts';
import { spawnLoot, spawnGear, monsterReward, POTION_COST, randomPotionKind, isItemKind } from './loot.ts';
import { ITEM_KIND_BY_ID } from './items.ts';
import { WEAPON_BY_ID, ARMOR_BY_ID } from './gear.ts';

describe('loot', () => {
  it('is deterministic per floor', () => {
    const d = generateDungeon('loot-seed');
    const a = spawnLoot(d.seed, getLevel(d, 4));
    const b = spawnLoot(d.seed, getLevel(d, 4));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('spawns none in the base camp', () => {
    const d = generateDungeon('loot-seed');
    expect(spawnLoot(d.seed, getLevel(d, -1))).toEqual([]);
  });

  it('scatters gold and unidentified items on dungeon floors', () => {
    const d = generateDungeon('loot-seed');
    const items = spawnLoot(d.seed, getLevel(d, 5));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((l) => l.kind === 'gold' || l.kind === 'item')).toBe(true);
    expect(items.filter((l) => l.kind === 'gold').every((l) => l.amount > 0)).toBe(true);
    // Item drops carry a real kind + its category, never revealed on the floor.
    for (const l of items.filter((l) => l.kind === 'item')) {
      expect(l.kindId && ITEM_KIND_BY_ID[l.kindId]).toBeTruthy();
      expect(l.category).toBe(ITEM_KIND_BY_ID[l.kindId!].category);
    }
  });

  it('rewards more gold for the boss and tougher foes', () => {
    expect(monsterReward(16, true)).toBeGreaterThan(monsterReward(3, false));
    expect(monsterReward(6, false)).toBeGreaterThan(monsterReward(2, false));
  });

  it('exposes a sane shop price and a valid mystery-potion pick', () => {
    expect(POTION_COST).toBeGreaterThan(0);
    const kindId = randomPotionKind('shop#1');
    expect(isItemKind(kindId)).toBe(true);
    expect(ITEM_KIND_BY_ID[kindId].category).toBe('potion');
  });
});

describe('spawnGear', () => {
  it('is deterministic per floor and namespaced apart from consumable loot', () => {
    const d = generateDungeon('gear-seed');
    const a = spawnGear(d.seed, getLevel(d, 4));
    const b = spawnGear(d.seed, getLevel(d, 4));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('spawns no gear in the base camp', () => {
    const d = generateDungeon('gear-seed');
    expect(spawnGear(d.seed, getLevel(d, -1))).toEqual([]);
  });

  it('drops well-formed weapon/armor pieces resolvable in the gear catalog', () => {
    const d = generateDungeon('gear-seed');
    let total = 0;
    for (let depth = 1; depth <= 25; depth++) {
      for (const g of spawnGear(d.seed, getLevel(d, depth))) {
        total++;
        expect(['weapon', 'armor']).toContain(g.gearCategory);
        const known =
          g.gearCategory === 'weapon'
            ? WEAPON_BY_ID[g.gearKindId as keyof typeof WEAPON_BY_ID]
            : ARMOR_BY_ID[g.gearKindId as keyof typeof ARMOR_BY_ID];
        expect(known).toBeTruthy();
        expect(g.enchantLevel).toBeGreaterThanOrEqual(0);
      }
    }
    expect(total).toBeGreaterThan(0); // gear does eventually drop
  });

  it('is scarcer than consumables over a full descent', () => {
    const d = generateDungeon('scarcity-seed');
    let gear = 0;
    let consumables = 0;
    for (let depth = 1; depth <= 25; depth++) {
      gear += spawnGear(d.seed, getLevel(d, depth)).length;
      consumables += spawnLoot(d.seed, getLevel(d, depth)).filter((l) => l.kind === 'item').length;
    }
    expect(gear).toBeGreaterThan(0);
    expect(gear).toBeLessThan(consumables);
  });
});
