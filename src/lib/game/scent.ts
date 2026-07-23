// Scent — the substrate Brogue's pursuit is built on. Delvers constantly shed
// scent at the cell they occupy; it seeps into the neighbouring cells and fades
// over the following turns, leaving a decaying gradient that points back along
// the route the party actually walked. A monster that has lost sight of you
// follows that gradient instead of teleport-tracking your exact position, so
// breaking line of sight, doubling back, or simply out-running the trail are all
// real ways to escape.
//
// This is a FIELD that OVERLAYS the grid, in the same shape as the fire/gas
// simulation (hazards.ts): one ScentField mirrors one Level, the server holds
// one per active floor, seeds it each turn from every living delver's cell
// (emitScent), advances it once per turn (stepScent), and the monster AI reads
// it (scentAt / strongestScentNeighbour). This module owns the simulation and
// its queries and NOTHING else — no wiring, no AI, no IO.
//
// Determinism: diffusion and decay are plain arithmetic over the field, so a
// given sequence of emissions always yields a bit-identical field on every
// server and client. There is deliberately no RNG here — the *fallibility* of
// pursuit belongs to the monster brain (monsterAi.ts), not to the physics.

import { cellIndex, inBounds, DIRS8, type Cell } from './grid.ts';
import { blocksMove, type Level } from './terrain.ts';

// ── tuning constants (named, not magic; Brogue-inspired, not Brogue-exact) ────

/** Strength of the trace a delver leaves on the cell it stands in. The field is
 *  pinned to this at the source, so scent lives in [0, SCENT_FRESH] and is
 *  always strongest where the delver actually is. */
export const SCENT_FRESH = 1;

/** Fraction of the strength gap exchanged with each open neighbour per turn.
 *  Must be ≤ 1/8 so the update stays a convex blend over the 8 neighbours
 *  (bounded, no overshoot) — the same discrete-diffusion argument as the gas
 *  field, widened from 4 to 8 neighbours because delvers move 8-way: a scent
 *  metric that matches the movement metric makes gradient-following pick the
 *  same steps a shortest path would. */
const SCENT_DIFFUSE = 0.1;

/** Multiplicative strength retained each turn — an untended trail goes cold. */
const SCENT_DECAY = 0.94;

/** Below this a cell's trace is gone (snapped to 0). This is what gives the
 *  trail a finite length instead of an infinitely thin exponential tail: with
 *  the diffusion/decay pair above, a continuously-emitting delver's trail
 *  reaches roughly 20 cells before falling under the floor. */
const SCENT_MIN = 1e-4;

// ── the field ────────────────────────────────────────────────────────────────

export interface ScentField {
  readonly cols: number;
  readonly rows: number;
  /** Trace strength per cell, row-major. 0 = no scent; otherwise (0, SCENT_FRESH]. */
  readonly scent: Float32Array;
  // ── working memory (internal; not part of the read API) ───────────────────
  // Owned by the field rather than allocated per step (as the gas sim does)
  // because scent advances on EVERY turn, so per-step allocation would be
  // permanent churn.
  /** Double-buffer for the diffusion pass. */
  readonly next: Float32Array;
  /** Passability mask refreshed at the top of each step: 1 = scent may occupy
   *  and diffuse through this cell. Computed once per cell instead of being
   *  re-derived for all nine cells of every neighbourhood. */
  readonly open: Uint8Array;
}

/** An empty scent field sized to a level. */
export function makeScentField(cols: number, rows: number): ScentField {
  const n = cols * rows;
  return {
    cols,
    rows,
    scent: new Float32Array(n),
    next: new Float32Array(n),
    open: new Uint8Array(n),
  };
}

/** Convenience: a field matching a level's dimensions. */
export function makeScentFieldForLevel(level: Level): ScentField {
  return makeScentField(level.cols, level.rows);
}

// ── seeding (the server calls this for every living delver, every turn) ───────

/** Lay down a fresh trace at a cell. Takes the MAX with what's already there —
 *  a cell smells "as fresh as the most recent visitor", so two delvers standing
 *  together don't reek twice as loudly and the source stays pinned at
 *  SCENT_FRESH. No-op out of bounds or for non-positive strength. */
export function emitScent(
  field: ScentField,
  col: number,
  row: number,
  strength: number = SCENT_FRESH,
): void {
  if (strength <= 0 || !inBounds(col, row, field.cols, field.rows)) return;
  const i = cellIndex(col, row, field.cols);
  const fresh = Math.min(SCENT_FRESH, strength);
  if (fresh > field.scent[i]) field.scent[i] = fresh;
}

// ── queries ──────────────────────────────────────────────────────────────────

/** Trace strength at a cell; 0 if none / out of bounds. */
export function scentAt(field: ScentField, col: number, row: number): number {
  if (!inBounds(col, row, field.cols, field.rows)) return 0;
  return field.scent[cellIndex(col, row, field.cols)];
}

/** Is there any trail left at all? Lets the server stop ticking a cold floor. */
export function scentActive(field: ScentField): boolean {
  for (let i = 0; i < field.scent.length; i++) if (field.scent[i] > 0) return true;
  return false;
}

/**
 * The neighbouring cell with the strongest scent, or null when nothing nearby
 * smells stronger than where the sniffer already stands (no trail, or it is
 * standing on the freshest point of one). `canEnter` filters out cells this
 * particular sniffer can't occupy (walls, hazards, other actors) — passability
 * is the caller's domain, not the field's.
 *
 * Ties resolve by DIRS8 order, so the choice is deterministic.
 */
export function strongestScentNeighbour(
  field: ScentField,
  from: Cell,
  canEnter: (col: number, row: number) => boolean,
): Cell | null {
  let best: Cell | null = null;
  let bestScent = scentAt(field, from.col, from.row);
  for (const d of DIRS8) {
    const col = from.col + d.col;
    const row = from.row + d.row;
    const here = scentAt(field, col, row);
    if (here <= bestScent) continue;
    if (!canEnter(col, row)) continue;
    best = { col, row };
    bestScent = here;
  }
  return best;
}

// ── the tick ─────────────────────────────────────────────────────────────────

/**
 * Advance the field one turn, in place: every trace bleeds into its open
 * neighbours and then fades. `level` supplies the terrain — cells that block
 * movement hold no scent and are never diffused through, so a trail can't seep
 * through a wall into the room next door (it has to go around, which is exactly
 * what makes the gradient a usable route).
 *
 * Call once per turn, AFTER emitting from the delvers' cells.
 */
export function stepScent(field: ScentField, level: Level): void {
  const { cols, rows, scent, next, open } = field;

  // Terrain can change under the field (fire burns grass away, a lever opens a
  // vault gate), so the mask is refreshed rather than cached across turns — one
  // blocksMove per cell, versus nine if each neighbourhood re-derived it.
  for (let row = 0, i = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++, i++) open[i] = blocksMove(level, col, row) ? 0 : 1;
  }

  for (let row = 0, i = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++, i++) {
      if (!open[i]) {
        next[i] = 0; // solid rock never smells of anything
        continue;
      }
      const here = scent[i];
      let v = here;
      for (let dr = -1; dr <= 1; dr++) {
        const nr = row + dr;
        if (nr < 0 || nr >= rows) continue;
        const rowBase = nr * cols;
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = col + dc;
          if (nc < 0 || nc >= cols) continue;
          const ni = rowBase + nc;
          if (!open[ni]) continue;
          v += SCENT_DIFFUSE * (scent[ni] - here);
        }
      }
      v *= SCENT_DECAY;
      next[i] = v < SCENT_MIN ? 0 : v;
    }
  }

  scent.set(next);
}
