// Monster brains. One pure function answers the only question the server asks
// each monster each turn: *what do you do now?* — bite, loose a shot, conjure,
// step to a cell, or hold. The server owns every consequence (damage rolls,
// occupancy bookkeeping, summon cooldowns); this module owns the decision.
//
// Why its own module rather than an extension of `monsters.ts`: that file is the
// catalog — data, spawn tables, and the awareness state machine. Deciding a move
// needs terrain, line of sight, pathfinding and the scent field; folding those
// imports into the catalog would tie the data layer to half the game engine for
// no gain. One module, one reason to change (monsters.ts changes when the
// bestiary changes; this changes when pursuit behaviour changes).
//
// The pursuit model, and the bug it replaces
// ------------------------------------------
// The previous AI stepped by `Math.sign` deltas with three fallback steps: it
// stuck on any concave wall (all three candidate steps blocked ⇒ frozen forever)
// and it always knew the delver's exact cell, so breaking line of sight achieved
// nothing. Now there are two distinct pursuit channels, which is how Brogue
// actually plays:
//
//   SIGHT  — a clear sightline within aggro range means the monster knows where
//            you are and routes to you properly (`pathfind.ts`), around chasms,
//            crowds and dead ends.
//   SCENT  — no sightline means it does NOT know where you are. It follows the
//            decaying trail you shed (`scent.ts`) up-gradient, which naturally
//            leads around corners the way you actually walked — and each turn it
//            may simply lose the track (TRAIL_LOSS_CHANCE), which is what makes
//            escape possible at all.
//
// Purity: no IO, no server imports, no mutation of its inputs — the returned
// action is the whole output. Every random choice draws from the seeded Rng.

import { chebyshev, cellIndex, DIRS8, type Cell } from './grid.ts';
import { hasLineOfSight } from './los.ts';
import { blocksMove, hazardAt, occluderHeight, type Level } from './terrain.ts';
import { findPath, type PathOptions } from './pathfind.ts';
import { strongestScentNeighbour, type ScentField } from './scent.ts';
import type { Monster, MonsterAbility } from './monsters.ts';
import type { Rng } from './rng.ts';

/** Per-turn chance that a monster tracking by scent alone loses the track and
 *  casts about instead of closing (Brogue's 3%/turn). Pursuit has to be fallible
 *  or there is no such thing as escaping. */
export const TRAIL_LOSS_CHANCE = 0.03;

// ── inputs ───────────────────────────────────────────────────────────────────

/** A delver as the AI sees it. `id` is opaque — the server maps it back to the
 *  Player it came from. */
export interface AiTarget {
  id: string;
  col: number;
  row: number;
  /** Height in cells, for the elevation-aware sightline (los.ts). */
  elevation?: number;
}

export interface MonsterContext {
  level: Level;
  monster: Monster;
  /** Living delvers on this floor. Empty ⇒ nothing to hunt. */
  targets: readonly AiTarget[];
  /** Cell indices held by OTHER monsters. Delver cells are derived from
   *  `targets`, so the caller can't forget them. */
  occupied: ReadonlySet<number>;
  /** This floor's scent field, or null while nothing has been emitted yet. */
  scent: ScentField | null;
  /** Chebyshev radius at which a monster notices and pursues (server's AGGRO). */
  aggro: number;
  /** True when this summoner's cooldown has elapsed — the server owns the timer. */
  canSummon?: boolean;
  /** Seeded RNG; the only source of randomness in a decision. */
  rng: Rng;
}

// ── output ───────────────────────────────────────────────────────────────────

/** What the monster does this turn. The server resolves it — an `attack` still
 *  goes through the normal accuracy/damage rolls, a `move` still updates
 *  occupancy, a `summon` still spends the cooldown. */
export type MonsterAction =
  | { kind: 'attack'; targetId: string; ranged: boolean }
  | { kind: 'summon' }
  | { kind: 'move'; col: number; row: number }
  | { kind: 'wait' };

const WAIT: MonsterAction = { kind: 'wait' };

// ── movement medium ──────────────────────────────────────────────────────────

