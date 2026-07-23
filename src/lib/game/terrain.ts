// Terrain model. Each cell has a kind, an elevation (height in cells; negative
// for depth), and derived flags for movement / sight / hazard. The elevation +
// occluder-height maps feed the ported line-of-sight math (los.ts) so terrain
// verticality actually changes what you can see — stand on a ledge to see over
// a low wall; a chasm is a hole you fall into.
//
// Inspired by RealmQuest's `effectiveBlocked` (scene.ts): a single derivation
// point turns terrain into the boolean maps that movement, LoS, and lighting
// all consume, so they can never drift.
//
// ── why one flat kind list, not Brogue's layer stack (gap G13) ───────────────
// Brogue stacks four layers per cell — dungeon, liquid, surface, gas — so a web
// can sit on grass and water can flow over a bridge. Delve keeps ONE kind per
// cell and names the combinations that actually matter as their own kinds: a
// `bridge` is the span, and burning it leaves the `pit` it crossed (`burnsInto`
// below). The gas layer already exists separately as the hazard FIELD in
// hazards.ts, which is the one layer whose values are continuous rather than
// categorical — so the layering that earns its keep is the layering we have.
//
// That is a deliberate trade. Every consumer reads `cell.kind` directly:
// voxelize.ts, los.ts, pathfind.ts, dungeon.ts/roomgen.ts, hazards.ts, the
// renderer's TERRAIN_LOOK, and the server's move handler. Layering means each
// of those composites N layers instead of reading one field, and TERRAIN_PROPS
// splits into per-layer tables plus a reducer folding them (which layer wins
// for blocksMove? for elevation? for flammable — the web, or the grass under
// it?). That reducer is where the complexity actually lives, and a half-built
// version of it leaves two sources of truth: the exact failure this registry
// exists to prevent. The flat list stays correct and costs one row per
// combination we ship.
//
// The cost of deferring: combinations grow multiplicatively, so if Delve ever
// wants webs-over-grass, oil-on-water and burning-items-on-any-floor at once,
// the row count stops being writable and the migration is worth paying for.
// That migration is mechanical rather than exploratory: keep this table as the
// per-layer property source, add `compositeProps(cell)` folding a cell's layers
// into one `TerrainProps`, and repoint the derivations below at it — the
// consumers listed above then change once, together, instead of drifting apart
// one feature at a time now.

import { cellIndex } from './grid.ts';
import { TICKS_PER_TURN } from './energy.ts';

export type TerrainKind =
  | 'floor'
  | 'wall'
  | 'pit' // an open chasm: stepping in is a deliberate fast descent (`descends`)
  | 'water' // SHALLOW water — you wade through it; wet and noisy, but harmless
  | 'deepWater' // you swim, and the current sweeps loose pack items away
  | 'lava' // molten rock: near-lethal contact damage, and it sets light to fuel
  | 'bog' // sucking mud: passable, but every step through it costs extra time
  | 'web' // spider silk: entangles whoever enters, and burns eagerly
  | 'lichen' // creeping lichen: poisons on contact, slowly colonises bare ground
  | 'bridge' // a plank span over a chasm — walkable, flammable, and it can fall
  | 'secretDoor' // indistinguishable from wall until searched out (G16)
  | 'ledge'
  | 'grass'
  | 'gate' // a vault portcullis: blocks movement (until a lever opens it), but
  // you can see through the bars to the reward behind
  | 'stairsDown'
  | 'stairsUp';

/** How tall a wall stands for sight purposes. A sightline must rise above this
 *  to clear a wall — ported concept from RealmQuest `WALL_HEIGHT_CELLS`, but
 *  walls here are deliberately tall so they always block ground-level sight and
 *  rise to meet the (uneven) cave roof. */
export const WALL_HEIGHT = 7.5;
/** Roof height range (world-Y) for the generated cave ceiling. Tall + varied
 *  so chambers feel cavernous; the roof still arches down to the walls. */
