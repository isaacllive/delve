// Pure grid geometry. Ported from RealmQuest VTT (src/lib/scene.ts,
// src/lib/targeting.ts) — the coordinate + distance conventions are shared so
// the vision/LoS math behaves identically. One grid cell == one 3D world unit.

export interface Cell {
  col: number;
  row: number;
}

/** Row-major flat index for a (col, row) on a `cols`-wide grid. */
export function cellIndex(col: number, row: number, cols: number): number {
  return row * cols + col;
}

/** Inverse of cellIndex. */
export function cellOf(index: number, cols: number): Cell {
  return { col: index % cols, row: Math.floor(index / cols) };
}

/** Chebyshev (king-move) distance — diagonals cost 1, like RealmQuest. */
export function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/** Chebyshev distance INCLUDING elevation: a vertical cell of height counts
 *  the same as a horizontal one (ported from targeting.ts `gridDistance3D`).
 *  So a token directly overhead reads as distance = its elevation. */
export function gridDistance3D(
  a: Cell & { elevation?: number },
  b: Cell & { elevation?: number },
): number {
  return Math.max(
    Math.abs(a.col - b.col),
    Math.abs(a.row - b.row),
    Math.abs((a.elevation ?? 0) - (b.elevation ?? 0)),
  );
}

/** Bounds test. */
export function inBounds(col: number, row: number, cols: number, rows: number): boolean {
  return col >= 0 && row >= 0 && col < cols && row < rows;
}

/** The 8 king-move neighbours of a cell (unclamped). */
export const DIRS8: ReadonlyArray<Cell> = [
  { col: 0, row: -1 }, // N
  { col: 1, row: -1 }, // NE
  { col: 1, row: 0 }, // E
  { col: 1, row: 1 }, // SE
  { col: 0, row: 1 }, // S
  { col: -1, row: 1 }, // SW
  { col: -1, row: 0 }, // W
  { col: -1, row: -1 }, // NW
];

/** The 4 orthogonal neighbours. */
export const DIRS4: ReadonlyArray<Cell> = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
];
