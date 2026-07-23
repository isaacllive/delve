import { describe, it, expect } from 'vitest';
import { cellIndex } from './grid.ts';
import { makeRng } from './rng.ts';
import { isColonisable, stepCreep } from './creep.ts';
import { makeCell, revealCell, type Level, type TerrainKind } from './terrain.ts';

function makeLevel(cols: number, rows: number, kind: TerrainKind = 'floor'): Level {
  const cells = Array.from({ length: cols * rows }, () => makeCell(kind));
  return { cols, rows, cells, entry: { col: 0, row: 0 } };
}

function set(level: Level, col: number, row: number, kind: TerrainKind): void {
  level.cells[cellIndex(col, row, level.cols)] = makeCell(kind);
}

function kindAt(level: Level, col: number, row: number): TerrainKind {
  return level.cells[cellIndex(col, row, level.cols)].kind;
}

function count(level: Level, kind: TerrainKind): number {
  return level.cells.filter((c) => c.kind === kind).length;
}

/** Advance n turns with a fresh seeded rng. */
function run(level: Level, turns: number, seed = 'creep-seed'): void {
  const rng = makeRng(seed);
  for (let i = 0; i < turns; i++) stepCreep(level, rng);
}

describe('creeping terrain', () => {
  it('spreads over time from a single seed patch', () => {
    const level = makeLevel(15, 15);
    set(level, 7, 7, 'lichen');
    run(level, 400);
    expect(count(level, 'lichen')).toBeGreaterThan(1);
  });

  it('spreads slowly — a single patch does not engulf a floor in a few turns', () => {
    const level = makeLevel(15, 15);
    set(level, 7, 7, 'lichen');
    run(level, 10);
    expect(count(level, 'lichen')).toBeLessThan(5);
  });

  it('is deterministic for a given seed', () => {
    const a = makeLevel(12, 12);
    const b = makeLevel(12, 12);
    set(a, 5, 5, 'lichen');
    set(b, 5, 5, 'lichen');
    run(a, 300);
    run(b, 300);
    expect(a.cells.map((c) => c.kind)).toEqual(b.cells.map((c) => c.kind));
  });

  it('leaves a level with nothing that creeps completely alone', () => {
    const level = makeLevel(10, 10, 'grass');
    set(level, 3, 3, 'water');
    const before = level.cells.map((c) => c.kind);
    const rng = makeRng('quiet');
    let changed = 0;
    for (let i = 0; i < 200; i++) changed += stepCreep(level, rng);
    expect(changed).toBe(0);
    expect(level.cells.map((c) => c.kind)).toEqual(before);
  });

  it('reports how many cells it grew, so a quiet turn can be skipped', () => {
    const level = makeLevel(9, 9);
    set(level, 4, 4, 'lichen');
    const rng = makeRng('counting');
    let grown = 0;
    for (let i = 0; i < 300; i++) grown += stepCreep(level, rng);
    expect(grown).toBe(count(level, 'lichen') - 1);
  });

  it('colonises bare ground and grass only', () => {
    const level = makeLevel(4, 1);
    set(level, 0, 0, 'floor');
    set(level, 1, 0, 'grass');
    set(level, 2, 0, 'water');
    set(level, 3, 0, 'wall');
    expect(isColonisable(level, 0, 0)).toBe(true);
    expect(isColonisable(level, 1, 0)).toBe(true);
    expect(isColonisable(level, 2, 0)).toBe(false);
    expect(isColonisable(level, 3, 0)).toBe(false);
    expect(isColonisable(level, -1, 0)).toBe(false);
    expect(isColonisable(level, 0, 9)).toBe(false);
  });

  it('never grows onto structural or hazardous terrain', () => {
    // Lichen boxed in by everything it must not overwrite: after a long run the
    // enclosure is untouched, so a level's only staircase can never be lost.
    const protectedKinds: TerrainKind[] = [
      'stairsDown',
      'stairsUp',
      'gate',
      'wall',
      'pit',
      'water',
      'deepWater',
      'lava',
      'bog',
      'bridge',
      'ledge',
      'web',
    ];
    const level = makeLevel(protectedKinds.length, 3, 'floor');
    protectedKinds.forEach((kind, col) => {
      set(level, col, 0, kind);
      set(level, col, 1, 'lichen');
      set(level, col, 2, kind);
    });
    run(level, 500);
    protectedKinds.forEach((kind, col) => {
      expect(kindAt(level, col, 0), kind).toBe(kind);
      expect(kindAt(level, col, 2), kind).toBe(kind);
    });
  });

  it('cannot give away an unfound secret door by growing over it', () => {
    const level = makeLevel(3, 3, 'lichen');
    set(level, 1, 1, 'secretDoor');
    run(level, 500);
    expect(kindAt(level, 1, 1)).toBe('secretDoor');
  });

  it('opens up a revealed doorway to growth, but never an unfound one', () => {
    const level = makeLevel(1, 1, 'secretDoor');
    expect(isColonisable(level, 0, 0)).toBe(false); // unfound: it is wall rock
    level.cells[0] = revealCell(level.cells[0]);
    expect(isColonisable(level, 0, 0)).toBe(true); // found: an open passage
  });

  it('does not chain within a single turn', () => {
    // Growth is collected from the current generation and applied afterwards, so
    // a turn can never grow more cells than there were sources at its start.
    const level = makeLevel(20, 20);
    set(level, 10, 10, 'lichen');
    const rng = makeRng('chain');
    for (let i = 0; i < 300; i++) {
      const sources = count(level, 'lichen');
      expect(stepCreep(level, rng)).toBeLessThanOrEqual(sources);
    }
  });
});