export const CEIL_MIN = 4.5;
export const CEIL_MAX = 11;
/** Default height a raised ledge/platform stands. */
export const LEDGE_HEIGHT = 1;
/** Depth of an open pit / chasm (negative elevation). */
export const PIT_DEPTH = -2;
/** Depth of a shallow water tile — ankle deep, you wade. */
export const WATER_DEPTH = -0.35;
/** Depth of deep water: well below wading height, so it reads as a swim. */
export const DEEP_WATER_DEPTH = -1.2;
/** Depth of a lava pool, and of sucking bog. Both are sinks, not swims. */
export const LAVA_DEPTH = -0.25;
export const BOG_DEPTH = -0.2;

// ── tuning constants (named, chosen for Delve; Brogue-inspired, not exact) ────

/** Damage taken on entering lava, and again for every turn spent in it.
 *  Deliberately near-lethal: lava is a wall you *can* walk into, not a route. */
export const LAVA_CONTACT_DAMAGE = 25;
/** Poison stacks taken from brushing against creeping lichen. */
export const LICHEN_CONTACT_POISON = 2;
/** Turns spent tearing free of a web before an actor can move again. */
export const WEB_ENTANGLE_TURNS = 2;
/** Bog doubles the time a step takes — the cost of cutting through instead of
 *  going around, and long enough for a pursuer to close the gap. */
export const BOG_MOVE_MUL = 2;
/** Swimming is slower than walking, but far cheaper than wading through bog. */
export const DEEP_WATER_MOVE_MUL = 1.5;
/** Per-turn chance one lichen cell colonises a neighbour (see creep.ts). Low on
 *  purpose: lichen is a slowly-worsening problem you can outpace, not a flood. */
export const LICHEN_SPREAD_CHANCE = 0.02;

// ── the terrain kind registry ────────────────────────────────────────────────
// ONE row per kind, and every derived question below (default elevation, does it
// block movement, does it occlude sight, is entering it an event, what does it
// cost, does it burn, what does it leave behind) is answered by reading this
// table. Previously each of those lived in its own per-kind `switch`/`Set`, so
// adding a terrain kind meant finding all of them and risking a silent default.
//
// Two type-level guarantees keep it honest:
//   * `Record<TerrainKind, TerrainProps>` — a KIND without a row won't compile;
//   * no field on `TerrainProps` is optional — a new PROPERTY forces every
//     existing kind to answer it, so a rule can never be silently skipped.
// Rows are written out in full for the same reason: a shared default object
// would let a newly-added property slip past a kind unnoticed.

/** How a kind blocks sight: `full` = wall-tall regardless of elevation,
 *  `height` = occludes up to its own (positive) elevation, `none` = never. */
export type OccluderMode = 'full' | 'height' | 'none';

/** How deep a cell's liquid is. `deep` means an actor swims: both hands are
 *  busy, so loose pack items are lost to the current. */
export type Submersion = 'none' | 'shallow' | 'deep';

/** A kind that hides itself. `presentsAs` is the kind it is indistinguishable
 *  from until found; `revealsTo` is what the cell becomes once it is. Both
 *  halves live in one field so a disguise cannot be half-specified. */
export interface Concealment {
  presentsAs: TerrainKind;
  revealsTo: TerrainKind;
}

export interface TerrainProps {
  /** Default elevation of a freshly-made cell of this kind. */
  elevation: number;
  /** Blocks a walker from entering (walls, closed gates, unfound secret doors). */
  blocksMove: boolean;
  /** How this kind occludes line of sight. */
  occluder: OccluderMode;
  /** Entering it is an event the move handler resolves rather than a block: a
   *  fall, a dunk, a burn, a poisoning, an entanglement. The value is the kind
   *  responsible, so callers can branch on it; the fields below say what it
   *  actually does. `null` when stepping here is uneventful. */
  entryHazard: TerrainKind | null;
  /** How deep the liquid is here (see `sweepsPack`). */
  submersion: Submersion;
  /** Multiplier on the tick cost of a step INTO this cell; 1 = a normal step.
   *  Scales the actor's own action duration from the energy scheduler
   *  (energy.ts) rather than replacing it — there is no second speed model. */
  moveCostMul: number;
  /** Damage dealt on entering, and again for each turn spent standing here. */
  contactDamage: number;
  /** Poison stacks inflicted on entering, and again per turn spent here. */
  contactPoison: number;
  /** Turns an actor must spend struggling free before it can move again. */
  entangleTurns: number;
  /** Entering drops the actor to the level below — the deliberate fast descent. */
  descends: boolean;
  /** Fire can ignite, spread through, and consume it (fuel for hazards.ts). */
  flammable: boolean;
  /** Permanently alight: lights flammable neighbours, is never consumed itself. */
  ignitionSource: boolean;
  /** What is left once fire has consumed this cell; `null` = fire changes
   *  nothing here. A burnt bridge must leave the chasm it spanned, not floor. */
  burnsInto: TerrainKind | null;
  /** What this kind masquerades as, and what finding it turns the cell into.
   *  `null` = there is nothing here to discover. */
  concealment: Concealment | null;
  /** Per-turn chance this terrain creeps into one adjacent cell (see creep.ts). */
  spreadChance: number;
}

