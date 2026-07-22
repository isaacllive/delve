// Monsters. Kinds scale with the biome tier (every 20 floors). The server
// spawns them per floor (deterministic count/positions from the seed) and runs
// their AI; combat is bump-to-attack. The bottom-floor boss is a monster too —
// killing it opens the exit.
//
// This module is PURE DATA + spawn logic: the catalog, per-kind speed
// (`actionTicks`), ability FLAGS (declarative — the server resolves what each
// does), horde tables, out-of-depth danger spikes, and depth-gated mutations.
// It never touches the DOM/IO and is deterministic from the run seed. All
// randomness runs through the seeded `rng.ts`.

import { cellIndex } from './grid.ts';
import { makeRng, type Rng } from './rng.ts';
import type { DungeonLevel } from './dungeon.ts';
import { FLOORS_PER_BIOME } from './biomes.ts';
import { TICKS_PER_TURN, HASTE_TICKS, SLOW_TICKS } from './energy.ts';

// ── Speed (action-cost) constants ────────────────────────────────────────────
// Ticks per action, sourced from the turn/energy scheduler (energy.ts): a normal
// turn is NORMAL_TICKS, a fast actor acts twice as often (FAST_TICKS), a
// slow/heavy one half as often (SLOW_TICKS, imported directly).
const NORMAL_TICKS = TICKS_PER_TURN;
const FAST_TICKS = HASTE_TICKS;

/** A monster's awareness of the delvers (Brogue-style stealth states):
 *  `sleeping`/`wandering` are unaware (sneak-attackable), `hunting` is alert.
 *  The wire contract owns this type — re-exported here for the catalog + AI. */
export type { MonsterAwareness } from './protocol.ts';
import type { MonsterAwareness } from './protocol.ts';

// ── Ability flags ────────────────────────────────────────────────────────────
// DECLARATIVE ONLY. This module never resolves these — it tags kinds/monsters so
// the server (`actMonster`/combat in gameServer.ts) and the client (tint) can.
// Each flag documents EXACTLY what the server is expected to do when set:
//
//  splitsOnHit     On surviving non-lethal melee damage, spawn a copy adjacent
//                  and split the remaining HP between the two (Brogue pink
//                  jelly). Server: after combat, if hp>1 and a free adjacent
//                  cell exists, halve hp and clone.
//  ranged          May attack a delver from a distance along a clear line of
//                  sight (up to its aggro range) instead of only when adjacent.
//                  Server: in actMonster, if LOS + in range, do a ranged strike
//                  and skip the step-toward move.
//  immobile        Never moves (turret). Server: skip the movement branch; only
//                  act when a target is attackable (pairs with `ranged`).
//  stealsAndFlees  On a successful hit, steal one item from the victim's
//                  inventory and switch to fleeing. Server: transfer an item,
//                  then behave as `flees` until it escapes/off-floor (Brogue
//                  monkey).
//  corrodesWeapon  On a successful hit (or when hit in melee), degrade the
//                  attacker's weapon (−1 enchant / durability). Server: apply to
//                  the delver's equipped weapon (Brogue acid mound).
//  aquatic         Confined to water cells; ambushes from deep water and is
//                  hidden until adjacent. Server: restrict movement to water,
//                  keep unrevealed until it strikes (Brogue eel).
//  summons         While hunting, periodically conjures subordinate monsters
//                  nearby (on a cooldown). Server: spawn its summon kind in free
//                  adjacent/near cells (Brogue conjurer/lich).
//  flees           Low-morale: moves AWAY from the nearest delver rather than
//                  engaging. Server: invert the step-toward direction.
//  flies           Ignores ground hazards (pits/water/lava) for movement and
//                  pathing. Server: treat hazard cells as passable when moving.
//  explodesOnDeath (mutation) On death, deal an area burst to everything in the
//                  adjacent cells. Server: on kill, resolve an AoE hit.
//  poisons         A successful melee hit applies a poison damage-over-time
//                  status to the victim. Server: add poison stacks on hit.
export type MonsterAbility =
  | 'splitsOnHit'
  | 'ranged'
  | 'immobile'
  | 'stealsAndFlees'
  | 'corrodesWeapon'
  | 'aquatic'
  | 'summons'
  | 'flees'
  | 'flies'
  | 'explodesOnDeath'
  | 'poisons';

