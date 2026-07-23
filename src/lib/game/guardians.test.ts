import { describe, it, expect } from 'vitest';
import { mirrorGuardians, type GuardianPos } from './guardians.ts';
import { makeCell, type Level, type TerrainKind } from './terrain.ts';

/** Build a tiny level from an ASCII map ('#' wall, '.' floor). */
function level(rows: string[]): Level {
  const cols = rows[0].length;
  const cells = rows.flatMap((r) => [...r].map((ch) => makeCell(ch === '#' ? 'wall' : ('floor' as TerrainKind))));
  return { cols, rows: rows.length, cells, entry: { col: 0, row: 0 } };
}

const noneOccupied = () => false;

describe('mirrorGuardians', () => {
  const open = level(['.....', '.....', '.....']);

  it('mirrors the delver step exactly on open ground', () => {
    const g: GuardianPos[] = [{ col: 1, row: 1 }];
    expect(mirrorGuardians(g, 1, 0, open, noneOccupied)).toEqual([{ col: 2, row: 1 }]);
    expect(mirrorGuardians(g, 0, 1, open, noneOccupied)).toEqual([{ col: 1, row: 2 }]);
    expect(mirrorGuardians(g, -1, -1, open, noneOccupied)).toEqual([{ col: 0, row: 0 }]);
  });

  it('holds still when the mirrored step hits a wall (the whole puzzle)', () => {
    const walled = level(['...', '.#.', '...']); // wall at (1,1)
    const g: GuardianPos[] = [{ col: 0, row: 1 }];
    // Stepping east would put the guardian into the wall at (1,1) → it stays.
    expect(mirrorGuardians(g, 1, 0, walled, noneOccupied)).toEqual([{ col: 0, row: 1 }]);
    // Stepping south is clear.
    expect(mirrorGuardians(g, 0, 1, walled, noneOccupied)).toEqual([{ col: 0, row: 2 }]);
  });

  it('never steps onto the delver / an occupied cell', () => {
    const g: GuardianPos[] = [{ col: 1, row: 1 }];
    const occ = (c: number, r: number) => c === 2 && r === 1;
    expect(mirrorGuardians(g, 1, 0, open, occ)).toEqual([{ col: 1, row: 1 }]);
  });

  it('two statues never overlap or swap', () => {
    const g: GuardianPos[] = [{ col: 1, row: 1 }, { col: 2, row: 1 }];
    // Both try to step east. The leader (2,1) advances to (3,1); the trailing
    // statue (1,1) won't step onto a cell a statue occupied at the start of the
    // move (conservative), so it holds — no overlap, no swap.
    const out = mirrorGuardians(g, 1, 0, open, noneOccupied);
    expect(out[0]).toEqual({ col: 1, row: 1 });
    expect(out[1]).toEqual({ col: 3, row: 1 });
    expect(new Set(out.map((p) => `${p.col},${p.row}`)).size).toBe(out.length);
  });

  it('does not mutate the input positions', () => {
    const g: GuardianPos[] = [{ col: 1, row: 1 }];
    mirrorGuardians(g, 1, 0, open, noneOccupied);
    expect(g).toEqual([{ col: 1, row: 1 }]);
  });
});
