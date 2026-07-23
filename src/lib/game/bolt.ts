// Bolts — the flight of a magical projectile across the grid. Every staff, wand
// and monster spell in Brogue is a bolt: it leaves the caster, follows a line
// toward the target, and stops (or bounces, or bores) when it meets something.
//
// This module answers exactly one question: **which cells does the bolt occupy,
// who does it pass over, and how does it end?** It deliberately resolves NO
// effects — no damage, no burning, no teleporting, no terrain mutation. The
// caller (the server) reads the trace and decides what each touched cell and
// struck actor means. That split is what lets one line-tracer serve a firebolt,
// a lightning arc, a tunneling beam and a monster's spit alike.
//
// The line is the same Bresenham walk `los.ts` uses for sight, so a bolt flies
// down exactly the line you can see along — aim and effect never disagree.
// Reflection restarts that walk from the impact point with one axis mirrored,
// which is why the trace is a sequence of straight segments rather than one line.
//
// Determinism: the only random decision here is which way a bolt glances off an
// isolated diagonal corner, and it draws from the seeded `Rng` (rng.ts) passed
// in — never Math.random — so server and client replay identically.

import type { Cell } from './grid.ts';
import type { Rng } from './rng.ts';
import { blocksMove, cellAt, occluderHeight, type Level } from './terrain.ts';
import { VISION_RANGE_CELLS } from './vision.ts';

// ── tuning constants ─────────────────────────────────────────────────────────

/** Default flight distance in cells. Tied to sight range: you can shoot about
 *  as far as you can pick a target, so a bolt rarely dies in the dark. */
export const DEFAULT_BOLT_RANGE = VISION_RANGE_CELLS;

// Hard caps. Per-kind numbers below stay well under them; the caps exist so a
// caller-computed value (a staff's range scaled by enchant, say) can never make
// `traceBolt` run unbounded. Clamping here keeps the function total.
export const MAX_BOLT_RANGE = 40;
export const MAX_BOLT_BOUNCES = 8;
export const MAX_BOLT_TUNNEL_DEPTH = 20;

// ── bolt kinds ───────────────────────────────────────────────────────────────
// Declarative, in the spirit of terrain.ts's TERRAIN_PROPS and monsters.ts's
// ability flags: one row per kind, and this module is the only place the
// physics of a kind is written down. What a bolt *does* on arrival is the
// caller's table, not this one — kinds here differ only in how they FLY.

export type BoltKind =
  /** Single-target fire/force bolt: splashes on the first thing it meets. */
  | 'firebolt'
  /** Arc that skewers everything on the line and only stops at rock. */
  | 'lightning'
  /** Short, bouncy arcane spark — ricochets off walls a few times. */
  | 'spark'
  /** Boring beam: eats a limited depth of rock and ignores flesh. */
  | 'tunneling'
  /** Incorporeal bolt: slips through bars and over ledges, stopped only by rock. */
  | 'spectral';

export interface BoltProps {
  /** Total cells the bolt may travel, summed across every segment it bounces
   *  through. Clamped to MAX_BOLT_RANGE. */
  readonly range: number;
  /** Stop on the first actor struck. False ⇒ fly on, striking everything on the
   *  line (the caller still gets every actor in `hits`). */
  readonly stopsAtActor: boolean;
  /** How many times it may bounce off an obstruction instead of dying there.
   *  0 ⇒ the common case: the first wall ends it. Clamped to MAX_BOLT_BOUNCES. */
  readonly maxBounces: number;
  /** Cells of *rock* it can bore through before it is spent. 0 ⇒ walls stop it.
   *  Only solid rock is borable — a portcullis or a ledge is not. Clamped to
   *  MAX_BOLT_TUNNEL_DEPTH. */
  readonly tunnelDepth: number;
  /** Fly through non-rock obstructions (closed gates, raised ledges) instead of
   *  splashing against them. */
  readonly passesBlockingTerrain: boolean;
}

/** Physics per bolt kind. Numbers are hand-picked for feel, not ported. */
export const BOLT_PROPS: Readonly<Record<BoltKind, BoltProps>> = {
  firebolt: {
    range: DEFAULT_BOLT_RANGE,
    stopsAtActor: true,
    maxBounces: 0,
    tunnelDepth: 0,
    passesBlockingTerrain: false,
  },
  lightning: {
    range: DEFAULT_BOLT_RANGE,
    stopsAtActor: false,
    maxBounces: 0,
    tunnelDepth: 0,
    passesBlockingTerrain: false,
  },
  // Short-legged on purpose: the bouncing, not the reach, is what makes it
  // dangerous in a closed room — including to the caster.
  spark: {
    range: 8,
    stopsAtActor: true,
    maxBounces: 3,
    tunnelDepth: 0,
    passesBlockingTerrain: false,
  },
  // Passes actors because it is a mining tool, not a weapon; the depth it bores
  // is short enough that it opens a passage rather than gutting a whole level.
  tunneling: {
    range: 8,
    stopsAtActor: false,
    maxBounces: 0,
    tunnelDepth: 4,
    passesBlockingTerrain: false,
  },
  spectral: {
    range: DEFAULT_BOLT_RANGE,
    stopsAtActor: true,
    maxBounces: 0,
    tunnelDepth: 0,
    passesBlockingTerrain: true,
  },
};

