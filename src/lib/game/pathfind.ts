// Grid pathfinding for click-to-travel and auto-explore. Pure + deterministic
// (no IO), so it's unit-tested and runs on the CLIENT: the client plots a route
// over the locally-regenerated geometry, then streams `move` intents one step at
// a time — the server still validates every step (see gameServer.handleMove).
//
// Movement matches the player's 8-way step model exactly: a step is legal iff
// the destination cell isn't a wall (the server only checks the target cell), so
// every step a path yields is one the server will honour. Optional avoid-sets
// let callers route around known hazards (pits) and spotted traps.

import { blocksMove, propsAt, type Level } from './terrain.ts';
import { cellIndex } from './grid.ts';

export interface Step {
  col: number;
  row: number;
}

export interface PathOptions {
  /** Route around terrain that drops you a floor (pits/chasms). A flier turns
   *  this off — that is what flight is for. Water is fine; you just get wet. */
  avoidHazards?: boolean;
  /** Route around terrain that injures whoever enters it (lava). Separate from
   *  `avoidHazards` on purpose: flight clears what is underfoot, not what is
   *  molten, so a flier still needs this on. Defaults to on for that reason —
   *  a caller must opt IN to routing something through harm. */
  allowHarmful?: boolean;
  /** Extra cell indices to treat as impassable (e.g. revealed armed traps). */
  blocked?: Set<number>;
}

const DIRS: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Can a traveller enter (col,row) given the level + avoid-sets? Mirrors the
 *  server's `blocksMove` (walls/out-of-bounds), plus caller-supplied hazards. */
function passable(level: Level, col: number, row: number, opts: PathOptions): boolean {
  if (blocksMove(level, col, row)) return false;
  if (opts.blocked?.has(cellIndex(col, row, level.cols))) return false;
  // Ask the terrain registry what entering COSTS rather than naming kinds, so a
  // newly-added lethal terrain is routed around the day it lands.
  const props = propsAt(level, col, row);
  if (opts.avoidHazards && props.descends) return false;
  if (!opts.allowHarmful && props.contactDamage > 0) return false;
  return true;
}

/**
 * Shortest 8-way route from `start` to `goal`, as the list of Steps AFTER start
 * (so `path[0]` is the first cell to move onto and the last is `goal`). Returns
 * `null` when the goal is unreachable or itself impassable. BFS — uniform step
 * cost, so the first path found is the fewest-moves path.
 */
export function findPath(
  level: Level,
  start: Step,
  goal: Step,
  opts: PathOptions = {},
): Step[] | null {
  if (start.col === goal.col && start.row === goal.row) return [];
  if (!passable(level, goal.col, goal.row, opts)) return null;

  const startIdx = cellIndex(start.col, start.row, level.cols);
  const goalIdx = cellIndex(goal.col, goal.row, level.cols);
  const prev = new Map<number, number>(); // cell → the cell we reached it from
  const seen = new Set<number>([startIdx]);
  let frontier: number[] = [startIdx];

  while (frontier.length) {
    const next: number[] = [];
    for (const idx of frontier) {
      const c = idx % level.cols;
      const r = (idx - c) / level.cols;
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= level.cols || nr >= level.rows) continue;
        const nIdx = cellIndex(nc, nr, level.cols);
        if (seen.has(nIdx)) continue;
        if (!passable(level, nc, nr, opts)) continue;
        seen.add(nIdx);
        prev.set(nIdx, idx);
        if (nIdx === goalIdx) return reconstruct(prev, startIdx, goalIdx, level.cols);
        next.push(nIdx);
      }
    }
    frontier = next;
  }
  return null;
}

/** Walk `prev` back from goal to start and emit the forward Step list. */
function reconstruct(prev: Map<number, number>, startIdx: number, goalIdx: number, cols: number): Step[] {
  const path: Step[] = [];
  let cur = goalIdx;
  while (cur !== startIdx) {
    path.push({ col: cur % cols, row: Math.floor(cur / cols) });
    cur = prev.get(cur)!;
  }
  path.reverse();
  return path;
}

/**
 * Nearest reachable cell that hasn't been explored yet (auto-explore target).
 * BFS outward from `start` over passable cells; the first passable cell flagged
 * un-explored in `explored` is the closest frontier. Returns null when the whole
 * reachable area is already explored.
 */
export function nearestUnexplored(
  level: Level,
  start: Step,
  explored: boolean[],
  opts: PathOptions = {},
): Step | null {
  const startIdx = cellIndex(start.col, start.row, level.cols);
  const seen = new Set<number>([startIdx]);
  let frontier: number[] = [startIdx];
  while (frontier.length) {
    const next: number[] = [];
    for (const idx of frontier) {
      const c = idx % level.cols;
      const r = (idx - c) / level.cols;
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= level.cols || nr >= level.rows) continue;
        const nIdx = cellIndex(nc, nr, level.cols);
        if (seen.has(nIdx)) continue;
        seen.add(nIdx);
        if (!passable(level, nc, nr, opts)) continue;
        if (!explored[nIdx]) return { col: nc, row: nr };
        next.push(nIdx);
      }
    }
    frontier = next;
  }
  return null;
}
