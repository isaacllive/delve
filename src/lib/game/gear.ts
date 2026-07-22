// Weapons, armor, and the enchant economy — the equipment half of Brogue's
// item system. Consumables (potions/scrolls) live in `items.ts` and are
// identified per-KIND; GEAR is different: a sword is a sword the moment you pick
// it up (you know its base type), but its ENCHANT LEVEL is hidden until you
// identify or wield-reveal it, and enchant is tracked PER INSTANCE — two +0
// daggers can diverge as you pour Scrolls of Enchanting into one of them.
//
// This module is pure data + pure derivation. It owns the weapon/armor CATALOG
// (numbers ported verbatim from BrogueCE `src/brogue/Globals.c` weaponTable /
// armorTable, struct in `Rogue.h`) and the per-instance enchant model. All the
// combat MATH is delegated to the already-built, already-tested `combat.ts`
// (netEnchant / weaponAccuracy / rollDamage / hitChance) — we never reinvent it.
// The authoritative server calls the derivation helpers here to turn "what is
// equipped + how strong is the player" into effective accuracy / defense /
// damage; it never trusts the client for any of it.
//
// Fidelity (BrogueCE, confirmed against source):
//   • weaponTable/armorTable columns: strengthRequired, {damage/armor min,max,clump}
//   • Scroll of Enchanting: enchant1 += 1 AND strengthRequired = max(0, req − 1)
//     (Items.c) — the double benefit that makes enchanting the core progression.
//   • Player base accuracy is a flat 100 all game (Combat.c); weapon-to-weapon
//     accuracy differences come ONLY from enchant + strength, so every weapon
//     shares baseAccuracy 100.
//   • Armor internal defense = armorValue + 10 × netEnchant (Items.c
//     recalculateEquipmentBonuses); displayed armor = internal ÷ 10.
//   • Unarmed player: damage {1,2,1}, accuracy 100, defense 0 (player row,
//     Globals.c).

import {
  netEnchant,
  weaponAccuracy,
  rollDamage,
  BASE_ACCURACY,
  ENCHANT_FACTOR,
  type DamageRange,
} from './combat.ts';
import type { Rng } from './rng.ts';

export type GearCategory = 'weapon' | 'armor';

export type WeaponId = 'dagger' | 'sword' | 'mace' | 'axe' | 'spear' | 'warHammer';
export type ArmorId = 'leather' | 'scale' | 'chain' | 'banded' | 'splint' | 'plate';

export type GearKindId = WeaponId | ArmorId;

export interface WeaponKind {
  id: WeaponId;
  category: 'weapon';
  /** True name shown to the player (base type is known on pickup). */
  name: string;
  /** Strength needed to wield without penalty (Brogue `strengthRequired`). */
  strengthRequired: number;
  /** Base damage roll before enchant/strength scaling. */
  damage: DamageRange;
  /** Flat base accuracy — 100 for every Brogue weapon (see header). */
  baseAccuracy: number;
  /** The dagger's signature runic: quintuple (not triple) sneak-attack damage. */
  sneakRunic: boolean;
  desc: string;
}

export interface ArmorKind {
  id: ArmorId;
  category: 'armor';
  name: string;
  strengthRequired: number;
  /** INTERNAL armor value (Brogue stores ×10; displayed armor = value ÷ 10). */
  armor: number;
  desc: string;
}

export type GearKind = WeaponKind | ArmorKind;

// ── catalog (verbatim BrogueCE numbers) ──────────────────────────────────────

/** Player's unarmed strike (Globals.c player row: damage {1,2,1}). */
export const FIST_DAMAGE: DamageRange = { min: 1, max: 2, clumpFactor: 1 };

/** Every Brogue weapon shares the player's flat base accuracy of 100. */
const WEAPON_BASE_ACCURACY = BASE_ACCURACY;

export const WEAPONS: readonly WeaponKind[] = [
  {
    id: 'dagger',
    category: 'weapon',
    name: 'dagger',
    strengthRequired: 12,
    damage: { min: 3, max: 4, clumpFactor: 1 },
    baseAccuracy: WEAPON_BASE_ACCURACY,
    sneakRunic: true,
    desc: 'A simple iron dagger. Deals quintuple damage on a sneak attack instead of triple.',
  },
  {
    id: 'sword',
    category: 'weapon',
    name: 'sword',
    strengthRequired: 14,
    damage: { min: 7, max: 9, clumpFactor: 1 },
    baseAccuracy: WEAPON_BASE_ACCURACY,
    sneakRunic: false,
    desc: 'A razor-sharp length of steel — the reliable all-rounder.',
  },
  {
    id: 'mace',
    category: 'weapon',
    name: 'mace',
    strengthRequired: 16,
    damage: { min: 16, max: 20, clumpFactor: 1 },
    baseAccuracy: WEAPON_BASE_ACCURACY,
    sneakRunic: false,
    desc: 'Iron flanges inflict substantial damage; heavy enough to need a recovery turn.',
  },
  {
    id: 'axe',
    category: 'weapon',
    name: 'axe',
    strengthRequired: 15,
    damage: { min: 7, max: 9, clumpFactor: 1 },
    baseAccuracy: WEAPON_BASE_ACCURACY,
    sneakRunic: false,
    desc: 'A blunt iron edge whose swing arc strikes all adjacent enemies at once.',
  },
  {
    id: 'spear',
    category: 'weapon',
    name: 'spear',
    strengthRequired: 13,
    damage: { min: 4, max: 5, clumpFactor: 1 },
    baseAccuracy: WEAPON_BASE_ACCURACY,
    sneakRunic: false,
    desc: 'A slender iron-tipped rod; its reach strikes an enemy and the one behind it.',
  },
  {
    id: 'warHammer',
    category: 'weapon',
    name: 'war hammer',
    strengthRequired: 20,
    damage: { min: 25, max: 35, clumpFactor: 1 },
    baseAccuracy: WEAPON_BASE_ACCURACY,
    sneakRunic: false,
    desc: 'A towering mass of lead and steel — devastating, but only the strongest can wield it.',
  },
] as const;