export const TERRAIN_PROPS: Record<TerrainKind, TerrainProps> = {
  floor: {
    elevation: 0, blocksMove: false, occluder: 'height', entryHazard: null,
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  wall: {
    elevation: WALL_HEIGHT, blocksMove: true, occluder: 'full', entryHazard: null,
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  // The chasm. `pit` is Delve's ONE descending terrain: it already dropped you a
  // floor before this pass (the server's own message calls it a chasm), so a
  // separate `chasm` kind would be a second name for one rule — exactly the
  // duplication this registry exists to prevent. The rule is now named
  // (`descends`) instead of being implied by the kind, so anything else that
  // should drop you — a collapsed bridge — gets it by pointing at `pit`.
  pit: {
    elevation: PIT_DEPTH, blocksMove: false, occluder: 'height', entryHazard: 'pit',
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: true, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  // Shallow water: you wade. Kept under the name `water` because that is what
  // generation places and what aquatic monsters swim in today; depth is the new
  // axis, so `deepWater` is the addition rather than a rename of live behaviour.
  water: {
    elevation: WATER_DEPTH, blocksMove: false, occluder: 'height', entryHazard: 'water',
    submersion: 'shallow', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  deepWater: {
    elevation: DEEP_WATER_DEPTH, blocksMove: false, occluder: 'height', entryHazard: 'deepWater',
    submersion: 'deep', moveCostMul: DEEP_WATER_MOVE_MUL, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  lava: {
    elevation: LAVA_DEPTH, blocksMove: false, occluder: 'height', entryHazard: 'lava',
    submersion: 'none', moveCostMul: 1, contactDamage: LAVA_CONTACT_DAMAGE, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: true,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  bog: {
    elevation: BOG_DEPTH, blocksMove: false, occluder: 'height', entryHazard: 'bog',
    submersion: 'shallow', moveCostMul: BOG_MOVE_MUL, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  web: {
    elevation: 0, blocksMove: false, occluder: 'height', entryHazard: 'web',
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: WEB_ENTANGLE_TURNS, descends: false, flammable: true, ignitionSource: false,
    burnsInto: 'floor', concealment: null, spreadChance: 0,
  },
  lichen: {
    elevation: 0, blocksMove: false, occluder: 'height', entryHazard: 'lichen',
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: LICHEN_CONTACT_POISON,
    entangleTurns: 0, descends: false, flammable: true, ignitionSource: false,
    burnsInto: 'floor', concealment: null, spreadChance: LICHEN_SPREAD_CHANCE,
  },
  // A span, so it sits at walking height even over a chasm — and burning one
  // drops the span and leaves the hole, which is the reason `burnsInto` exists
  // rather than the fire sim assuming every fuel turns to floor.
  bridge: {
    elevation: 0, blocksMove: false, occluder: 'height', entryHazard: null,
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: true, ignitionSource: false,
    burnsInto: 'pit', concealment: null, spreadChance: 0,
  },
  // A secret door IS a wall in every rule below — same elevation, same block,
  // same full occlusion — until a search turns it into an open passage. Making
  // the disguise a matched copy of the `wall` row (rather than a separate
  // "is it revealed" flag threaded through every query) means no derivation,
  // and no renderer branch, can accidentally leak its presence. The search verb
  // that calls `revealCell` is gap G16; this module owns the state and the rule.
  secretDoor: {
    elevation: WALL_HEIGHT, blocksMove: true, occluder: 'full', entryHazard: null,
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: { presentsAs: 'wall', revealsTo: 'floor' }, spreadChance: 0,
  },
  ledge: {
    elevation: LEDGE_HEIGHT, blocksMove: false, occluder: 'height', entryHazard: null,
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  // Groundcover: walkable and sightless, but it BURNS — the fuel the fire
  // simulation (hazards.ts) spreads through.
  grass: {
    elevation: 0, blocksMove: false, occluder: 'height', entryHazard: null,
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: true, ignitionSource: false,
    burnsInto: 'floor', concealment: null, spreadChance: 0,
  },
  // A vault portcullis: blocks movement like a wall until its lever is pulled
  // (the server swaps it to floor), but sits at elevation 0 so you can see
  // through the bars to the reward behind.
  gate: {
    elevation: 0, blocksMove: true, occluder: 'height', entryHazard: null,
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  stairsDown: {
    elevation: 0, blocksMove: false, occluder: 'height', entryHazard: null,
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
  stairsUp: {
    elevation: 0, blocksMove: false, occluder: 'height', entryHazard: null,
    submersion: 'none', moveCostMul: 1, contactDamage: 0, contactPoison: 0,
    entangleTurns: 0, descends: false, flammable: false, ignitionSource: false,
    burnsInto: null, concealment: null, spreadChance: 0,
  },
};

/** Every terrain kind, derived from the registry so the two can never drift. */
export const TERRAIN_KINDS = Object.keys(TERRAIN_PROPS) as readonly TerrainKind[];

/** The rules for a kind. */
export function terrainProps(kind: TerrainKind): TerrainProps {
  return TERRAIN_PROPS[kind];
}

export interface TerrainCell {
  kind: TerrainKind;
  /** Height in cells. floor=0, ledge>0, wall=WALL_HEIGHT, pit/water<0. */
  elevation: number;
  /** World-Y of the cave ROOF underside above this cell, set during generation
   *  so the ceiling is uneven rock (arching down to the walls, bumpy in the
   *  open) rather than a flat slab. Undefined on cells that predate ceiling
   *  generation; the renderer falls back to a default. */
  ceiling?: number;
}

/** Canonical cell for a kind (its default elevation). */
export function makeCell(kind: TerrainKind): TerrainCell {
  return { kind, elevation: TERRAIN_PROPS[kind].elevation };
}

/** A single dungeon level: a cols×rows grid of terrain cells, row-major. */
export interface Level {
  cols: number;
  rows: number;
  cells: TerrainCell[];
  /** Where a player arriving via the stairs-up (or the run start) spawns. */
  entry: { col: number; row: number };
  /** stairsDown location on this level (undefined on the deepest level). */
  stairsDown?: { col: number; row: number };
  /** stairsUp location (undefined on the top level). */
  stairsUp?: { col: number; row: number };
}

export function cellAt(level: Level, col: number, row: number): TerrainCell | undefined {
  if (col < 0 || row < 0 || col >= level.cols || row >= level.rows) return undefined;
  return level.cells[cellIndex(col, row, level.cols)];
}

/** The rules in force at (col,row). Out-of-bounds reads as solid rock, so every
 *  caller gets the same "off-map is wall" answer without repeating the check. */
export function propsAt(level: Level, col: number, row: number): TerrainProps {
  const c = cellAt(level, col, row);
  return c ? TERRAIN_PROPS[c.kind] : TERRAIN_PROPS.wall;
}

/** Can a walker normally occupy this cell? Walls, closed gates and unfound
 *  secret doors block; everything else is enterable (pits/water/lava are
 *  enterable — entering them is an event resolved by the move handler, not a
 *  movement block). Out-of-bounds blocks. */
export function blocksMove(level: Level, col: number, row: number): boolean {
  const c = cellAt(level, col, row);
  if (!c) return true;
  return TERRAIN_PROPS[c.kind].blocksMove;
}

/** Occluder height at a cell for sight. 0 == not an occluder. Walls stand
 *  WALL_HEIGHT tall; raised ledges occlude up to their own elevation (so a
 *  higher viewer sees over them); floors/pits/water don't occlude. */
export function occluderHeight(level: Level, col: number, row: number): number {
  const c = cellAt(level, col, row);
  if (!c) return WALL_HEIGHT; // treat off-map as solid
  const mode = TERRAIN_PROPS[c.kind].occluder;
  if (mode === 'full') return WALL_HEIGHT;
  if (mode === 'none') return 0;
  // 'height': raised ledges/platforms occlude up to their own elevation, so a
  // higher viewer sees over them. Sunken cells (pits/water) never occlude.
  return c.elevation > 0 ? c.elevation : 0;
}

/** Does entering this cell trigger something the move handler must resolve —
 *  a fall, a dunk, a burn, a poisoning, an entanglement? Returns the kind
 *  responsible, or null. Read `propsAt` for what it actually does. */
export function hazardAt(level: Level, col: number, row: number): TerrainKind | null {
  const c = cellAt(level, col, row);
  return c ? TERRAIN_PROPS[c.kind].entryHazard : null;
}

/** Does a cell fill its whole column with solid rock (walls, and the secret
 *  doors that imitate them)? Distinguishes rock from a portcullis, which blocks
 *  bodies without being a solid mass. The renderer's TERRAIN_LOOK mirrors it. */
export function fillsColumn(kind: TerrainKind): boolean {
  const p = TERRAIN_PROPS[kind];
  return p.blocksMove && p.occluder === 'full';
}

// ── depth: shallow vs deep water ─────────────────────────────────────────────

/** Does entering this cell sweep an actor's pack away? True only for deep
 *  liquid: swimming takes both hands, so loose items are lost to the current.
 *  The server decides WHICH items go (equipped gear stays); this owns "when". */
export function sweepsPack(level: Level, col: number, row: number): boolean {
  return propsAt(level, col, row).submersion === 'deep';
}

// ── movement cost (feeds the energy scheduler, energy.ts) ────────────────────

/** Cost in ticks of a step INTO this cell. `baseTicks` is the actor's own action
 *  duration (energy.ts `speedTicks`), so terrain scales an actor's speed instead
 *  of replacing it — a hasted delver in bog is still faster than a normal one.
 *  Never below 1 tick, so no terrain can make a step free and stall the loop. */
export function moveCostTicks(
  level: Level,
  col: number,
  row: number,
  baseTicks: number = TICKS_PER_TURN,
): number {
  return Math.max(1, Math.round(baseTicks * propsAt(level, col, row).moveCostMul));
}

// ── concealment (secret doors; the search verb itself is G16) ────────────────

/** Does this kind hide itself until found? */
export function isConcealedKind(kind: TerrainKind): boolean {
  return TERRAIN_PROPS[kind].concealment !== null;
}

/**
 * Reveal a concealed cell — the state change a successful search produces.
 * Returns a NEW cell (immutable update: the server swaps it into the level),
 * preserving the cell's generated ceiling so the roof doesn't jump. Returns the
 * input unchanged when there is nothing to find, so a caller can search any
 * cell without first testing it.
 */
export function revealCell(cell: TerrainCell): TerrainCell {
  const concealment = TERRAIN_PROPS[cell.kind].concealment;
  if (!concealment) return cell;
  return { ...makeCell(concealment.revealsTo), ceiling: cell.ceiling };
}

// ── flammability (fuel + ignition sources for the fire simulation) ───────────

/** The `flammable` flag for a terrain kind — can fire catch here? */
export function isFlammableKind(kind: TerrainKind): boolean {
  return TERRAIN_PROPS[kind].flammable;
}

/** Is the cell at (col,row) flammable fuel? Out-of-bounds is not. */
export function isFlammable(level: Level, col: number, row: number): boolean {
  const c = cellAt(level, col, row);
  return c ? isFlammableKind(c.kind) : false;
}

/** Is this cell permanently alight (lava) — a source that lights its flammable
 *  neighbours every turn without ever being used up? Out-of-bounds is not. */
export function isIgnitionSource(level: Level, col: number, row: number): boolean {
  const c = cellAt(level, col, row);
  return c ? TERRAIN_PROPS[c.kind].ignitionSource : false;
}

/** What a kind leaves behind once fire has consumed it — floor for groundcover,
 *  but the open chasm for a burnt bridge. Unburnable kinds answer themselves, so
 *  the fire simulation never has to assume "ash is always floor". */
export function burntKind(kind: TerrainKind): TerrainKind {
  return TERRAIN_PROPS[kind].burnsInto ?? kind;
}
