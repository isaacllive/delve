// Brogue-faithful combat math — pure, deterministic, no IO. The numbers here are
// ported verbatim from BrogueCE (`src/brogue/Combat.c`, `PowerTables.c`,
// `Items.c`), so a faithful recreation fights the way Brogue fights: power comes
// from equipment enchant + strength + positioning, NEVER from experience levels.
//
// Fidelity notes (source constants):
//   • Hit chance   = accuracy × 0.987^(internal defense)   [Combat.c hitProbability]
//   • accuracyFraction(netEnchant) = 1.065^netEnchant       [PowerTables.c]
//   • damageFraction(netEnchant)   = 1.065^netEnchant       [PowerTables.c]
//   • defenseFraction base 0.877347265 = 0.987^10 per displayed-armor point;
//     equivalently 0.987 per internal-defense point. Displayed armor = internal ÷ 10.
//   • netEnchant = enchantLevel + strengthModifier, clamped to [-20, 50]   [Items.c]
//   • strengthModifier = diff>0 ? diff×0.25 : diff×2.5   (diff = STR − strReq)  [Items.c]
//   • Sneak attack ×3 damage; a dagger's runic sneak bonus makes it ×5   [Combat.c]
//
// Brogue works in 16.16 fixed point (FP_FACTOR = 1<<16). We use JS floats and
// round only where Brogue would; the observable results match.

import type { Rng } from './rng.ts';

/** Per-point exponential falloff of a defender's hit-avoidance. Brogue's
 *  `hitProbability = accuracy × 0.987^defense`. */
export const HIT_FALLOFF = 0.987;

/** Per net-enchant multiplier applied to BOTH accuracy and weapon damage
 *  (BrogueCE `PowerTables.c`: 1.065^x for x in enchant points). */
export const ENCHANT_FACTOR = 1.065;

/** A player's base weapon accuracy before enchant/strength scaling. */
export const BASE_ACCURACY = 100;

/** Enchant-equivalent granted per point of Strength ABOVE an item's requirement. */
export const STR_BONUS_PER_POINT = 0.25;
/** Enchant-equivalent lost per point of Strength BELOW an item's requirement. */
export const STR_PENALTY_PER_POINT = 2.5;

/** Bounds Brogue clamps net enchant to. */
export const NET_ENCHANT_MIN = -20;
export const NET_ENCHANT_MAX = 50;

/** Damage multiplier when striking an unaware (asleep/wandering) target. */
export const SNEAK_MULTIPLIER = 3;
/** A dagger's sneak-attack multiplier (its signature runic). */
export const DAGGER_SNEAK_MULTIPLIER = 5;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Enchant-equivalent adjustment from wielding/wearing an item whose strength
 * requirement differs from the actor's strength. Each point over the
 * requirement helps a little (+0.25); each point under hurts a lot (−2.5) —
 * being under-strength is punishing, exactly as in Brogue.
 */
export function strengthModifier(strength: number, strengthRequired: number): number {
  const diff = strength - strengthRequired;
  return diff > 0 ? diff * STR_BONUS_PER_POINT : diff * STR_PENALTY_PER_POINT;
}

/**
 * The item's *net* enchant: its raw enchant level plus the strength modifier,
 * clamped to Brogue's [-20, 50] range. Weapons and armor factor strength in;
 * staffs/charms/rings (no strength requirement) pass strengthRequired = strength
 * so the modifier is 0.
 */
export function netEnchant(enchantLevel: number, strength: number, strengthRequired: number): number {
  return clamp(enchantLevel + strengthModifier(strength, strengthRequired), NET_ENCHANT_MIN, NET_ENCHANT_MAX);
}

/** 1.065^netEnchant — the multiplier Brogue applies to accuracy. */
export function accuracyFraction(net: number): number {
  return Math.pow(ENCHANT_FACTOR, net);
}

/** 1.065^netEnchant — the multiplier Brogue applies to weapon damage. */
export function damageFraction(net: number): number {
  return Math.pow(ENCHANT_FACTOR, net);
}

/**
 * A player's effective attack accuracy for a weapon at a given net enchant.
 * `BASE_ACCURACY × 1.065^net` (per-weapon base accuracies can be supplied for
 * weapons that deviate from 100).
 */
export function weaponAccuracy(net: number, base = BASE_ACCURACY): number {
  return base * accuracyFraction(net);
}

/**
 * Probability (0..1) that an attack of the given accuracy lands against a
 * defender with the given INTERNAL defense (displayed armor × 10). Brogue clamps
 * the percentage to [0, 100]; we return it as a fraction for direct use with an
 * rng roll.
 */
export function hitChance(accuracy: number, internalDefense: number): number {
  const pct = accuracy * Math.pow(HIT_FALLOFF, internalDefense);
  return clamp(pct, 0, 100) / 100;
}

/** Roll whether an attack lands. */
export function rollHit(accuracy: number, internalDefense: number, rng: Rng): boolean {
  return rng.next() < hitChance(accuracy, internalDefense);
}

/**
 * Brogue's `randClumpedRange`: a roll in [lo, hi] that clumps toward the middle
 * by summing `clumpFactor` narrower sub-rolls (clumpFactor ≤ 1 is a flat roll).
 * Ported from `Random.c` so weapon damage spreads exactly as Brogue's does.
 */
export function randClump(lo: number, hi: number, clumpFactor: number, rng: Rng): number {
  if (clumpFactor <= 1 || hi <= lo) return rng.int(lo, hi);
  const span = hi - lo;
  const numSides = Math.floor(span / clumpFactor);
  const remainder = span % clumpFactor;
  let total = lo;
  for (let i = 0; i < clumpFactor; i++) {
    // The first `remainder` sub-rolls get one extra side to cover the remainder.
    total += rng.int(0, i < remainder ? numSides + 1 : numSides);
  }
  return total;
}

export interface DamageRange {
  min: number;
  max: number;
  /** How tightly the roll clumps toward the mean (Brogue weapons: 1–3). */
  clumpFactor: number;
}

/**
 * Roll final weapon damage: a clumped base roll scaled by the enchant/strength
 * damage fraction, floored to an integer (Brogue truncates fixed-point damage).
 */
export function rollDamage(range: DamageRange, net: number, rng: Rng): number {
  const base = randClump(range.min, range.max, range.clumpFactor, rng);
  return Math.floor(base * damageFraction(net));
}

/**
 * Multiply damage for a sneak attack against an unaware target. A dagger's
 * runic makes its ambush far deadlier (×5 vs the ×3 every other weapon gets).
 */
export function sneakMultiplier(isDagger: boolean): number {
  return isDagger ? DAGGER_SNEAK_MULTIPLIER : SNEAK_MULTIPLIER;
}