// ── trace results ────────────────────────────────────────────────────────────

/** How a bolt's flight ended. */
export type BoltEnd =
  /** Flew its full range without meeting anything that stopped it. */
  | 'range'
  /** Ran into an obstruction it could not pass, bore or bounce off. */
  | 'wall'
  /** Struck an actor and stopped there (`stopsAtActor`). */
  | 'actor'
  /** Spent every bounce and then hit an obstruction. */
  | 'reflected-out'
  /** The target was the caster's own cell: no direction, so it never left. */
  | 'origin';

export interface BoltHit<A extends Cell> {
  readonly actor: A;
  /** Index into `path` of the cell where the bolt met this actor. */
  readonly step: number;
}

export interface BoltTrace<A extends Cell> {
  /** Every cell the bolt entered, in flight order. Excludes the caster's own
   *  cell (which it can still re-enter later, after a bounce). */
  readonly path: readonly Cell[];
  /** Actors the bolt passed over, in the order it reached them. */
  readonly hits: readonly BoltHit<A>[];
  /** Rock cells a tunneling bolt bored out, in order. These are part of `path`;
   *  the caller is what actually turns them to floor — this module is pure. */
  readonly tunneled: readonly Cell[];
  /** How many times the bolt bounced. */
  readonly bounces: number;
  /** The obstruction that ended the flight, if one did. Never part of `path`. */
  readonly blockedAt?: Cell;
  readonly end: BoltEnd;
}

export interface BoltTraceOptions<A extends Cell> {
  readonly level: Level;
  /** The caster's cell. */
  readonly from: Cell;
  /** The aimed-at cell. The bolt flies *through* it and on to its range — it is
   *  a direction, not a destination. May be out of bounds. */
  readonly toward: Cell;
  readonly bolt: BoltProps;
  /** Every actor the bolt can interact with. Friend/foe filtering is the
   *  caller's job; whoever is on the line ends up in `hits`. */
  readonly actors?: readonly A[];
  /** Seeded RNG, used only to break a tie when a bouncing bolt glances off an
   *  isolated corner. Omit it and that case retraces instead (see reflect). */
  readonly rng?: Rng;
}

// ── obstruction model (derived from terrain.ts — no terrain rules duplicated) ─

type Obstruction =
  /** Open sky as far as a bolt cares. */
  | 'clear'
  /** Stops a bolt but is not rock: a closed gate's bars, a raised ledge. */
  | 'blocking'
  /** Rock (or off-map), the only thing a tunneling bolt can bore. */
  | 'solid';

function obstructionAt(level: Level, col: number, row: number): Obstruction {
  const cell = cellAt(level, col, row);
  // Off-map reads as rock, the same convention terrain.ts uses for movement
  // (blocksMove) and sight (occluderHeight).
  if (!cell) return 'solid';
  if (cell.kind === 'wall') return 'solid';
  // Anything that stops a walker (a closed gate) or stands proud of the floor
  // (a ledge) is something a bolt splashes against — but it isn't rock, so a
  // tunneling bolt can't bore it away.
  if (blocksMove(level, col, row) || occluderHeight(level, col, row) > 0) return 'blocking';
  return 'clear';
}

/** Strictly inside the level's outermost ring. That ring is the shell that
 *  seals the level: boring through it would open the map to the void and let
 *  actors walk off the grid, so no bolt may tunnel there. */
function isInterior(level: Level, col: number, row: number): boolean {
  return col > 0 && row > 0 && col < level.cols - 1 && row < level.rows - 1;
}

// ── the line walk ────────────────────────────────────────────────────────────

/** A Bresenham ray: repeated `step()` walks cell by cell away from `start`
 *  along the integer direction (vCol, vRow), forever. Identical stepping to
 *  `hasLineOfSight` in los.ts, so bolts follow sightlines exactly. A segment is
 *  built fresh after every bounce, which is what mirrors the flight. */
function makeRay(start: Cell, vCol: number, vRow: number) {
  const dCol = Math.abs(vCol);
  const dRow = Math.abs(vRow);
  const sCol = vCol < 0 ? -1 : 1;
  const sRow = vRow < 0 ? -1 : 1;
  let err = dCol - dRow;
  let col = start.col;
  let row = start.row;
  return function step(): Cell {
    const e2 = 2 * err;
    if (e2 > -dRow) {
      err -= dRow;
      col += sCol;
    }
    if (e2 < dCol) {
      err += dCol;
      row += sRow;
    }
    return { col, row };
  };
}

interface Direction {
  vCol: number;
  vRow: number;
}

