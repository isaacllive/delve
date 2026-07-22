import { describe, it, expect } from 'vitest';
import { generateDungeon, getLevel } from './dungeon.ts';
import { dartDamage, spawnTraps, trapAt } from './traps.ts';

describe('spawnTraps', () => {
  it('is deterministic for a floor', () => {
    const d = generateDungeon('trap-seed');
    const a = spawnTraps(d.seed, getLevel(d, 5));
    const b = spawnTraps(d.seed, getLevel(d, 5));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('spawns no traps in the base camp', () => {
    const d = generateDungeon('trap-seed');
    expect(spawnTraps(d.seed, getLevel(d, -1))).toEqual([]);
  });

  it('places traps on floor cells, never on the entry doorstep', () => {
    const d = generateDungeon('trap-seed');
    const lvl = getLevel(d, 6);
    const traps = spawnTraps(d.seed, lvl);
    expect(traps.length).toBeGreaterThan(0);
    for (const t of traps) {
      const cell = lvl.cells[t.row * lvl.cols + t.col];
      expect(cell.kind).toBe('floor');
      const dist = Math.abs(t.col - lvl.entry.col) + Math.abs(t.row - lvl.entry.row);
      expect(dist).toBeGreaterThanOrEqual(4);
      expect(t.sprung).toBe(false);
      expect(t.revealed).toBe(false);
    }
  });

  it('starts every trap hidden (unsprung, unrevealed)', () => {
    const d = generateDungeon('trap-seed');
    for (const t of spawnTraps(d.seed, getLevel(d, 8))) {
      expect(t.sprung).toBe(false);
      expect(t.revealed).toBe(false);
    }
  });

  it('never places a pit trap on the deepest floor (no floor to drop to)', () => {
    const d = generateDungeon('trap-seed', { levelCount: 3 });
    const traps = spawnTraps(d.seed, getLevel(d, 2));
    expect(traps.every((t) => t.kind === 'dart')).toBe(true);
  });
});

describe('trapAt', () => {
  it('finds the trap on a cell and nothing elsewhere', () => {
    const d = generateDungeon('trap-seed');
    const traps = spawnTraps(d.seed, getLevel(d, 5));
    const t = traps[0];
    expect(trapAt(traps, t.col, t.row)).toBe(t);
    expect(trapAt(traps, -1, -1)).toBeUndefined();
  });
});

describe('dartDamage', () => {
  it('scales up gently with depth', () => {
    expect(dartDamage(0)).toBe(5);
    expect(dartDamage(40)).toBeGreaterThan(dartDamage(0));
  });
});
