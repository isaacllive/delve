// Status effects — the timed conditions an actor can be under (confused,
// hasted, levitating, poisoned…), plus the pure RESOLUTION of each one into the
// concrete answer a caller needs ("which way did that step actually go?",
// "what does this action cost?", "how much of that hit lands?").
//
// Why one module and not two: every resolver is a read of the same StatusSet,
// and splitting mechanism from resolution would put the meaning of a kind's
// `magnitude` in a different file from the kind itself — exactly the drift
// CLAUDE.md's "one authoritative source per rule" warns about. This file stays
// small enough to hold both.
//
// Shape of the contract:
//   • A StatusSet is an ordered list of {kind, turns, magnitude}. It is plain
//     JSON so it can ride the wire in PlayerState verbatim.
//   • Mutators are IMMUTABLE — they return a new set, never edit in place — so
//     the server can compute a turn's outcome before committing it.
//   • Afflicting REFRESHES, it does not stack: re-applying `confused` for 5
//     turns while 9 remain leaves 9. (Brogue's model: a second dose of the same
//     effect tops you up, it never multiplies the duration.) `accumulate` is the
//     explicit opt-in for the one condition that genuinely adds — venom.
//   • Every resolver is total: given a set with no relevant status it returns
//     the unmodified input, so callers can route ALL traffic through them
//     instead of branching on `hasStatus` at each site.
//
// Determinism: the only resolver that rolls dice (`confusedStep`) takes the
// seeded Rng (rng.ts) and consumes it ONLY when the actor is actually confused,
// so an unconfused actor never perturbs the shared random stream.

import { DIRS8 } from './grid.ts';
import type { Rng } from './rng.ts';
import { TICKS_PER_TURN, speedTicks, type Speed } from './energy.ts';

// ── the vocabulary ───────────────────────────────────────────────────────────

/**
 * Every condition an actor can be under. Split by who can answer it:
 *
 * RESOLVED HERE (a pure derivation exists — see the resolvers below):
 *   confused     scrambles the direction of a step            → confusedStep
 *   hasted       acts twice as often (energy.ts HASTE_TICKS)  → effectiveActionTicks
 *   slowed       acts half as often  (energy.ts SLOW_TICKS)   → effectiveActionTicks
 *   levitating   floats over pits / water / chasms            → entryHazardFor
 *   darkened     your light is smothered; vision shrinks      → effectiveTorchRadius
 *   shielded     a magic buffer soaks damage until spent      → absorbDamage
 *   paralyzed    cannot act at all                            → canAct
 *   fireImmune   fire does nothing to you                     → resolveFireDamage
 *   poisoned     loses HP every turn until it runs out        → poisonDamage
 *
 * DECLARED BUT NOT RESOLVED HERE — each needs state this module cannot see, so
 * faking a pure answer would be a lie. What each actually needs:
 *   telepathic     the monster list for the floor → a server-side visibility
 *                  channel ("known by magic") separate from line of sight.
 *   hallucinating  a renderer concern: substitute display names/colours at draw
 *                  time. No rule changes, so nothing here to derive.
 *   discordant     retargeting: an afflicted monster attacks its own side. Needs
 *                  the actor list + AI, which live in the server's monster turn.
 *   nauseous       a random chance to vomit instead of acting, which spends the
 *                  turn — needs the action pipeline, not a derivation. (Deliberately
 *                  NOT folded into `canAct`: paralysis is total and certain,
 *                  nausea is a random interrupt with its own message and cost.)
 *   negated        strips magic from whatever it touches — items, monster
 *                  abilities, and other statuses. It needs the item/ability
 *                  catalogs to know what counts as magical.
 */
export type StatusKind =
  | 'confused'
  | 'hasted'
  | 'slowed'
  | 'levitating'
  | 'darkened'
  | 'shielded'
  | 'paralyzed'
  | 'fireImmune'
  | 'poisoned'
  | 'telepathic'
  | 'hallucinating'
  | 'discordant'
  | 'nauseous'
  | 'negated';

/** The vocabulary as data — one list, so UI/validation never drifts from the
 *  type (same pattern as hazards.ts `GAS_KINDS`). */
export const STATUS_KINDS: readonly StatusKind[] = [
  'confused',
  'hasted',
  'slowed',
  'levitating',
  'darkened',
  'shielded',
  'paralyzed',
  'fireImmune',
  'poisoned',
  'telepathic',
  'hallucinating',
  'discordant',
  'nauseous',
  'negated',
];