/** The terrain a particular monster can occupy, derived from its ability flags.
 *  `aquatic` is a confinement (water only), `flies` is a licence (ground hazards
 *  don't apply) — everything else walks. */
interface Mobility {
  flies: boolean;
  aquatic: boolean;
}

function has(m: Monster, ability: MonsterAbility): boolean {
  return m.abilities.includes(ability);
}

function mobilityOf(m: Monster): Mobility {
  return { flies: has(m, 'flies'), aquatic: has(m, 'aquatic') };
}

/** Terrain test only: could this monster stand on (col,row) if it were empty?
 *  Asks terrain.ts for the derived entry-hazard rather than testing kinds, so
 *  new liquids/chasms answer correctly the day they're added. */
function canStand(level: Level, mob: Mobility, col: number, row: number): boolean {
  const hazard = hazardAt(level, col, row);
  if (mob.aquatic) return hazard === 'water'; // eels never leave the water
  if (blocksMove(level, col, row)) return false; // walls, closed vault gates, off-map
  // Walkers won't step into a chasm; fliers cross it (that is what `flies` means).
  if (!mob.flies && hazard === 'pit') return false;
  return true;
}

/** Full test: standable terrain AND nobody already there. */
function canEnter(ctx: MonsterContext, mob: Mobility, col: number, row: number): boolean {
  if (!canStand(ctx.level, mob, col, row)) return false;
  if (ctx.occupied.has(cellIndex(col, row, ctx.level.cols))) return false;
  return ctx.targets.every((t) => t.col !== col || t.row !== row);
}

/** Route constraints for `findPath`, expressed in the mobility. Walkers steer
 *  around pits; fliers don't; an aquatic monster is fenced into the water by
 *  blocking every dry cell (an O(cells) build, but it only ever runs for a
 *  swimming monster that has actually lost its greedy step). Actors are blocked
 *  so a route never plans through the body of another monster or a delver. */
function pathOptions(ctx: MonsterContext, mob: Mobility): PathOptions {
  const blocked = new Set<number>(ctx.occupied);
  for (const t of ctx.targets) blocked.add(cellIndex(t.col, t.row, ctx.level.cols));
  if (mob.aquatic) {
    const { cols, cells } = ctx.level;
    for (let i = 0; i < cells.length; i++) {
      if (hazardAt(ctx.level, i % cols, (i / cols) | 0) !== 'water') blocked.add(i);
    }
  }
  return { blocked, avoidHazards: !mob.flies && !mob.aquatic };
}

// ── the decision ─────────────────────────────────────────────────────────────

/**
 * Choose this monster's action for the turn. Pure: nothing here mutates the
 * monster, the level, or the fields — the caller applies the result.
 *
 * The monster's awareness (`monster.state`) is an INPUT: the server advances it
 * with `nextAwareness` (monsters.ts) before asking. A sleeper simply passes.
 */
export function decideMonsterAction(ctx: MonsterContext): MonsterAction {
  const { monster: m, level, aggro } = ctx;
  if (m.hp <= 0) return WAIT;

  const target = nearestTarget(m, ctx.targets);
  if (!target) return WAIT;
  if (m.state === 'sleeping') return WAIT; // dozing: pass the turn

  const dist = chebyshev(m, target);
  // Beyond aggro range nothing consults the sightline, so don't trace one.
  const los =
    dist <= aggro &&
    hasLineOfSight(m, target, (c, r) => occluderHeight(level, c, r), 0, target.elevation ?? 0);
  const mob = mobilityOf(m);
  const immobile = has(m, 'immobile');
  const strike = (ranged: boolean): MonsterAction => ({ kind: 'attack', targetId: target.id, ranged });

  // Cowards break off rather than engage — but a cornered animal fights.
  if (has(m, 'flees') && !immobile) {
    const away = retreatStep(ctx, mob, target);
    if (away) return { kind: 'move', col: away.col, row: away.row };
    if (dist <= 1) return strike(false);
    if (has(m, 'ranged') && los && dist <= aggro) return strike(true);
    return WAIT;
  }

  if (dist <= 1) return strike(false); // adjacent: bite
  if (has(m, 'ranged') && los && dist <= aggro) return strike(true);
  // Summoners conjure thralls instead of closing the distance.
  if (has(m, 'summons') && ctx.canSummon && dist <= aggro) return { kind: 'summon' };
  // Turrets never move; they only ever act at range (above).
  if (immobile) return WAIT;

  // SIGHT: a clear line within aggro range means it knows exactly where you are.
  if (los && dist <= aggro) {
    const step = stepTowards(ctx, mob, target);
    if (step) return { kind: 'move', col: step.col, row: step.row };
  }
  // SCENT: otherwise (or when no route exists) it can only follow the trail.
  return followScent(ctx, mob);
}

