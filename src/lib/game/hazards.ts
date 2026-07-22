// Dynamic terrain simulation — Brogue's signature living dungeon, as a pure,
// deterministic cellular automaton. Fire ignites flammable terrain (grass; later
// oil/bog), spreads to neighbours, burns the fuel away, and dies out; gas clouds
// (caustic, confusion) diffuse into open neighbours and dissipate over time.
//
// This is a FIELD that OVERLAYS the grid, kept strictly separate from the
// terrain model (terrain.ts). One HazardField mirrors one Level. The server is
// meant to hold a field per active level, seed effects into it (ignite / emitGas
// from lava, thrown potions, firebolts…), advance it one tick per world step
// (stepHazards), and read fireAt / gasAt at an actor's cell to apply damage /
// afflictions — and the renderer reads the same queries to draw flames and haze.
// This module does NONE of that wiring; it only owns the simulation + queries.
//
// Determinism: every random choice draws from the seeded Rng (rng.ts) passed to
// stepHazards, never Date.now / Math.random — so a run replays identically on
// server and client. The only terrain mutation is fuel consumption: a burning
// flammable cell is converted to plain floor (ash), which is what stops fire
// from ping-ponging forever and is authoritative on the Level the server owns.

import { cellIndex, inBounds, DIRS4, DIRS8 } from './grid.ts';
import type { Rng } from './rng.ts';
import { blocksMove, isFlammable, makeCell, type Level } from './terrain.ts';

// ── gas kinds ────────────────────────────────────────────────────────────────
// The two Brogue starter gases. Caustic gas damages; confusion gas scrambles
// movement. Each kind diffuses in its own scalar field, so where two clouds
// overlap both concentrations are tracked and the denser one is what an actor
// "stands in" (gasAt reports the dominant kind).

export type GasKind = 'caustic' | 'confusion';
export const GAS_KINDS: readonly GasKind[] = ['caustic', 'confusion'];

// ── tuning constants (named, not magic; Brogue-inspired, not Brogue-exact) ────

/** Intensity a freshly-lit cell starts at. Fire intensity lives in (0, FIRE_START]. */
export const FIRE_START = 1;
/** Base intensity lost per tick — fire self-extinguishes after a few turns. */
const FIRE_DECAY = 0.15;
/** Extra decay jitter (0..this) added per tick from the Rng, so burn-out timing
 *  varies organically instead of every fire lasting exactly the same. */
const FIRE_DECAY_JITTER = 0.1;
/** Below this, a fire is considered out (snapped to 0). */
const FIRE_MIN = 0.05;
/** Chance a burning cell spreads to a DIAGONAL flammable neighbour in a tick.
 *  Orthogonal spread is guaranteed; diagonals are gusty/random (needs the Rng). */
const FIRE_DIAGONAL_SPREAD_CHANCE = 0.5;

/** Fraction of the concentration gap exchanged with each open orthogonal
 *  neighbour per tick. Must be ≤ 1/4 so the update stays a convex blend (bounded,
 *  no overshoot) with up to four neighbours — a discrete diffusion / heat step. */
const GAS_DIFFUSE = 0.2;
/** Multiplicative concentration retained each tick — the cloud thins over time. */
const GAS_DECAY = 0.9;
/** Below this a cell's gas has effectively vanished (snapped to 0), giving the
 *  cloud a finite lifetime instead of an infinitely-thin asymptotic tail. */
const GAS_MIN = 0.02;

// ── the field ─────────────────────────────────────────────────────────────────

export interface HazardField {
  readonly cols: number;
  readonly rows: number;
  /** Fire intensity per cell, row-major. 0 = no fire; otherwise (0, FIRE_START]. */
  readonly fire: Float32Array;
  /** One concentration field per gas kind, row-major. 0 = none. */
  readonly gas: Record<GasKind, Float32Array>;
}

/** An empty hazard field sized to a level. */
export function makeHazardField(cols: number, rows: number): HazardField {
  const n = cols * rows;
  return {
    cols,
    rows,
    fire: new Float32Array(n),
    gas: { caustic: new Float32Array(n), confusion: new Float32Array(n) },
  };
}

/** Convenience: a field matching a level's dimensions. */
export function makeHazardFieldForLevel(level: Level): HazardField {
  return makeHazardField(level.cols, level.rows);
}

// ── seeding effects (called by lava, thrown potions, bolts…) ──────────────────

/** Start (or refuel) a fire at a cell. No-op out of bounds. Intensity is clamped
 *  into (0, FIRE_START]; a hotter source can't exceed the cap, and re-igniting an
 *  already-burning cell takes the max so a fresh source re-stokes it. */
export function ignite(field: HazardField, col: number, row: number, intensity = FIRE_START): void {
  if (!inBounds(col, row, field.cols, field.rows)) return;
  const i = cellIndex(col, row, field.cols);
  const lit = Math.min(FIRE_START, Math.max(0, intensity));
  if (lit > field.fire[i]) field.fire[i] = lit;
}

/** Add gas of a kind at a cell. `amount` is added to any existing concentration
 *  of that kind. No-op out of bounds or for non-positive amounts. */
export function emitGas(
  field: HazardField,
  col: number,
  row: number,
  kind: GasKind,
  amount: number,
): void {
  if (amount <= 0 || !inBounds(col, row, field.cols, field.rows)) return;
  const i = cellIndex(col, row, field.cols);
  field.gas[kind][i] += amount;
}

// ── queries (server: damage/afflict; renderer: draw) ──────────────────────────

