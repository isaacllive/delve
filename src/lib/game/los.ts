// Line of sight. Ported from RealmQuest VTT `hasLineOfSight`
// (src/lib/targeting.ts) — the same Bresenham walk with elevation-aware
// occlusion — and generalized so each occluder has its OWN height (walls tall,
// ledges short) instead of one global wall height. This is what makes terrain
// verticality read: a viewer high on a platform sees over a low ledge a
// ground-level viewer can't.
//
// Faithfulness note: with all elevations 0 and any positive occluder height,
// the interpolated sightline height is 0 ≤ height, so every occluder blocks —
// i.e. it degrades to a pure 2D visibility check, exactly like the original.

import type { Cell } from './grid.ts';

/**
 * Bresenham line-of-sight from `a` to `b`, exclusive of the endpoints. Returns
 * true when the line is clear.
 *
 * `occluderHeight(col,row)` returns the occluding height at a cell (0 = not an
 * occluder). A cell only blocks the line when the sightline's interpolated
 * height as it passes over the cell is at or below that occluder's height — so
 * an elevated viewer / target can see over lower obstacles.
 *
 * `aElev` / `bElev` are the viewer and target heights (cells). The endpoints
 * themselves are always allowed (you can see your own cell and the target's
 * cell regardless of terrain there).
 */
export function hasLineOfSight(
  a: Cell,
  b: Cell,
  occluderHeight: (col: number, row: number) => number,
  aElev = 0,
  bElev = 0,
): boolean {
  let x0 = a.col,
    y0 = a.row;
  const x1 = b.col,
    y1 = b.row;
  const dx = Math.abs(x1 - x0),
    dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const total = Math.hypot(x1 - a.col, y1 - a.row);

  while (!(x0 === x1 && y0 === y1)) {
    if (!(x0 === a.col && y0 === a.row)) {
      const occ = occluderHeight(x0, y0);
      if (occ > 0) {
        // Height of the sightline as it passes over this cell.
        const t = total > 0 ? Math.hypot(x0 - a.col, y0 - a.row) / total : 0;
        const h = aElev + t * (bElev - aElev);
        if (h <= occ) return false; // line runs into the occluder
        // else: passes above it — keep going.
      }
    }
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return true;
}