/**
 * One active condition.
 *
 * `magnitude` is per-kind strength — its meaning is fixed by the resolver that
 * reads it, and nothing else may reinterpret it:
 *   shielded  → damage points the buffer can still soak (spent by absorbDamage)
 *   darkened  → cells of light radius smothered
 *   poisoned  → HP lost per turn
 *   all others → unused (carried as 1 so the field is never undefined)
 */
export interface StatusEffect {
  kind: StatusKind;
  /** Turns remaining. Always > 0 for a status present in a set. */
  turns: number;
  /** Per-kind strength; see above. Always > 0. */
  magnitude: number;
}

/** An actor's active conditions. Empty = unafflicted. */
export type StatusSet = readonly StatusEffect[];

/** Magnitude for kinds that don't use one (and the default dose). */
export const DEFAULT_MAGNITUDE = 1;

// ── tuning constants (named, not magic) ──────────────────────────────────────

/** Chance a confused actor's step goes somewhere it did not intend. Brogue makes
 *  confused movement fully random; a coin flip keeps confusion genuinely
 *  dangerous while leaving a delver a fighting chance to stagger out of a gas
 *  cloud, which matters more here because Delve is co-op and a totally helpless
 *  player is a teammate's problem too. */
export const CONFUSION_STRAY_CHANCE = 0.5;

/** Light radius a standard darkness effect smothers (the magnitude to afflict
 *  `darkened` with). Enough to reduce a torch to arm's length without blinding. */
export const DARKNESS_RADIUS_REDUCTION = 6;

/** Floor on a smothered light radius — you can always see your own cell and the
 *  ring around it, so darkness never makes movement unreadable. */
export const MIN_TORCH_RADIUS = 1;

/** HP a poison stack costs per turn (Brogue: 1/turn while poisoned). */
export const POISON_DAMAGE_PER_TURN = 1;

// ── mechanism: build / afflict / cure / expire ───────────────────────────────

/** A fresh, unafflicted status set. */
export function emptyStatuses(): StatusSet {
  return [];
}

/** The active effect of a kind, or undefined. */
export function statusOf(statuses: StatusSet, kind: StatusKind): StatusEffect | undefined {
  return statuses.find((s) => s.kind === kind);
}

/** Is this condition active? */
export function hasStatus(statuses: StatusSet, kind: StatusKind): boolean {
  return statusOf(statuses, kind) !== undefined;
}

/** Turns remaining on a condition (0 when absent). */
export function statusTurns(statuses: StatusSet, kind: StatusKind): number {
  return statusOf(statuses, kind)?.turns ?? 0;
}

/** Strength of a condition (0 when absent). */
export function statusMagnitude(statuses: StatusSet, kind: StatusKind): number {
  return statusOf(statuses, kind)?.magnitude ?? 0;
}

/**
 * Apply a condition for `turns` turns. REFRESH semantics: an already-present
 * status keeps the LONGER duration and the STRONGER magnitude — a second dose
 * tops you up, it never stacks into a death sentence. Non-positive durations are
 * a no-op (an effect with no duration was never applied).
 */
export function afflict(
  statuses: StatusSet,
  kind: StatusKind,
  turns: number,
  magnitude: number = DEFAULT_MAGNITUDE,
): StatusSet {
  if (turns <= 0) return statuses;
  return upsert(statuses, kind, turns, Math.max(DEFAULT_MAGNITUDE, magnitude), Math.max);
}

/**
 * Apply a condition ADDITIVELY — the new duration is added to whatever remains.
 * This is the deliberate exception to refresh-not-stack, for conditions that
 * genuinely accumulate: venom from repeated bites builds up in Brogue rather
 * than merely topping off. Use `afflict` for everything else.
 */
export function accumulate(
  statuses: StatusSet,
  kind: StatusKind,
  turns: number,
  magnitude: number = DEFAULT_MAGNITUDE,
): StatusSet {
  if (turns <= 0) return statuses;
  return upsert(statuses, kind, turns, Math.max(DEFAULT_MAGNITUDE, magnitude), (a, b) => a + b);
}

/** Remove a condition outright (a cure, or a shield spent to nothing). */
export function cure(statuses: StatusSet, kind: StatusKind): StatusSet {
  return statuses.some((s) => s.kind === kind) ? statuses.filter((s) => s.kind !== kind) : statuses;
}

/** What one turn of elapsed time did to an actor's conditions. */
export interface StatusDecay {
  statuses: StatusSet;
  /** Kinds that ran out this turn — the server logs "you feel less confused". */
  expired: StatusKind[];
}

/**
 * Advance every condition by one turn, dropping those that run out. This is the
 * per-turn world system: exactly one call per elapsed turn, per actor.
 */
