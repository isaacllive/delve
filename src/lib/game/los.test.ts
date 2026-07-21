import { describe, it, expect } from 'vitest';
import { hasLineOfSight } from './los.ts';

// A small helper: occluders is a set of "col,row" strings with a given height.
function occ(map: Record<string, number>) {
  return (col: number, row: number) => map[`${col},${row}`] ?? 0;
}

describe('hasLineOfSight (ported, elevation-aware)', () => {
  it('clear line with no occluders is visible', () => {
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 5, row: 0 }, occ({}))).toBe(true);
  });

  it('a wall between blocks a ground-level sightline', () => {
    const o = occ({ '2,0': 3 }); // wall height 3 at (2,0)
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 5, row: 0 }, o)).toBe(false);
  });

  it('endpoints are always allowed even if they sit on an occluder', () => {
    const o = occ({ '5,0': 3 });
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 5, row: 0 }, o)).toBe(true);
  });

  it('degrades to a pure 2D check when everything is at elevation 0', () => {
    const o = occ({ '3,3': 1 }); // even a height-1 ledge blocks flat viewers
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 6, row: 6 }, o)).toBe(false);
  });

  it('an elevated viewer sees OVER a low ledge a ground viewer cannot', () => {
    const o = occ({ '3,0': 1 }); // low ledge, height 1, midway between the pair
    // Target stands on a ledge (elev 1). A ground viewer's sightline dips to
    // ~0.5 at the intervening ledge → blocked.
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 6, row: 0 }, o, 0, 1)).toBe(false);
    // A viewer up on a height-2 platform keeps the sightline at ~1.5 there → clears it.
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 6, row: 0 }, o, 2, 1)).toBe(true);
  });

  it('a tall wall still blocks even an elevated viewer', () => {
    const o = occ({ '3,0': 3 });
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 6, row: 0 }, o, 2, 0)).toBe(false);
  });
});
