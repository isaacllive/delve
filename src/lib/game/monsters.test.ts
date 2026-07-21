import { describe, it, expect } from 'vitest';
import { generateDungeon, getLevel } from './dungeon.ts';
import { spawnMonsters } from './monsters.ts';

describe('spawnMonsters', () => {
  it('is deterministic for a floor', () => {
    const d = generateDungeon('mon-seed');
    const a = spawnMonsters(d.seed, getLevel(d, 5));
    const b = spawnMonsters(d.seed, getLevel(d, 5));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('spawns no monsters in the base camp', () => {
    const d = generateDungeon('mon-seed');
    expect(spawnMonsters(d.seed, getLevel(d, -1))).toEqual([]);
  });

  it('populates dungeon floors with monsters', () => {
    const d = generateDungeon('mon-seed');
    expect(spawnMonsters(d.seed, getLevel(d, 3)).length).toBeGreaterThan(0);
  });

  it('places exactly one boss on the bottom floor', () => {
    const d = generateDungeon('mon-seed', { levelCount: 3 });
    const bosses = spawnMonsters(d.seed, getLevel(d, 2)).filter((m) => m.boss);
    expect(bosses).toHaveLength(1);
    expect(bosses[0].hp).toBeGreaterThan(100);
  });

  it('monsters spawn away from the arrival point', () => {
    const d = generateDungeon('mon-seed');
    const lvl = getLevel(d, 4);
    for (const m of spawnMonsters(d.seed, lvl)) {
      const dist = Math.abs(m.col - lvl.entry.col) + Math.abs(m.row - lvl.entry.row);
      expect(dist).toBeGreaterThanOrEqual(6);
    }
  });
});