export function decayStatuses(statuses: StatusSet): StatusDecay {
  if (statuses.length === 0) return { statuses, expired: [] };
  const next: StatusEffect[] = [];
  const expired: StatusKind[] = [];
  for (const s of statuses) {
    const turns = s.turns - 1;
    if (turns > 0) next.push({ ...s, turns });
    else expired.push(s.kind);
  }
  return { statuses: next, expired };
}

/** Insert-or-combine a status, preserving order for existing kinds. */
function upsert(
  statuses: StatusSet,
  kind: StatusKind,
  turns: number,
  magnitude: number,
  combine: (existing: number, incoming: number) => number,
): StatusSet {
  const existing = statusOf(statuses, kind);
  if (!existing) return [...statuses, { kind, turns, magnitude }];
  const merged: StatusEffect = {
    kind,
    turns: combine(existing.turns, turns),
    // Magnitude always takes the stronger dose: a weak second application must
    // never dilute a strong shield or a deep darkness.
    magnitude: Math.max(existing.magnitude, magnitude),
  };
  return statuses.map((s) => (s.kind === kind ? merged : s));
}

/** Replace a status's magnitude in place (used when a shield is partly spent).
 *  Dropping to zero or below removes the status entirely. */
function withMagnitude(statuses: StatusSet, kind: StatusKind, magnitude: number): StatusSet {
  if (magnitude <= 0) return cure(statuses, kind);
  return statuses.map((s) => (s.kind === kind ? { ...s, magnitude } : s));
}

// ── resolution: confused ─────────────────────────────────────────────────────

/** A single grid step, in the same (dcol, drow) form as the `move` intent. */
export interface Step {
  dcol: number;
  drow: number;
}

/**
 * Scramble an intended step. Returns one of the 8 compass directions: either the
 * intended one, or — on a stray roll — a uniformly-chosen DIFFERENT one, so a
 * stray is always visibly a stray. A zero step (waiting in place) is never
 * scrambled: confusion misdirects movement, it doesn't force it.
 *
 * The result is always a legal unit direction, so the caller's normal move
 * validation (walls, bounds, bump-to-attack) applies unchanged.
 */
export function confusedStep(dcol: number, drow: number, rng: Rng): Step {
  const dx = Math.sign(dcol);
  const dy = Math.sign(drow);
  if (dx === 0 && dy === 0) return { dcol: 0, drow: 0 };
  if (!rng.chance(CONFUSION_STRAY_CHANCE)) return { dcol: dx, drow: dy };
  const strays = DIRS8.filter((d) => d.col !== dx || d.row !== dy);
  const d = rng.pick(strays);
  return { dcol: d.col, drow: d.row };
}

/**
 * The step an actor ACTUALLY takes, given what it intended. This is the single
 * call the move handler needs — it applies confusion when present and otherwise
 * just normalizes the direction, without touching the Rng.
 *
 * This is the function that makes confusion gas real: hazards.ts has simulated
 * and the renderer has drawn confusion clouds since the terrain sim landed, but
 * with no status layer to afflict, walking through one did nothing at all.
 */
export function resolveStep(statuses: StatusSet, dcol: number, drow: number, rng: Rng): Step {
  if (!hasStatus(statuses, 'confused')) return { dcol: Math.sign(dcol), drow: Math.sign(drow) };
  return confusedStep(dcol, drow, rng);
}

// ── resolution: hasted / slowed ──────────────────────────────────────────────

/**
 * An actor's speed state. Haste and slow CANCEL rather than fight: being both is
 * simply normal speed, which is the only reading that keeps the two symmetric
 * (otherwise the order of application would decide the outcome).
 */
export function speedFor(statuses: StatusSet): Speed {
  const fast = hasStatus(statuses, 'hasted');
  const slow = hasStatus(statuses, 'slowed');
  if (fast === slow) return 'normal';
  return fast ? 'hasted' : 'slowed';
}

/**
 * What an action actually costs this actor, in scheduler ticks. Scaled from the
 * actor's own base cost (a jackal's 50, an ogre's 200) by the ratio energy.ts
 * defines for the speed state — so there is ONE speed model, and a hasted jackal
 * is twice as fast as a normal jackal rather than snapping to a global constant.
 * Never returns less than 1 tick, or the scheduler could not advance.
 */
export function effectiveActionTicks(statuses: StatusSet, baseTicks: number): number {
  const scaled = baseTicks * (speedTicks(speedFor(statuses)) / TICKS_PER_TURN);
  return Math.max(1, Math.round(scaled));
}

// ── resolution: levitating ───────────────────────────────────────────────────

