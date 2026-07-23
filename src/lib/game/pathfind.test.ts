import { describe, it, expect } from 'vitest';
import { makeCell, type Level, type TerrainKind } from './terrain.ts';
import { cellIndex } from './grid.ts';
import { findPath, nearestUnexplored } from './pathfind.ts';

/** Build a Level from an ASCII map: '#'=wall, '.'=floor, 'o'=pit, '~'=water. */
function level(rows: string[]): Level {
  const h = rows.length;
  const w = rows[0].length;
  const kindOf: Record<string, TerrainKind> = { '#': 'wall', '.': 'floor', o: 'pit', '~': 'water' };
  const cells = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) cells.push(makeCell(kindOf[rows[r][c]] ?? 'floor'));
  }
  return { cols: w, rows: h, cells, entry: { col: 0, row: 0 } };
}

describe('findPath', () => {
  it('returns an empty path when already at the goal', () => {
    const l = level(['...', '...']);
    expect(findPath(l, { col: 1, row: 1 }, { col: 1, row: 1 })).toEqual([]);
  });

  it('takes the diagonal shortcut across open floor', () => {
    const l = level(['....', '....', '....', '....']);
    const path = findPath(l, { col: 0, row: 0 }, { col: 3, row: 3 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3); // 3 diagonal steps
    expect(path![path!.length - 1]).toEqual({ col: 3, row: 3 });
  });

  it('routes around a wall', () => {
    // A vertical wall in column 2 with a gap at the bottom row.
    const l = level([
      '.....',
      '..#..',
      '..#..',
      '.....',
    ]);
    const path = findPath(l, { col: 0, row: 1 }, { col: 4, row: 1 });
    expect(path).not.toBeNull();
    for (const s of path!) expect(l.cells[cellIndex(s.col, s.row, l.cols)].kind).not.toBe('wall');
    expect(path![path!.length - 1]).toEqual({ col: 4, row: 1 });
  });

  it('returns null when the goal is walled off on all sides', () => {
    // (2,2) is enclosed by walls on all 8 neighbours — unreachable even diagonally.
    const l = level([
      '.....',
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ]);
    expect(findPath(l, { col: 0, row: 0 }, { col: 2, row: 2 })).toBeNull();
  });

  it('returns null when the goal itself is a wall', () => {
    const l = level(['...', '.#.', '...']);
    expect(findPath(l, { col: 0, row: 0 }, { col: 1, row: 1 })).toBeNull();
  });

  it('avoids pits when asked, but crosses them otherwise', () => {
    // A pit wall in column 2 (rows 0–2); the only detour is around the bottom.
    const l = level([
      '..o..',
      '..o..',
      '..o..',
      '.....',
    ]);
    const across = findPath(l, { col: 0, row: 0 }, { col: 4, row: 0 });
    const around = findPath(l, { col: 0, row: 0 }, { col: 4, row: 0 }, { avoidHazards: true });
    expect(across).not.toBeNull();
    expect(around).not.toBeNull();
    // The hazard-avoiding route must never step onto a pit and is longer.
    for (const s of around!) expect(l.cells[cellIndex(s.col, s.row, l.cols)].kind).not.toBe('pit');
    expect(around!.length).toBeGreaterThan(across!.length);
  });

  it('honours the extra blocked set', () => {
    const l = level(['...', '...', '...']);
    const blocked = new Set([cellIndex(1, 1, l.cols)]);
    const path = findPath(l, { col: 0, row: 1 }, { col: 2, row: 1 }, { blocked });
    expect(path).not.toBeNull();
    expect(path!.some((s) => s.col === 1 && s.row === 1)).toBe(false);
  });
});

describe('nearestUnexplored', () => {
  it('finds the closest un-explored reachable cell', () => {
    const l = level(['....', '....', '....']);
    const explored = new Array(l.cols * l.rows).fill(false);
    // Mark everything explored except a far corner.
    for (let i = 0; i < explored.length; i++) explored[i] = true;
    explored[cellIndex(3, 2, l.cols)] = false;
    const target = nearestUnexplored(l, { col: 0, row: 0 }, explored);
    expect(target).toEqual({ col: 3, row: 2 });
  });

  it('returns null when everything reachable is explored', () => {
    const l = level(['...', '...']);
    const explored = new Array(l.cols * l.rows).fill(true);
    expect(nearestUnexplored(l, { col: 0, row: 0 }, explored)).toBeNull();
  });
});