/** A leader's companion entry: `count ∈ [min,max]` of `kindId` spawned nearby. */
export interface HordeMember {
  kindId: string;
  min: number;
  max: number;
}

export interface MonsterKind {
  id: string;
  name: string;
  hp: number;
  /** Upper bound of the monster's bite damage (rolled as a range in combat). */
  damage: number;
  /** Attack accuracy (Brogue units): hit chance = accuracy × 0.987^(target defense). */
  accuracy: number;
  /** Internal defense (displayed armor × 10) reducing an attacker's hit chance. */
  defense: number;
  color: number;
  /** Action cost in ticks (speed). 100 = normal; 50 = fast (jackal/bat); 200 =
   *  slow/heavy (ogre/golem). The server's scheduler reads this per monster. */
  actionTicks: number;
  /** Declarative behaviour flags (see MonsterAbility). Absent ⇒ plain melee. */
  abilities?: readonly MonsterAbility[];
  /** Companion groups spawned around this kind when it leads a horde. */
  horde?: readonly HordeMember[];
  boss?: boolean;
}

// ── Catalog ──────────────────────────────────────────────────────────────────
// Five biome tiers (index = biome band, every FLOORS_PER_BIOME floors). Stats
// are hand-set but Brogue-plausible (adapted from GlobalsBrogue.c relative
// strengths, not copied). Accuracy/defense ramp with depth so unarmored delvers
// hit reliably early and must earn armor/enchant to keep landing (and avoiding)
// blows deeper down. Speeds and abilities give each kind its tactical shape. The
// original ten ids (rat/goblin/…/fiend) are preserved so the server never breaks.
const TIERS: MonsterKind[][] = [
  // Tier 0 — Caves (depth 0–19)
  [
    { id: 'rat', name: 'Cave Rat', hp: 6, damage: 2, accuracy: 50, defense: 0, color: 0x9a8a70, actionTicks: NORMAL_TICKS, horde: [{ kindId: 'rat', min: 1, max: 2 }] },
    { id: 'kobold', name: 'Kobold', hp: 7, damage: 3, accuracy: 60, defense: 0, color: 0x8a7a5a, actionTicks: NORMAL_TICKS, horde: [{ kindId: 'kobold', min: 1, max: 2 }] },
    { id: 'jackal', name: 'Jackal', hp: 8, damage: 3, accuracy: 70, defense: 10, color: 0xb08040, actionTicks: FAST_TICKS, horde: [{ kindId: 'jackal', min: 1, max: 3 }] },
    { id: 'monkey', name: 'Monkey', hp: 12, damage: 2, accuracy: 70, defense: 20, color: 0xc0a060, actionTicks: 60, abilities: ['stealsAndFlees'] },
    { id: 'goblin', name: 'Goblin', hp: 11, damage: 3, accuracy: 70, defense: 10, color: 0x7ba05a, actionTicks: NORMAL_TICKS, horde: [{ kindId: 'goblin', min: 1, max: 2 }, { kindId: 'kobold', min: 0, max: 1 }] },
    { id: 'pink-jelly', name: 'Pink Jelly', hp: 50, damage: 1, accuracy: 50, defense: 0, color: 0xff8ac0, actionTicks: NORMAL_TICKS, abilities: ['splitsOnHit'] },
  ],
  // Tier 1 — Ruins (depth 20–39)
  [
    { id: 'skeleton', name: 'Skeleton', hp: 15, damage: 4, accuracy: 80, defense: 20, color: 0xd8d2c0, actionTicks: NORMAL_TICKS, horde: [{ kindId: 'skeleton', min: 1, max: 2 }] },
    { id: 'ghoul', name: 'Ghoul', hp: 20, damage: 5, accuracy: 90, defense: 10, color: 0x8a9a6a, actionTicks: NORMAL_TICKS },
    { id: 'spider', name: 'Cave Spider', hp: 16, damage: 4, accuracy: 90, defense: 10, color: 0x40406a, actionTicks: NORMAL_TICKS, abilities: ['ranged', 'poisons'] },
    { id: 'acid-mound', name: 'Acid Mound', hp: 15, damage: 3, accuracy: 80, defense: 10, color: 0x9acf3a, actionTicks: 130, abilities: ['corrodesWeapon'] },
    { id: 'vampire-bat', name: 'Vampire Bat', hp: 12, damage: 4, accuracy: 90, defense: 30, color: 0x6a3a6a, actionTicks: FAST_TICKS, abilities: ['flies'] },
    { id: 'conjurer', name: 'Goblin Conjurer', hp: 18, damage: 3, accuracy: 90, defense: 10, color: 0x5aa07a, actionTicks: NORMAL_TICKS, abilities: ['summons'] },
    { id: 'ogre', name: 'Ogre', hp: 55, damage: 12, accuracy: 100, defense: 20, color: 0x9a7a5a, actionTicks: SLOW_TICKS },
  ],
  // Tier 2 — Lava Zone (depth 40–59)
  [
    { id: 'imp', name: 'Cinder Imp', hp: 17, damage: 6, accuracy: 90, defense: 20, color: 0xff7a3a, actionTicks: NORMAL_TICKS },
    { id: 'hound', name: 'Magma Hound', hp: 24, damage: 7, accuracy: 100, defense: 20, color: 0xd0431a, actionTicks: NORMAL_TICKS, horde: [{ kindId: 'hound', min: 1, max: 3 }] },
    { id: 'will-o-wisp', name: 'Will-o-the-Wisp', hp: 14, damage: 8, accuracy: 120, defense: 20, color: 0xffe27a, actionTicks: NORMAL_TICKS, abilities: ['ranged', 'flies'] },
    { id: 'salamander', name: 'Salamander', hp: 40, damage: 13, accuracy: 110, defense: 20, color: 0xe0521a, actionTicks: NORMAL_TICKS, abilities: ['poisons'] },
  ],
  // Tier 3 — Ancient City (depth 60–79)
  [
    { id: 'sentinel', name: 'Sentinel', hp: 28, damage: 7, accuracy: 100, defense: 40, color: 0xffd070, actionTicks: NORMAL_TICKS, abilities: ['ranged', 'immobile'] },
    { id: 'wraith', name: 'Wraith', hp: 22, damage: 9, accuracy: 110, defense: 20, color: 0x9a7fff, actionTicks: FAST_TICKS },
    { id: 'golem', name: 'Stone Golem', hp: 70, damage: 14, accuracy: 110, defense: 50, color: 0xa8a090, actionTicks: SLOW_TICKS },
    { id: 'dar-blademaster', name: 'Dar Blademaster', hp: 32, damage: 10, accuracy: 130, defense: 40, color: 0xd070a0, actionTicks: 70, horde: [{ kindId: 'dar-blademaster', min: 0, max: 1 }] },
  ],
  // Tier 4 — Corrupted Halls (depth 80–99)
  [
    { id: 'horror', name: 'Horror', hp: 32, damage: 9, accuracy: 120, defense: 40, color: 0x7a5cff, actionTicks: NORMAL_TICKS },
    { id: 'fiend', name: 'Void Fiend', hp: 38, damage: 11, accuracy: 130, defense: 50, color: 0x66ff8a, actionTicks: NORMAL_TICKS },
    { id: 'lich', name: 'Lich', hp: 45, damage: 10, accuracy: 130, defense: 40, color: 0x8affe0, actionTicks: NORMAL_TICKS, abilities: ['ranged', 'summons'] },
    { id: 'revenant', name: 'Revenant', hp: 50, damage: 14, accuracy: 140, defense: 50, color: 0xc0c0d0, actionTicks: NORMAL_TICKS },
  ],
];

