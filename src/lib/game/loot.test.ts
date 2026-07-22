import { describe, it, expect } from 'vitest';
import { generateDungeon, getLevel } from './dungeon.ts';
import { spawnLoot, monsterReward, POTION_COST, randomPotionKind, isItemKind } from './loot.ts';
import { ITEM_KIND_BY_ID } from './items.ts';

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
