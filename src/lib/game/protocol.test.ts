import { describe, it, expect } from 'vitest';
import { turnFacing, compassLabel, headingOf } from './protocol.ts';

const N = 0;
const NE = Math.PI / 4;
const E = Math.PI / 2;
const NW = (7 * Math.PI) / 4;

describe('turnFacing', () => {
  it('steps one wind (45°) to the closest direction, not the next of the same family', () => {
    // Facing North (vertical), a right turn lands on NE — the closest wind —
    // rather than jumping to East.
    expect(compassLabel(turnFacing(N, 1))).toBe('NE');
    // From a diagonal, the next turn reaches the adjacent cardinal (E), so all
    // eight headings are reachable by repeated turns.
    expect(compassLabel(turnFacing(NE, 1))).toBe('E');
  });

  it('turns left (−1) anticlockwise', () => {
    expect(compassLabel(turnFacing(N, -1))).toBe('NW');
    expect(compassLabel(turnFacing(NE, -1))).toBe('N');
  });

  it('wraps around the compass in both directions', () => {
    expect(compassLabel(turnFacing(NW, 1))).toBe('N'); // 315° + 45° → 0°
    expect(compassLabel(turnFacing(N, -1))).toBe('NW'); // 0° − 45° → 315°
  });

  it('eight right turns return to the start', () => {
    let f = N;
    for (let i = 0; i < 8; i++) f = turnFacing(f, 1);
    expect(f).toBeCloseTo(N);
  });

  it('snaps an off-grid facing onto the nearest wind before stepping', () => {
    // 0.05 rad is a hair off North; a right turn still resolves to NE.
    expect(compassLabel(turnFacing(0.05, 1))).toBe('NE');
  });

  it('is consistent with headingOf for the resulting grid step', () => {
    const east = turnFacing(N, 2); // two winds clockwise = East
    expect(compassLabel(east)).toBe('E');
    expect(headingOf(1, 0)).toBeCloseTo(E);
  });
});