const BOSS: MonsterKind = {
  id: 'warden-of-the-deep',
  name: 'Warden of the Deep',
  hp: 220,
  damage: 16,
  accuracy: 140,
  defense: 40,
  color: 0xff2020,
  actionTicks: NORMAL_TICKS,
  abilities: ['summons'],
  boss: true,
};

/** Every kind by id (all tiers + boss) — the source of truth for horde/summon
 *  companion lookups. */
const KIND_BY_ID: ReadonlyMap<string, MonsterKind> = new Map(
  [...TIERS.flat(), BOSS].map((k) => [k.id, k]),
);

/** Look up a kind by id (companion tables reference kinds by id). */
export function kindById(id: string): MonsterKind | undefined {
  return KIND_BY_ID.get(id);
}

export interface Monster {
  id: string;
  kindId: string;
  name: string;
  color: number;
  col: number;
  row: number;
  hp: number;
  hpMax: number;
  damage: number;
  accuracy: number;
  defense: number;
  /** Action cost in ticks (speed) — the server sets this as the monster's next
   *  `ticksUntilTurn` after it acts. Copied from the kind, adjusted by mutation. */
  actionTicks: number;
  /** Behaviour flags the server resolves (see MonsterAbility). Copied from the
   *  kind into an OWN array so mutations/summons extend it without touching the
   *  shared catalog. */
  abilities: MonsterAbility[];
  /** Mutation id, if this monster rolled one (client tint/label; server hooks
   *  key off the added abilities/stats). Absent for un-mutated monsters. */
  mutation?: string;
  boss: boolean;
  /** Awareness of the delvers — drives movement + the sneak-attack bonus. */
  state: MonsterAwareness;
  /** Energy countdown for the turn scheduler: ticks until this monster may act
   *  next (0 = ready). Advanced by the server as the player spends turns. */
  ticksUntilTurn: number;
}