/**
 * The direction a bolt leaves an obstruction, given the cell it was last in
 * (`from`), the obstruction it ran into (`entered`) and its incoming direction.
 * Mirrors the axis whose face was struck; a corner reverses both, sending the
 * bolt back down its own path.
 */
function reflect(
  from: Cell,
  entered: Cell,
  dir: Direction,
  stopsAt: (col: number, row: number) => boolean,
  rng: Rng | undefined,
): Direction {
  const stepCol = entered.col - from.col;
  const stepRow = entered.row - from.row;
  if (stepRow === 0) return { vCol: -dir.vCol, vRow: dir.vRow }; // vertical face
  if (stepCol === 0) return { vCol: dir.vCol, vRow: -dir.vRow }; // horizontal face
  // Diagonal impact: the face actually struck is whichever orthogonal neighbour
  // is *also* an obstruction — that's the surface the bolt is sliding along.
  const sideBlocked = stopsAt(from.col + stepCol, from.row);
  const frontBlocked = stopsAt(from.col, from.row + stepRow);
  if (sideBlocked && frontBlocked) return { vCol: -dir.vCol, vRow: -dir.vRow }; // inside corner
  if (sideBlocked) return { vCol: -dir.vCol, vRow: dir.vRow };
  if (frontBlocked) return { vCol: dir.vCol, vRow: -dir.vRow };
  // An isolated pillar clipped corner-on: there is no face, so which way it
  // glances is genuinely arbitrary. Take it from the seeded Rng when we have
  // one; without an Rng, prefer the reproducible answer (straight back).
  if (!rng) return { vCol: -dir.vCol, vRow: -dir.vRow };
  return rng.chance(0.5)
    ? { vCol: -dir.vCol, vRow: dir.vRow }
    : { vCol: dir.vCol, vRow: -dir.vRow };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

// ── the tracer ───────────────────────────────────────────────────────────────

/**
 * Trace a bolt from `from` through `toward`, reporting the cells it occupies,
 * the actors it passes over and how it ended. Pure: nothing is mutated, least
 * of all the level — a tunneling bolt reports the rock it bored in `tunneled`
 * and leaves the digging to the caller.
 */
export function traceBolt<A extends Cell>(opts: BoltTraceOptions<A>): BoltTrace<A> {
  const { level, from, toward, bolt, actors = [], rng } = opts;
  const range = clamp(Math.floor(bolt.range), 0, MAX_BOLT_RANGE);
  let bouncesLeft = clamp(Math.floor(bolt.maxBounces), 0, MAX_BOLT_BOUNCES);
  let tunnelLeft = clamp(Math.floor(bolt.tunnelDepth), 0, MAX_BOLT_TUNNEL_DEPTH);

  const path: Cell[] = [];
  const hits: BoltHit<A>[] = [];
  const tunneled: Cell[] = [];
  let bounces = 0;

  // Aimed at yourself: no direction to fly in. Reported rather than thrown so
  // the server can refuse the cast (and refund the charge) as a domain outcome.
  if (from.col === toward.col && from.row === toward.row) {
    return { path, hits, tunneled, bounces, end: 'origin' };
  }

  const blocks = (o: Obstruction) =>
    o === 'solid' || (o === 'blocking' && !bolt.passesBlockingTerrain);
  const stopsAt = (col: number, row: number) => blocks(obstructionAt(level, col, row));

  let dir: Direction = { vCol: toward.col - from.col, vRow: toward.row - from.row };
  let step = makeRay(from, dir.vCol, dir.vRow);
  let last: Cell = { col: from.col, row: from.row };

  while (path.length < range) {
    const cell = step();
    const obstruction = obstructionAt(level, cell.col, cell.row);
    if (blocks(obstruction)) {
      const borable =
        obstruction === 'solid' &&
        tunnelLeft > 0 &&
        // Off-map isn't rock, it's the end of the world; the border ring is the
        // level's shell and stays sealed.
        isInterior(level, cell.col, cell.row);
      if (borable) {
        tunnelLeft--;
        tunneled.push(cell);
        // falls through and occupies the bored cell like any other
      } else if (bouncesLeft > 0) {
        bouncesLeft--;
        bounces++;
        dir = reflect(last, cell, dir, stopsAt, rng);
        step = makeRay(last, dir.vCol, dir.vRow);
        continue; // the obstruction is never entered, and costs no range
      } else {
        return {
          path,
          hits,
          tunneled,
          bounces,
          blockedAt: cell,
          // A bolt that could bounce and no longer can died differently from
          // one that never could: the caller may want to say so.
          end: bolt.maxBounces > 0 ? 'reflected-out' : 'wall',
        };
      }
    }

    path.push(cell);
    last = cell;

    let struck = false;
    for (const actor of actors) {
      if (actor.col !== cell.col || actor.row !== cell.row) continue;
      hits.push({ actor, step: path.length - 1 });
      struck = true;
    }
    if (struck && bolt.stopsAtActor) {
      return { path, hits, tunneled, bounces, end: 'actor' };
    }
  }

  return { path, hits, tunneled, bounces, end: 'range' };
}
