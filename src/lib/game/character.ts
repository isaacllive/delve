// Brogue-faithful character model. In Brogue you have exactly TWO growable
// character stats — HEALTH and STRENGTH — and both grow ONLY by drinking
// specific potions, never through experience. There are no levels, no XP, no
// skill points: your power comes from equipment, consumables, and positioning.
// This module is the single source of truth for those two stats and their two
// growth potions.
//
// Numbers ported verbatim from BrogueCE:
//   • starting Strength = 12                        (RogueMain.c: rogue.strength = 12)
//   • starting max HP   = 30                         (player base health, GlobalsBrogue.c)
//   • Potion of Strength → +1 Strength, permanent    (Items.c POTION_STRENGTH, magnitude {1,1})
//   • Potion of Life     → +10 max HP AND a full heal (Items.c POTION_LIFE, magnitude {10,10})
//
// Pure and deterministic — no IO, no randomness. The growth functions return new
// values (immutable-update style) so the authoritative server can apply them and
// they stay trivially unit-testable ahead of the item system that will trigger
// them.

/** Strength every delver starts with (Brogue's `rogue.strength = 12`). */
export const STARTING_STRENGTH = 12;

/** Maximum health every delver starts with (Brogue's player base health). */
export const STARTING_MAX_HP = 30;

/** Strength granted by one Potion of Strength (permanent). */
export const POTION_OF_STRENGTH_BONUS = 1;

/** Max-HP granted by one Potion of Life (permanent; also heals to full). */
export const POTION_OF_LIFE_HP_BONUS = 10;

/** The mutable vitals every character carries. `PlayerState` is a superset of
 *  this, so the growth helpers below accept a player state directly. */
export interface Vitals {
  hp: number;
  hpMax: number;
  strength: number;
}

/** Fresh Brogue-baseline vitals (STR 12, 30/30 HP). */
export function startingVitals(): Vitals {
  return { hp: STARTING_MAX_HP, hpMax: STARTING_MAX_HP, strength: STARTING_STRENGTH };
}

/**
 * Apply a Potion of Strength: permanently raise Strength by 1. Returns the new
 * strength value; the rest of the character is untouched.
 */
export function potionOfStrength(strength: number): number {
  return strength + POTION_OF_STRENGTH_BONUS;
}

/**
 * Apply a Potion of Life: permanently raise max HP by a flat +10 and restore the
 * drinker to full health (Brogue heals completely on top of the max-HP gain).
 * Returns the new { hp, hpMax }.
 */
export function potionOfLife(hpMax: number): { hp: number; hpMax: number } {
  const newMax = hpMax + POTION_OF_LIFE_HP_BONUS;
  return { hp: newMax, hpMax: newMax };
}

/**
 * Heal by `amount`, never exceeding max HP. Returns the new current HP. (Brogue's
 * healing potions and regeneration both cap at max; Potion of Life is the only
 * thing that raises the cap — see `potionOfLife`.)
 */
export function healBy(hp: number, hpMax: number, amount: number): number {
  return Math.min(hpMax, hp + Math.max(0, amount));
}