// ── Awareness (stealth) state machine ────────────────────────────────────────
// Monsters begin asleep and cycle sleeping → wandering → hunting off proximity
// and line-of-sight to the nearest delver (driven by the turn engine). Attacks
// against an *unaware* monster (sleeping or wandering) land a sneak bonus — the
// multiplier itself lives in combat.ts (Brogue ×3, dagger ×5).

/** How close (Chebyshev cells) a delver must be, with a clear sightline, to
 *  wake a sleeping monster straight into the hunt. */
export const WAKE_RANGE = 5;

/** A monster is unaware (and thus sneak-attackable) unless it's hunting. */
export function isUnaware(state: MonsterAwareness): boolean {
  return state !== 'hunting';
}

/** Pure awareness transition: given a monster's current state and the nearest
 *  delver's distance / sightline (plus the aggro radius), return the next
 *  state. Deterministic and side-effect-free so it can be unit-tested and reused
 *  by the server tick.
 *  - Adjacent (dist ≤ 1) always snaps to hunting — you're right on top of it.
 *  - sleeping → hunting only when a delver is within WAKE_RANGE *and* visible.
 *  - wandering → hunting once a delver is within aggro *and* visible.
 *  - hunting → wandering when the nearest delver slips beyond aggro (lost). */
export function nextAwareness(
  current: MonsterAwareness,
  opts: { dist: number; los: boolean; aggro: number },
): MonsterAwareness {
  const { dist, los, aggro } = opts;
  if (dist <= 1) return 'hunting';
  switch (current) {
    case 'sleeping':
      return dist <= WAKE_RANGE && los ? 'hunting' : 'sleeping';
    case 'wandering':
      return dist <= aggro && los ? 'hunting' : 'wandering';
    case 'hunting':
      return dist > aggro ? 'wandering' : 'hunting';
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────
// Brogue rolls monster mutations from depth 11 (of 26). Delve is 100 floors, so
// we scale that threshold: MUTATION_MIN_DEPTH ≈ 11/26 of the descent, rounded to
// a biome boundary (the start of the Lava Zone). Past it, each spawned non-boss
// monster has MUTATION_CHANCE to gain a mutation modifier. Mutations mutate the
// monster in place after `makeMonster` and document the runtime hook they need.

/** First depth at which mutations can appear (Brogue depth 11 of 26). */
export const MUTATION_MIN_DEPTH = 11;
/** Per-monster chance of a mutation once past the threshold. */
export const MUTATION_CHANCE = 0.12;

interface Mutation {
  id: string;
  /** Capitalised adjective prefixed to the monster's name. */
  label: string;
  /** Mutate the monster in place. Documented server hook in each comment. */
  apply: (m: Monster) => void;
}

const MUTATIONS: readonly Mutation[] = [
  {
    // Server hook: on death, resolve an AoE burst to adjacent actors.
    id: 'explosive',
    label: 'Explosive',
    apply: (m) => addAbility(m, 'explodesOnDeath'),
  },
  {
    // Faster + harder to hit. Server: already reads actionTicks; no new hook.
    id: 'agile',
    label: 'Agile',
    apply: (m) => {
      m.actionTicks = Math.max(FAST_TICKS, Math.round(m.actionTicks / 2));
      m.defense += 15;
    },
  },
  {
    // Tankier but slower + hits harder. Server: reads actionTicks; no new hook.
    id: 'juggernaut',
    label: 'Juggernaut',
    apply: (m) => {
      m.hpMax = Math.round(m.hpMax * 1.6);
      m.hp = m.hpMax;
      m.actionTicks = Math.round(m.actionTicks * 1.5);
      m.damage = Math.round(m.damage * 1.3);
    },
  },
  {
    // Server hook: melee hits apply poison stacks (see `poisons`).
    id: 'toxic',
    label: 'Toxic',
    apply: (m) => addAbility(m, 'poisons'),
  },
];

function addAbility(m: Monster, ability: MonsterAbility): void {
  if (!m.abilities.includes(ability)) m.abilities.push(ability);
}

/** Roll a depth-gated mutation onto a monster (in place). No-op before the
 *  threshold, for bosses, or when the seeded roll misses. */
function maybeMutate(rng: Rng, m: Monster, depth: number): void {
  if (m.boss || depth < MUTATION_MIN_DEPTH) return;
  if (!rng.chance(MUTATION_CHANCE)) return;
  const mutation = rng.pick(MUTATIONS);
  mutation.apply(m);
  m.mutation = mutation.id;
  m.name = `${mutation.label} ${m.name}`;
}

// ── Out-of-depth ─────────────────────────────────────────────────────────────
/** Per-leader chance a floor draws a leader from a DEEPER tier — a rare danger
 *  spike ("no safe floor"). Brogue-style out-of-depth. */
export const OOD_CHANCE = 0.08;

function tierIndexFor(depth: number): number {
  return Math.min(TIERS.length - 1, Math.floor(depth / FLOORS_PER_BIOME));
}

/** The monster kinds native to a floor's own tier. */
export function tierFor(depth: number): readonly MonsterKind[] {
  return TIERS[tierIndexFor(depth)];
}

/** Pick a leader kind for this floor. With OOD_CHANCE, jump 1–2 tiers deeper
 *  (clamped) for a danger spike; otherwise pick from the floor's own tier. */
function pickLeaderKind(rng: Rng, depth: number): MonsterKind {
  let tier = tierIndexFor(depth);
  if (rng.chance(OOD_CHANCE)) {
    tier = Math.min(TIERS.length - 1, tier + rng.int(1, 2));
  }
  return rng.pick(TIERS[tier]);
}

// ── Spawning ─────────────────────────────────────────────────────────────────

/** Minimum Manhattan distance a monster must keep from the arrival point, so
 *  delvers aren't dropped on top of a fight. */
const MIN_ENTRY_DIST = 6;
/** Chebyshev radius around a leader within which its companions spawn. */
const HORDE_RADIUS = 3;

/** Deterministic monster population for a floor (empty in the base camp).
 *  Places LEADER + companion hordes (not flat singles), with a small
 *  out-of-depth chance and depth-gated mutations — all seeded. */
export function spawnMonsters(seed: string, level: DungeonLevel): Monster[] {
  if (level.depth < 0) return []; // camp is safe
  const rng = makeRng(`${seed}#mon#${level.depth}`);
  const out: Monster[] = [];

  // Open floor cells that aren't the entry / stairs / boss anchor.
  const reserved = new Set<number>();
  const mark = (p?: { col: number; row: number }) => {
    if (p) reserved.add(cellIndex(p.col, p.row, level.cols));
  };
  mark(level.entry);
  mark(level.stairsUp);
  mark(level.stairsDown);
  mark(level.boss);

  const open = new Set<number>();
  for (let i = 0; i < level.cells.length; i++) {
    if (level.cells[i].kind === 'floor' && !reserved.has(i)) open.add(i);
  }

  const used = new Set<number>();
  const nearEntry = (idx: number): boolean => {
    const col = idx % level.cols;
    const row = Math.floor(idx / level.cols);
    return Math.abs(col - level.entry.col) + Math.abs(row - level.entry.row) < MIN_ENTRY_DIST;
  };
  const placeable = (idx: number): boolean => open.has(idx) && !used.has(idx) && !nearEntry(idx);

  const place = (kind: MonsterKind, idx: number): void => {
    const col = idx % level.cols;
    const row = Math.floor(idx / level.cols);
    const m = makeMonster(kind, col, row, `${level.depth}-${out.length}`);
    maybeMutate(rng, m, level.depth);
    out.push(m);
    used.add(idx);
  };

  if (open.size > 0) {
    const openArr = [...open];
    // Same population budget as before (leader + companions all count toward it),
    // so floors stay comparably dense.
    const target = Math.min(24, 3 + Math.floor(level.depth / 6) + rng.int(0, 3));

    for (let tries = 0; used.size < target && tries < target * 30; tries++) {
      const spot = openArr[rng.int(0, openArr.length - 1)];
      if (!placeable(spot)) continue;

      const leaderKind = pickLeaderKind(rng, level.depth);
      place(leaderKind, spot);

      // Companions cluster around the leader.
      if (leaderKind.horde) {
        for (const member of leaderKind.horde) {
          const kind = kindById(member.kindId);
          if (!kind) continue;
          const wanted = rng.int(member.min, member.max);
          for (let c = 0; c < wanted; c++) {
            const cell = pickNear(rng, spot, level, placeable);
            if (cell < 0) break; // no room nearby — stop this group
            place(kind, cell);
          }
        }
      }
    }
  }

  // Boss stands guard on its floor (never mutated, always alert).
  if (level.boss) out.push(makeMonster(BOSS, level.boss.col, level.boss.row, `${level.depth}-boss`));
  return out;
}

/** Find a free cell within HORDE_RADIUS of `center` (Chebyshev). Scans the
 *  square deterministically and picks one of the candidates via `rng`. Returns
 *  -1 if none is placeable. */
function pickNear(
  rng: Rng,
  center: number,
  level: DungeonLevel,
  placeable: (idx: number) => boolean,
): number {
  const cx = center % level.cols;
  const cy = Math.floor(center / level.cols);
  const candidates: number[] = [];
  for (let dy = -HORDE_RADIUS; dy <= HORDE_RADIUS; dy++) {
    for (let dx = -HORDE_RADIUS; dx <= HORDE_RADIUS; dx++) {
      const nc = cx + dx;
      const nr = cy + dy;
      if (nc < 0 || nr < 0 || nc >= level.cols || nr >= level.rows) continue;
      const idx = nr * level.cols + nc;
      if (placeable(idx)) candidates.push(idx);
    }
  }
  if (candidates.length === 0) return -1;
  return candidates[rng.int(0, candidates.length - 1)];
}

function makeMonster(k: MonsterKind, col: number, row: number, id: string): Monster {
  return {
    id,
    kindId: k.id,
    name: k.name,
    color: k.color,
    col,
    row,
    hp: k.hp,
    hpMax: k.hp,
    damage: k.damage,
    accuracy: k.accuracy,
    defense: k.defense,
    actionTicks: k.actionTicks,
    // Copy so mutations/summons can extend without touching the shared catalog.
    abilities: k.abilities ? [...k.abilities] : [],
    boss: k.boss ?? false,
    // Ordinary monsters lie in wait; the boss guards its floor, always alert.
    state: k.boss ? 'hunting' : 'sleeping',
    // Ready to act on the player's first turn (sleepers simply pass).
    ticksUntilTurn: 0,
  };
}