/** Nearest living delver by Chebyshev distance; ties go to the earlier entry so
 *  the choice is deterministic. */
function nearestTarget(m: Monster, targets: readonly AiTarget[]): AiTarget | null {
  let best: AiTarget | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = chebyshev(m, t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

/**
 * One step of an actual route to the delver.
 *
 * Fast path: with a clear sightline the straight step is already a shortest
 * step whenever it is legal, so the common open-floor chase costs O(1) and no
 * search at all. Only when that step is blocked — a chasm, a wall corner, a
 * jostling horde — do we plot a real path, which is precisely the case the old
 * sign-stepping AI got permanently stuck on.
 */
function stepTowards(ctx: MonsterContext, mob: Mobility, target: AiTarget): Cell | null {
  const m = ctx.monster;
  const greedy = {
    col: m.col + Math.sign(target.col - m.col),
    row: m.row + Math.sign(target.row - m.row),
  };
  if (canEnter(ctx, mob, greedy.col, greedy.row)) return greedy;

  // The delver's own cell is occupied (and may be terrain this monster can't
  // enter at all), so aim for the cell beside them that this monster could
  // actually stand on and is nearest to it.
  const goal = approachCell(ctx, mob, target);
  if (!goal) return null;
  const path = findPath(ctx.level, { col: m.col, row: m.row }, goal, pathOptions(ctx, mob));
  return path && path.length > 0 ? path[0] : null;
}

/** The cell adjacent to `target` that this monster could occupy and that is
 *  closest to it — its attack position. Null when the delver is unapproachable
 *  (fully surrounded, or standing in a medium this monster can't share). */
function approachCell(ctx: MonsterContext, mob: Mobility, target: AiTarget): Cell | null {
  const m = ctx.monster;
  let best: Cell | null = null;
  let bestDist = Infinity;
  for (const d of DIRS8) {
    const col = target.col + d.col;
    const row = target.row + d.row;
    if (!canEnter(ctx, mob, col, row)) continue;
    const dist = chebyshev(m, { col, row });
    if (dist < bestDist) {
      bestDist = dist;
      best = { col, row };
    }
  }
  return best;
}

/** Back away: the reachable neighbour that puts the most ground between the
 *  monster and the delver. Null when nothing strictly increases the distance —
 *  i.e. it is cornered, and the caller lets it fight. */
function retreatStep(ctx: MonsterContext, mob: Mobility, target: AiTarget): Cell | null {
  const m = ctx.monster;
  let best: Cell | null = null;
  let bestDist = chebyshev(m, target);
  for (const d of DIRS8) {
    const col = m.col + d.col;
    const row = m.row + d.row;
    const dist = chebyshev({ col, row }, target);
    if (dist <= bestDist) continue;
    if (!canEnter(ctx, mob, col, row)) continue;
    best = { col, row };
    bestDist = dist;
  }
  return best;
}

/** Track by nose alone: climb the scent gradient, unless the track goes cold
 *  this turn. Holding still on a lost track (rather than guessing) is what gives
 *  a fleeing delver the turns they need to get away. */
function followScent(ctx: MonsterContext, mob: Mobility): MonsterAction {
  const field = ctx.scent;
  if (!field) return WAIT;
  const step = strongestScentNeighbour(field, ctx.monster, (col, row) => canEnter(ctx, mob, col, row));
  if (!step) return WAIT; // nothing nearby smells of delver
  if (ctx.rng.chance(TRAIL_LOSS_CHANCE)) return WAIT; // lost the scent
  return { kind: 'move', col: step.col, row: step.row };
}