/** Is this actor floating above the floor? */
export function isLevitating(statuses: StatusSet): boolean {
  return hasStatus(statuses, 'levitating');
}

/**
 * The terrain entry hazard that actually applies when this actor steps onto a
 * cell — the hazard as given, or nothing at all while levitating. Generic over
 * the hazard type so it composes directly with `terrain.hazardAt` (and later
 * lava/chasm kinds) without restating that union here.
 */
export function entryHazardFor<T>(statuses: StatusSet, hazard: T | null): T | null {
  return isLevitating(statuses) ? null : hazard;
}

// ── resolution: darkened ─────────────────────────────────────────────────────

/**
 * The light/vision radius this actor really has. Darkness smothers `magnitude`
 * cells of it, never below MIN_TORCH_RADIUS so you can still see where you are
 * standing and what is next to you.
 */
export function effectiveTorchRadius(statuses: StatusSet, baseRadius: number): number {
  const smothered = statusMagnitude(statuses, 'darkened');
  if (smothered <= 0) return baseRadius;
  return Math.max(MIN_TORCH_RADIUS, baseRadius - smothered);
}

// ── resolution: shielded ─────────────────────────────────────────────────────

/** Outcome of running incoming damage through a magic shield. */
export interface Absorption {
  /** Damage that gets through to HP. */
  damage: number;
  /** Damage the shield ate. */
  absorbed: number;
  /** Shield points still standing (0 once broken). */
  shieldRemaining: number;
  /** The statuses after the shield was spent (the status is gone once broken). */
  statuses: StatusSet;
}

/**
 * Spend a shield against an incoming hit. The shield soaks up to its remaining
 * magnitude; whatever is left over lands on HP. A shield reduced to nothing is
 * removed outright rather than lingering at 0, so `hasStatus('shielded')` always
 * means "still protected".
 */
export function absorbDamage(statuses: StatusSet, damage: number): Absorption {
  const incoming = Math.max(0, damage);
  const shield = statusMagnitude(statuses, 'shielded');
  if (shield <= 0 || incoming === 0) {
    return { damage: incoming, absorbed: 0, shieldRemaining: shield, statuses };
  }
  const absorbed = Math.min(shield, incoming);
  const shieldRemaining = shield - absorbed;
  return {
    damage: incoming - absorbed,
    absorbed,
    shieldRemaining,
    statuses: withMagnitude(statuses, 'shielded', shieldRemaining),
  };
}

// ── resolution: paralyzed ────────────────────────────────────────────────────

/**
 * May this actor take its turn at all? Paralysis is total — the turn still
 * elapses (the world moves on around you, which is what makes it terrifying),
 * but the actor's chosen action is discarded. The caller is responsible for
 * spending the time; see the integration note.
 */
export function canAct(statuses: StatusSet): boolean {
  return !hasStatus(statuses, 'paralyzed');
}

// ── resolution: fireImmune ───────────────────────────────────────────────────

/** Does fire hurt this actor right now? */
export function takesFireDamage(statuses: StatusSet): boolean {
  return !hasStatus(statuses, 'fireImmune');
}

/** Fire damage after immunity — the full amount, or nothing at all. */
export function resolveFireDamage(statuses: StatusSet, damage: number): number {
  return takesFireDamage(statuses) ? Math.max(0, damage) : 0;
}

// ── resolution: poisoned ─────────────────────────────────────────────────────

/**
 * HP this actor loses to venom this turn (0 when unpoisoned). The remaining
 * duration IS the remaining poison — `decayStatuses` runs the same clock as
 * every other status, so poison has exactly one counter.
 */
export function poisonDamage(statuses: StatusSet): number {
  const poison = statusOf(statuses, 'poisoned');
  if (!poison) return 0;
  return poison.magnitude * POISON_DAMAGE_PER_TURN;
}

/** Apply venom: `stacks` more turns of poison. Additive, because repeated bites
 *  genuinely compound (see `accumulate`). */
export function poison(statuses: StatusSet, stacks: number): StatusSet {
  return accumulate(statuses, 'poisoned', stacks);
}

/**
 * Migration path for the legacy `PlayerState.poison` counter, which predates
 * this module and runs a second, parallel poison clock in the server. Folds a
 * raw counter into the status layer additively (matching how the old counter
 * accumulated) and returns the merged set; the caller then zeroes the legacy
 * field. Safe to run on an already-migrated set — a 0 counter is a no-op.
 *
 * Once every write to the legacy field is gone this function can go with it.
 */
export function foldLegacyPoison(statuses: StatusSet, legacyPoison: number): StatusSet {
  return legacyPoison > 0 ? poison(statuses, legacyPoison) : statuses;
}