export const ARMORS: readonly ArmorKind[] = [
  {
    id: 'leather',
    category: 'armor',
    name: 'leather armor',
    strengthRequired: 10,
    armor: 30,
    desc: 'Lightweight armor offering basic protection.',
  },
  {
    id: 'scale',
    category: 'armor',
    name: 'scale mail',
    strengthRequired: 12,
    armor: 40,
    desc: 'Bronze scales over treated leather — more protection for minimal added weight.',
  },
  {
    id: 'chain',
    category: 'armor',
    name: 'chain mail',
    strengthRequired: 13,
    armor: 50,
    desc: 'Interlocking metal links: a tough but flexible suit.',
  },
  {
    id: 'banded',
    category: 'armor',
    name: 'banded mail',
    strengthRequired: 15,
    armor: 70,
    desc: 'Metal strips encircling a chain base — a heavier extra layer.',
  },
  {
    id: 'splint',
    category: 'armor',
    name: 'splint mail',
    strengthRequired: 17,
    armor: 90,
    desc: 'Thick plates embedded in chain, providing substantial protection.',
  },
  {
    id: 'plate',
    category: 'armor',
    name: 'plate armor',
    strengthRequired: 19,
    armor: 110,
    desc: 'Joined plates giving unmatched protection to any adventurer strong enough to bear the weight.',
  },
] as const;

export const WEAPON_BY_ID: Record<WeaponId, WeaponKind> = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w]),
) as Record<WeaponId, WeaponKind>;

export const ARMOR_BY_ID: Record<ArmorId, ArmorKind> = Object.fromEntries(
  ARMORS.map((a) => [a.id, a]),
) as Record<ArmorId, ArmorKind>;

export function isWeaponId(id: string): id is WeaponId {
  return id in WEAPON_BY_ID;
}

export function isArmorId(id: string): id is ArmorId {
  return id in ARMOR_BY_ID;
}

/** Resolve a gear kind (weapon or armor) by id, whichever catalog holds it. */
export function gearKind(category: GearCategory, kindId: GearKindId): GearKind {
  return category === 'weapon'
    ? WEAPON_BY_ID[kindId as WeaponId]
    : ARMOR_BY_ID[kindId as ArmorId];
}

// ── per-instance model ───────────────────────────────────────────────────────

/**
 * One physical piece of gear the player can carry/equip. The base type
 * (`category` + `kindId`) is known immediately on pickup — but the `enchantLevel`
 * is HIDDEN until `enchantKnown` flips (via Scroll of Identify, or Brogue's
 * wield-then-auto-reveal, both resolved by the server). Enchant is stored PER
 * INSTANCE, which is the whole point: progression is poured into a specific item.
 */
export interface GearInstance {
  /** Unique per physical item — the server assigns it (e.g. from the loot id). */
  instId: string;
  category: GearCategory;
  kindId: GearKindId;
  /** Enchant level. Starts 0; +1 per Scroll of Enchanting. Can be negative if a
   *  future cursed-item mechanic lands, so treat it as a signed integer. */
  enchantLevel: number;
  /** Whether the player has learned this instance's enchant level. */
  enchantKnown: boolean;
}

/** Build a fresh gear instance. Enchant defaults to 0 and unknown (Brogue). */
export function makeGear(
  category: GearCategory,
  kindId: GearKindId,
  instId: string,
  enchantLevel = 0,
  enchantKnown = false,
): GearInstance {
  return { instId, category, kindId, enchantLevel, enchantKnown };
}

/**
 * Apply a Scroll of Enchanting: +1 enchant level. The matching −1 to strength
 * requirement is NOT stored separately (that would duplicate the catalog value);
 * it is DERIVED by `effectiveStrengthReq`, keeping the base requirement DRY on
 * the kind. Pure — returns a new instance, does not mutate. The server calls
 * this; it is deliberately NOT wired into gameServer here.
 */
export function enchantItem(instance: GearInstance): GearInstance {
  return { ...instance, enchantLevel: instance.enchantLevel + 1 };
}

