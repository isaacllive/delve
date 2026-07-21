import { describe, it, expect } from 'vitest';
import { cellVisibility, VISION_RANGE_CELLS, VISION_CLEAR_FRAC } from './vision.ts';

const alwaysLos = () => true;

describe('cellVisibility (ported falloff)', () => {
  const src = [{ col: 0, row: 0 }];

  it('is full brightness inside the clear radius', () => {
    const clear = Math.floor(VISION_RANGE_CELLS * VISION_CLEAR_FRAC);
    expect(cellVisibility({ cell: { col: clear, row: 0 }, sources: src, hasLos: alwaysLos })).toBe(1);
  });

  it('is 0 beyond the vision range', () => {
    expect(
      cellVisibility({ cell: { col: VISION_RANGE_CELLS + 1, row: 0 }, sources: src, hasLos: alwaysLos }),
    ).toBe(0);
  });

  it('falls off between clear radius and range (monotonic)', () => {
    const near = cellVisibility({ cell: { col: 5, row: 0 }, sources: src, hasLos: alwaysLos });
    const far = cellVisibility({ cell: { col: 9, row: 0 }, sources: src, hasLos: alwaysLos });
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('is 0 when line of sight is blocked', () => {
    expect(cellVisibility({ cell: { col: 3, row: 0 }, sources: src, hasLos: () => false })).toBe(0);
  });

  it('takes the brightest of multiple sources', () => {
    const two = [
      { col: 0, row: 0 },
      { col: 10, row: 0 },
    ];
    // Cell adjacent to the second source should be bright thanks to it.
    expect(cellVisibility({ cell: { col: 10, row: 0 }, sources: two, hasLos: alwaysLos })).toBe(1);
  });
});
