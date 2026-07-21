import { describe, it, expect } from 'vitest';
import { generateDungeon, getLevel } from './dungeon.ts';
import { spawnLoot, monsterReward, POTION_COST, POTION_HEAL } from './loot.ts';

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

  it('scatters gold and potions on dungeon floors', () => {
    const d = generateDungeon('loot-seed');
    const items = spawnLoot(d.seed, getLevel(d, 5));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((l) => l.kind === 'gold' || l.kind === 'potion')).toBe(true);
    expect(items.filter((l) => l.kind === 'gold').every((l) => l.amount > 0)).toBe(true);
  });

  it('rewards more gold for the boss and tougher foes', () => {
    expect(monsterReward(16, true)).toBeGreaterThan(monsterReward(3, false));
    expect(monsterReward(6, false)).toBeGreaterThan(monsterReward(2, false));
  });

  it('exposes sane potion economy constants', () => {
    expect(POTION_COST).toBeGreaterThan(0);
    expect(POTION_HEAL).toBeGreaterThan(0);
  });
});
