import { describe, it, expect } from 'vitest';
import { makeCell, type Level, type TerrainKind } from './terrain.ts';
import {
  SCENT_FRESH,
  emitScent,
  makeScentField,
  makeScentFieldForLevel,
  scentAt,
  scentActive,
  stepScent,
  strongestScentNeighbour,
  type ScentField,
} from './scent.ts';

/** Build a Level from an ASCII map: '#'=wall, '.'=floor. */
function level(rows: string[]): Level {
  const cols = rows[0].length;
  const kindOf: Record<string, TerrainKind> = { '#': 'wall', '.': 'floor' };
  const cells = [];
  for (const line of rows) {
    for (const ch of line) cells.push(makeCell(kindOf[ch] ?? 'floor'));
  }
  return { cols, rows: rows.length, cells, entry: { col: 0, row: 0 } };
}

/** A delver standing still at (col,row) for `turns` turns. */
function linger(field: ScentField, lvl: Level, col: number, row: number, turns: number): void {
  for (let t = 0; t < turns; t++) {
    emitScent(field, col, row);
    stepScent(field, lvl);
  }
}

describe('the trail', () => {
  it('is strongest where the delver stands and fades with distance', () => {
    const lvl = level(['.........', '.........', '.........']);
    const field = makeScentFieldForLevel(lvl);
    linger(field, lvl, 4, 1, 20);

    // The delver's own cell is the peak of the field (it was topped up to
    // SCENT_FRESH this turn, then bled a little into its neighbours).
    const source = scentAt(field, 4, 1);
    expect(source).toBe(Math.max(...field.scent));
    // Strictly decreasing as we walk away from the delver.
    let prev = source;
    for (let col = 5; col < lvl.cols; col++) {
      const here = scentAt(field, col, 1);
      expect(here).toBeLessThan(prev);
      prev = here;
    }
  });

  it('reaches far enough to be worth following (well past melee range)', () => {
    const lvl = level(Array.from({ length: 3 }, () => '.'.repeat(24)));
    const field = makeScentFieldForLevel(lvl);
    linger(field, lvl, 2, 1, 60);
    expect(scentAt(field, 12, 1)).toBeGreaterThan(0); // 10 cells out, still traceable
  });

  it('goes completely cold once the delver stops leaving one', () => {
    const lvl = level(['.....', '.....', '.....']);
    const field = makeScentFieldForLevel(lvl);
    linger(field, lvl, 2, 1, 20);
    expect(scentActive(field)).toBe(true);

    for (let t = 0; t < 500; t++) stepScent(field, lvl); // nobody emitting any more
    expect(scentActive(field)).toBe(false);
    expect(scentAt(field, 2, 1)).toBe(0);
  });

  it('never seeps through a wall', () => {
    // Two sealed rooms, wall down the middle: the right room must stay clean.
    const lvl = level(['..#..', '..#..', '..#..']);
    const field = makeScentFieldForLevel(lvl);
    linger(field, lvl, 0, 1, 100);

    for (let row = 0; row < lvl.rows; row++) {
      expect(scentAt(field, 2, row)).toBe(0); // the wall itself holds nothing
      expect(scentAt(field, 3, row)).toBe(0);
      expect(scentAt(field, 4, row)).toBe(0);
    }
  });

  it('flows around a corner instead of through it', () => {
    // An L-shaped corridor: the only way from the delver to (5,0) is round the
    // bend at (0,4), so scent must arrive by that route (or not at all).
    const lvl = level([
      '#.####',
      '#.####',
      '#.####',
      '#.####',
      '#.....',
    ]);
    const field = makeScentFieldForLevel(lvl);
    linger(field, lvl, 5, 4, 80); // delver at the far end of the bottom leg

    expect(scentAt(field, 1, 0)).toBeGreaterThan(0); // made it up the other leg
    // ...and the strength drops monotonically as you walk back up that leg.
    expect(scentAt(field, 1, 4)).toBeGreaterThan(scentAt(field, 1, 2));
    expect(scentAt(field, 1, 2)).toBeGreaterThan(scentAt(field, 1, 0));
  });

  it('stays within [0, SCENT_FRESH] everywhere, always', () => {
    const lvl = level(['......', '......', '......', '......']);
    const field = makeScentFieldForLevel(lvl);
    for (let t = 0; t < 60; t++) {
      emitScent(field, 2, 2);
      emitScent(field, 3, 1);
      stepScent(field, lvl);
      for (const v of field.scent) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(SCENT_FRESH);
      }
    }
  });
});

describe('emitting', () => {
  it('ignores out-of-bounds and non-positive emissions', () => {
    const field = makeScentField(3, 3);
    emitScent(field, -1, 0);
    emitScent(field, 3, 3);
    emitScent(field, 1, 1, 0);
    expect(scentActive(field)).toBe(false);
    expect(scentAt(field, -1, 0)).toBe(0);
  });

  it('keeps the freshest trace at a cell rather than stacking delvers', () => {
    const field = makeScentField(3, 3);
    emitScent(field, 1, 1);
    emitScent(field, 1, 1); // a second delver in the same cell
    expect(scentAt(field, 1, 1)).toBe(SCENT_FRESH);
  });
});

describe('strongestScentNeighbour', () => {
  it('points up the gradient, toward the delver', () => {
    const lvl = level(['.........', '.........', '.........']);
    const field = makeScentFieldForLevel(lvl);
    linger(field, lvl, 8, 1, 40);

    const step = strongestScentNeighbour(field, { col: 4, row: 1 }, () => true);
    expect(step).not.toBeNull();
    expect(step!.col).toBe(5); // closer to the delver than where we started
  });

  it('returns null when nothing nearby smells of anything', () => {
    const field = makeScentField(5, 5);
    expect(strongestScentNeighbour(field, { col: 2, row: 2 }, () => true)).toBeNull();
  });

  it('skips cells the sniffer cannot enter', () => {
    const lvl = level(['.........', '.........', '.........']);
    const field = makeScentFieldForLevel(lvl);
    linger(field, lvl, 8, 1, 40);

    // Fence off the cell the gradient wants most: the next-best legal one wins.
    const step = strongestScentNeighbour(
      field,
      { col: 4, row: 1 },
      (col, row) => !(col === 5 && row === 1),
    );
    expect(step).not.toBeNull();
    expect(step).not.toEqual({ col: 5, row: 1 });
    expect(step!.col).toBe(5); // still heads toward the delver, just off-axis
  });
});

describe('determinism', () => {
  it('same emissions → bit-identical field', () => {
    const build = (): ScentField => {
      const lvl = level(['..........', '..#....#..', '..........', '....##....', '..........']);
      const field = makeScentFieldForLevel(lvl);
      for (let t = 0; t < 30; t++) {
        emitScent(field, 1 + (t % 7), 2);
        stepScent(field, lvl);
      }
      return field;
    };
    expect(Array.from(build().scent)).toEqual(Array.from(build().scent));
  });
});