/** Fire intensity at a cell, 0 if none / out of bounds. Positive → on fire. */
export function fireAt(field: HazardField, col: number, row: number): number {
  if (!inBounds(col, row, field.cols, field.rows)) return 0;
  return field.fire[cellIndex(col, row, field.cols)];
}

/** The dominant gas at a cell, or null if the cell holds no (significant) gas.
 *  When kinds overlap, the higher concentration wins. */
export function gasAt(
  field: HazardField,
  col: number,
  row: number,
): { kind: GasKind; concentration: number } | null {
  if (!inBounds(col, row, field.cols, field.rows)) return null;
  const i = cellIndex(col, row, field.cols);
  let best: GasKind | null = null;
  let bestConc = 0;
  for (const kind of GAS_KINDS) {
    const c = field.gas[kind][i];
    if (c > bestConc) {
      bestConc = c;
      best = kind;
    }
  }
  return best ? { kind: best, concentration: bestConc } : null;
}

/** Is anything still simulating (any fire or gas present)? Lets the server stop
 *  ticking a quiescent field. */
export function hazardActive(field: HazardField): boolean {
  for (let i = 0; i < field.fire.length; i++) if (field.fire[i] > 0) return true;
  for (const kind of GAS_KINDS) {
    const g = field.gas[kind];
    for (let i = 0; i < g.length; i++) if (g[i] > 0) return true;
  }
  return false;
}

// ── the tick ──────────────────────────────────────────────────────────────────

/** Advance the whole simulation one deterministic step, in place. Fire consumes
 *  its fuel, spreads to flammable neighbours, and decays; gas diffuses and
 *  dissipates. `level` supplies the terrain (which cells are flammable / open)
 *  and is mutated ONLY to turn burnt-away flammable cells into floor. */
export function stepHazards(field: HazardField, level: Level, rng: Rng): void {
  stepFire(field, level, rng);
  stepGas(field, level);
}

function stepFire(field: HazardField, level: Level, rng: Rng): void {
  const { cols, rows, fire } = field;

  // 1. Consume fuel: any flammable cell that is currently burning turns to ash
  //    (floor) NOW, so it can't be re-ignited by a neighbour next tick — this is
  //    what makes fire spread outward once instead of oscillating forever.
  for (let i = 0; i < fire.length; i++) {
    if (fire[i] <= 0) continue;
    const col = i % cols;
    const row = (i / cols) | 0;
    if (isFlammable(level, col, row)) level.cells[i] = makeCell('floor');
  }

  // 2. Spread: collect cells to ignite from the CURRENT burning set (so this
  //    tick's newly-lit cells don't chain further until next tick — bounded,
  //    order-independent growth). Orthogonal flammable neighbours always catch;
  //    diagonal ones catch on a random gust.
  const ignitions: number[] = [];
  for (let i = 0; i < fire.length; i++) {
    if (fire[i] <= 0) continue;
    const col = i % cols;
    const row = (i / cols) | 0;
    for (const d of DIRS4) {
      const nc = col + d.col;
      const nr = row + d.row;
      if (!inBounds(nc, nr, cols, rows)) continue;
      const ni = cellIndex(nc, nr, cols);
      if (fire[ni] <= 0 && isFlammable(level, nc, nr)) ignitions.push(ni);
    }
    for (const d of DIRS8) {
      if (d.col === 0 || d.row === 0) continue; // diagonals only
      const nc = col + d.col;
      const nr = row + d.row;
      if (!inBounds(nc, nr, cols, rows)) continue;
      const ni = cellIndex(nc, nr, cols);
      if (fire[ni] <= 0 && isFlammable(level, nc, nr) && rng.chance(FIRE_DIAGONAL_SPREAD_CHANCE)) {
        ignitions.push(ni);
      }
    }
  }

  // 3. Decay every currently-burning cell (with a random gust of extra burn-off).
  for (let i = 0; i < fire.length; i++) {
    if (fire[i] <= 0) continue;
    fire[i] -= FIRE_DECAY + rng.next() * FIRE_DECAY_JITTER;
    if (fire[i] < FIRE_MIN) fire[i] = 0;
  }

  // 4. Light the newly-ignited cells at full intensity (after decay, so they get
  //    their full lifetime starting this tick).
  for (const ni of ignitions) fire[ni] = FIRE_START;
}

function stepGas(field: HazardField, level: Level): void {
  const { cols, rows } = field;
  for (const kind of GAS_KINDS) {
    const g = field.gas[kind];
    const next = new Float32Array(g.length);

    // Diffuse: each open cell exchanges GAS_DIFFUSE of its gap with each open
    // orthogonal neighbour. Walls hold no gas and are skipped, so nothing leaks
    // into rock and total concentration is conserved across this step (before
    // dissipation). The update is a convex blend → values stay within [min,max].
    for (let i = 0; i < g.length; i++) {
      const col = i % cols;
      const row = (i / cols) | 0;
      if (blocksMove(level, col, row)) continue; // gas doesn't occupy walls
      let v = g[i];
      for (const d of DIRS4) {
        const nc = col + d.col;
        const nr = row + d.row;
        if (!inBounds(nc, nr, cols, rows) || blocksMove(level, nc, nr)) continue;
        v += GAS_DIFFUSE * (g[cellIndex(nc, nr, cols)] - g[i]);
      }
      // Dissipate: the cloud thins each tick, then vanishes below a floor.
      v *= GAS_DECAY;
      next[i] = v < GAS_MIN ? 0 : v;
    }

    field.gas[kind].set(next);
  }
}
