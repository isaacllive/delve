// Guardian statues — Brogue's mirror-movement puzzle. Inside a guardian vault,
// each statue copies the delver's every step: move (dcol,drow) and every
// guardian tries to move the same (dcol,drow). A guardian is stopped by walls
// (and closed gates) and won't share a cell with the delver or another guardian,
// so you use the room's geometry — stepping where a guardian will hit a wall —
// to slip past them to the reward. Pure + deterministic.

import { blocksMove, type Level } from './terrain.ts';

export interface GuardianPos {
  col: number;
  row: number;
}

/**
 * Move every guardian by (dcol,drow) where it can. A guardian holds its ground
 * if the mirrored step would take it into a wall/gate/off-map, onto the delver
 * (or a monster — via `occupied`), or onto a cell another guardian holds or has
 * already claimed this step. Returns NEW positions; does not mutate the input.
 *
 * Simultaneous resolution is kept conservative (a guardian never moves into a
 * cell another guardian currently occupies, even if that one is also moving), so
 * two statues can never swap or overlap — which is all the vaults' 1–2 guardians
 * need.
 */
export function mirrorGuardians(
  guardians: readonly GuardianPos[],
  dcol: number,
  drow: number,
  level: Level,
  occupied: (col: number, row: number) => boolean,
): GuardianPos[] {
  const current = new Set(guardians.map((g) => g.row * level.cols + g.col));
  const claimed = new Set<number>();
  return guardians.map((g) => {
    const nc = g.col + dcol;
    const nr = g.row + drow;
    const key = nr * level.cols + nc;
    const canMove =
      (dcol !== 0 || drow !== 0) &&
      !blocksMove(level, nc, nr) && // wall / closed gate / off-map stops it
      !occupied(nc, nr) && // the delver or a monster is there
      !current.has(key) && // another statue currently stands there
      !claimed.has(key); // …or has already stepped there this move
    if (!canMove) return { col: g.col, row: g.row };
    claimed.add(key);
    return { col: nc, row: nr };
  });
}
