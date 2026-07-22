import { describe, it, expect } from 'vitest';
import { generateDungeon, getLevel, type Dungeon, type DungeonLevel } from './dungeon.ts';
import { cellAt } from './terrain.ts';

/** BFS over all non-wall cells from the level entry; returns the count reached. */
function reachableFrom(level: DungeonLevel, start: { col: number; row: number }): number {
  const seen = new Set<number>();
  const q = [start];
  while (q.length) {
    const { col, row } = q.shift()!;
    if (col < 0 || row < 0 || col >= level.cols || row >= level.rows) continue;
    const key = row * level.cols + col;
    if (seen.has(key)) continue;
    const c = cellAt(level, col, row);
    if (!c || c.kind === 'wall') continue;
    seen.add(key);
    q.push({ col: col + 1, row }, { col: col - 1, row }, { col, row: row + 1 }, { col, row: row - 1 });
  }
  return seen.size;
}

function countNonWall(level: DungeonLevel): number {
  return level.cells.filter((c) => c.kind !== 'wall').length;
}

function levels(d: Dungeon, n = d.levelCount): DungeonLevel[] {
  return Array.from({ length: n }, (_, i) => getLevel(d, i));
}

describe('generateDungeon (lazy, biome-aware)', () => {
  it('a floor is deterministic — same seed yields identical geometry', () => {
    const a = getLevel(generateDungeon('crypt-of-ash-42'), 3);
    const b = getLevel(generateDungeon('crypt-of-ash-42'), 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds yield different floors', () => {
    const a = getLevel(generateDungeon('seed-one'), 3);
    const b = getLevel(generateDungeon('seed-two'), 3);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('defaults to a 26-floor descent (Brogue depth)', () => {
    expect(generateDungeon('x').levelCount).toBe(26);
  });

  it('caches floors — repeated getLevel returns the same object', () => {
    const d = generateDungeon('cache');
    expect(getLevel(d, 5)).toBe(getLevel(d, 5));
  });

  it('carves a substantial open cavern on each floor', () => {
    const d = generateDungeon('halls', { levelCount: 4 });
    for (const lvl of levels(d)) {
      expect(lvl.openCount).toBeGreaterThan(lvl.cols * lvl.rows * 0.15);
    }
  });

  it('every non-wall cell is reachable from the entry (connectivity)', () => {
    for (const seed of ['a1', 'b2', 'c3']) {
      const d = generateDungeon(seed, { levelCount: 4 });
      for (const lvl of levels(d)) {
        expect(reachableFrom(lvl, lvl.entry)).toBe(countNonWall(lvl));
      }
    }
  });

  it('pairs stairs across a run (floor 0 up-stair retreats to camp)', () => {
    const d = generateDungeon('stairs-check', { levelCount: 3 });
    const [l0, l1, l2] = levels(d);
    expect(l0.stairsUp).toBeDefined(); // floor 0 retreats to base camp
    expect(l0.stairsDown).toBeDefined();
    expect(l1.stairsUp).toBeDefined();
    expect(l1.stairsDown).toBeDefined();
    expect(l2.stairsUp).toBeDefined();
    expect(l2.stairsDown).toBeUndefined();
  });

  it('has a base camp at depth -1 with a portal and shops', () => {
    const d = generateDungeon('camp-check');
    const camp = getLevel(d, -1);
    expect(camp.camp).toBe(true);
    expect(camp.portal).toBeDefined();
    expect(camp.shops?.length).toBeGreaterThan(0);
  });

  it('puts a boss + exit on the bottom floor only', () => {
    const d = generateDungeon('boss', { levelCount: 3 });
    const [l0, l1, l2] = levels(d);
    expect(l0.boss).toBeUndefined();
    expect(l1.boss).toBeUndefined();
    expect(l2.boss).toBeDefined();
    expect(l2.exit).toEqual(l2.boss);
  });

  it('maps grow larger with depth', () => {
    const d = generateDungeon('grow', { levelCount: 26 });
    expect(getLevel(d, 20).cols).toBeGreaterThan(getLevel(d, 0).cols);
  });

  it('assigns the five biomes by depth band (5 floors each)', () => {
    const d = generateDungeon('biomes', { levelCount: 26 });
    expect(getLevel(d, 0).biomeName).toBe('Caves');
    expect(getLevel(d, 5).biomeName).toBe('Ruins');
    expect(getLevel(d, 10).biomeName).toBe('Lava Zone');
    expect(getLevel(d, 15).biomeName).toBe('Ancient City');
    expect(getLevel(d, 20).biomeName).toBe('Corrupted Halls');
    expect(getLevel(d, 25).biomeName).toBe('Corrupted Halls'); // last band runs long
  });

  it('creates verticality — ledges/pits/water somewhere in a run', () => {
    const d = generateDungeon('vertical', { levelCount: 3 });
    const kinds = new Set(levels(d).flatMap((l) => l.cells.map((c) => c.kind)));
    expect(kinds.has('ledge') || kinds.has('pit') || kinds.has('water')).toBe(true);
  });
});