/** Reveal an instance's enchant level to the player (identify / wield-reveal). */
export function revealEnchant(instance: GearInstance): GearInstance {
  return instance.enchantKnown ? instance : { ...instance, enchantKnown: true };
}

/**
 * Effective strength requirement after enchant. Brogue lowers a piece's strength
 * requirement by 1 for every enchant (clamped at 0). We derive it from the base
 * requirement minus enchant level rather than storing it, which is exactly
 * equivalent to Brogue's per-step `max(0, req − 1)` and stays a single source of
 * truth for the base number.
 */
export function effectiveStrengthReq(instance: GearInstance): number {
  const kind = gearKind(instance.category, instance.kindId);
  return Math.max(0, kind.strengthRequired - instance.enchantLevel);
}

// ── derivation helpers the server calls (all delegate to combat.ts) ───────────

/**
 * A weapon instance's net enchant for the given player strength: raw enchant
 * plus the strength modifier against its (enchant-reduced) requirement, clamped
 * to Brogue's [-20, 50]. Exposed because both accuracy and damage read it.
 */
export function weaponNetEnchant(weapon: GearInstance, strength: number): number {
  return netEnchant(weapon.enchantLevel, strength, effectiveStrengthReq(weapon));
}

/** Same, for an armor instance. */
export function armorNetEnchant(armor: GearInstance, strength: number): number {
  return netEnchant(armor.enchantLevel, strength, effectiveStrengthReq(armor));
}

/**
 * Effective attack accuracy for the equipped weapon (null = fists). Feed the
 * result, together with a defender's INTERNAL defense, to `combat.hitChance` /
 * `combat.rollHit` on the server.
 */
export function equippedAccuracy(weapon: GearInstance | null, strength: number): number {
  if (!weapon) return weaponAccuracy(0); // unarmed: base 100, no enchant
  const kind = WEAPON_BY_ID[weapon.kindId as WeaponId];
  return weaponAccuracy(weaponNetEnchant(weapon, strength), kind.baseAccuracy);
}

/**
 * INTERNAL defense contributed by the equipped armor (null = unarmored → 0).
 * Brogue: `armorValue + 10 × netEnchant`, truncated, floored at 0. Pass this as
 * the `internalDefense` argument to `combat.hitChance`. Displayed armor is this
 * ÷ 10 (see `displayedArmor`).
 */
export function equippedDefense(armor: GearInstance | null, strength: number): number {
  if (!armor) return 0;
  const kind = ARMOR_BY_ID[armor.kindId as ArmorId];
  const net = armorNetEnchant(armor, strength);
  return Math.max(0, Math.trunc(kind.armor + 10 * net));
}

/** The player-facing armor number (internal defense ÷ 10). */
export function displayedArmor(armor: GearInstance | null, strength: number): number {
  return equippedDefense(armor, strength) / 10;
}

/**
 * Roll melee damage for the equipped weapon (null = fists). Uses the seeded rng
 * the server owns for live combat. Sneak-attack and dagger-runic multipliers are
 * applied by the server via `combat.sneakMultiplier` on top of this base roll.
 */
export function weaponDamageRoll(
  weapon: GearInstance | null,
  strength: number,
  rng: Rng,
): number {
  if (!weapon) return rollDamage(FIST_DAMAGE, 0, rng);
  const kind = WEAPON_BY_ID[weapon.kindId as WeaponId];
  return rollDamage(kind.damage, weaponNetEnchant(weapon, strength), rng);
}

/**
 * The enchant/strength-scaled damage RANGE for display (HUD preview) — Brogue
 * scales the bounds by the damage fraction and floors each at 1. Not for rolling
 * (use `weaponDamageRoll`, which rolls then scales); this is the shown min–max.
 */
export function weaponDamageRange(weapon: GearInstance | null, strength: number): DamageRange {
  const range = weapon ? WEAPON_BY_ID[weapon.kindId as WeaponId].damage : FIST_DAMAGE;
  const net = weapon ? weaponNetEnchant(weapon, strength) : 0;
  const frac = Math.pow(ENCHANT_FACTOR, net);
  return {
    min: Math.max(1, Math.floor(range.min * frac)),
    max: Math.max(1, Math.floor(range.max * frac)),
    clumpFactor: range.clumpFactor,
  };
}

/** Is the equipped weapon a dagger (drives the ×5 sneak runic in combat)? */
export function isDaggerEquipped(weapon: GearInstance | null): boolean {
  return (
    !!weapon &&
    weapon.category === 'weapon' &&
    WEAPON_BY_ID[weapon.kindId as WeaponId].sneakRunic
  );
}

/**
 * How a gear instance is named to the player. Base type is always known; the
 * enchant prefix ("+2", "-1") appears only once `enchantKnown`. A +0 identified
 * item shows no prefix (Brogue convention).
 */
export function gearDisplayName(instance: GearInstance): string {
  const kind = gearKind(instance.category, instance.kindId);
  if (!instance.enchantKnown || instance.enchantLevel === 0) return kind.name;
  const sign = instance.enchantLevel > 0 ? '+' : '';
  return `${sign}${instance.enchantLevel} ${kind.name}`;
}
