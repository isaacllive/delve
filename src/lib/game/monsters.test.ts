import { describe, it, expect } from 'vitest';
import { generateDungeon, getLevel } from './dungeon.ts';
import { isUnaware, nextAwareness, spawnMonsters, WAKE_RANGE } from './monsters.ts';

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

  it('occasionally spawns out-of-depth monsters from a deeper tier', () => {
    // Floors 0–19 are the first biome tier (rats/goblins); an out-of-depth roll
    // pulls a tier-2 foe (skeleton/ghoul). Over several shallow floors at least
    // one should appear, and it must still be deterministic.
    const d = generateDungeon('ood-seed');
    const deeperIds = new Set(['skeleton', 'ghoul']);
    let found = 0;
    for (let depth = 0; depth < 8; depth++) {
      for (const m of spawnMonsters(d.seed, getLevel(d, depth))) {
        if (deeperIds.has(m.kindId)) found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('ordinary monsters start asleep; the boss starts hunting', () => {
    const d = generateDungeon('mon-seed', { levelCount: 3 });
    const mons = spawnMonsters(d.seed, getLevel(d, 2));
    for (const m of mons) {
      expect(m.state).toBe(m.boss ? 'hunting' : 'sleeping');
    }
  });
});

const AGGRO = 9;

describe('nextAwareness', () => {
  it('snaps to hunting when a delver is adjacent, whatever the state', () => {
    for (const s of ['sleeping', 'wandering', 'hunting'] as const) {
      expect(nextAwareness(s, { dist: 1, los: false, aggro: AGGRO })).toBe('hunting');
    }
  });

  it('wakes a sleeper only within wake range AND with line of sight', () => {
    expect(nextAwareness('sleeping', { dist: WAKE_RANGE, los: true, aggro: AGGRO })).toBe('hunting');
    // In range but blocked → stays asleep (sneak-up window).
    expect(nextAwareness('sleeping', { dist: WAKE_RANGE, los: false, aggro: AGGRO })).toBe('sleeping');
    // Visible but too far → stays asleep.
    expect(nextAwareness('sleeping', { dist: WAKE_RANGE + 1, los: true, aggro: AGGRO })).toBe('sleeping');
  });

  it('promotes a wanderer to hunting once it sees a delver within aggro', () => {
    expect(nextAwareness('wandering', { dist: AGGRO, los: true, aggro: AGGRO })).toBe('hunting');
    expect(nextAwareness('wandering', { dist: AGGRO, los: false, aggro: AGGRO })).toBe('wandering');
    expect(nextAwareness('wandering', { dist: AGGRO + 1, los: true, aggro: AGGRO })).toBe('wandering');
  });

  it('drops a hunter to wandering when the trail goes cold (beyond aggro)', () => {
    expect(nextAwareness('hunting', { dist: AGGRO + 1, los: true, aggro: AGGRO })).toBe('wandering');
    expect(nextAwareness('hunting', { dist: AGGRO, los: false, aggro: AGGRO })).toBe('hunting');
  });
});

describe('isUnaware', () => {
  it('flags everything but hunting as sneak-attackable', () => {
    expect(isUnaware('sleeping')).toBe(true);
    expect(isUnaware('wandering')).toBe(true);
    expect(isUnaware('hunting')).toBe(false);
  });
});
