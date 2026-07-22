// Potion identification game. Potions come in several types with hidden
// identities: each run assigns a random APPEARANCE ("a murky potion") to every
// type, deterministically from the run seed, so the whole party sees the same
// appearances but nobody knows what a colour does until it's identified —
// identify-by-use. Effects resolve server-side (gameServer); this module owns
// the pure data: the type table, the seeded appearance assignment, and the
// effect magnitudes.

import { makeRng } from './rng.ts';

export type PotionKind = 'healing' | 'life' | 'might' | 'harm';

/** Healing a Healing potion restores, and its shop price. Home of the potion
 *  economy constants (re-exported by loot.ts for existing callers). */
export const POTION_HEAL = 12;
export const POTION_COST = 15;

export interface PotionType {
  id: PotionKind;
  /** True name, shown once identified. */
  name: string;
  /** True for beneficial potions (UI can tint good vs. bad once known). */
  good: boolean;
}

// Order here is the canonical belt/slot order and the appearance-assignment
// order (so appearances are stable given a seed).
export const POTION_TYPES: readonly PotionType[] = [
  { id: 'healing', name: 'Healing', good: true },
  { id: 'life', name: 'Life', good: true },
  { id: 'might', name: 'Might', good: true },
  { id: 'harm', name: 'Caustic', good: false },
];

/** Effect magnitudes (all server-applied). Healing reuses the shared constant so
 *  the quaff and the shop can't drift. */
export const LIFE_MAX_HP = 8; // permanent max-HP gain (+ full heal)
export const MIGHT_ATTACK = 2; // permanent attack bonus
export const HARM_DAMAGE = 10; // self-damage (never lethal — floored at 1 HP)

// Appearance pool (>= number of types). Assigned 1:1 to types per run.
const APPEARANCES = [
  'crimson',
  'murky',
  'fizzing',
  'cloudy',
  'azure',
  'viscous',
  'glowing',
  'oily',
] as const;

/** Deterministic appearance→type assignment for a run: a seeded shuffle of the
 *  appearance pool mapped onto the type list. Same on client + server. */
export function potionAppearances(seed: string): Record<PotionKind, string> {
  const rng = makeRng(`${seed}#potionlook`);
  const pool = [...APPEARANCES];
  // Fisher–Yates with the seeded rng.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = {} as Record<PotionKind, string>;
  POTION_TYPES.forEach((t, i) => (out[t.id] = pool[i]));
  return out;
}

/** Weighted random potion type for a loot drop (mostly healing; the odd bad
 *  potion keeps found potions a gamble). Deterministic via the caller's rng. */
export function rollPotionType(rng: { int(min: number, max: number): number }): PotionKind {
  // Cumulative weights out of 100.
  const roll = rng.int(0, 99);
  if (roll < 45) return 'healing';
  if (roll < 65) return 'might';
  if (roll < 80) return 'life';
  return 'harm';
}

/** Belt label for a potion type given what the party has identified so far. */
export function potionLabel(id: PotionKind, appearances: Record<PotionKind, string>, identified: boolean): string {
  const t = POTION_TYPES.find((p) => p.id === id);
  if (identified && t) return `Potion of ${t.name}`;
  return `${appearances[id]} potion`;
}

export interface PotionSlot {
  id: PotionKind;
  label: string;
  count: number;
  good: boolean;
  identified: boolean;
}

/** The held-potions belt in canonical order: one slot per type the player
 *  actually carries. Single source of truth for both the HUD display and the
 *  number-key quaff mapping, so the slot a key targets always matches the UI. */
export function potionBelt(
  potions: Record<string, number>,
  appearances: Record<PotionKind, string>,
  identified: readonly string[] | Set<string>,
): PotionSlot[] {
  const known = identified instanceof Set ? identified : new Set(identified);
  const out: PotionSlot[] = [];
  for (const t of POTION_TYPES) {
    const count = potions[t.id] ?? 0;
    if (count <= 0) continue;
    const ident = known.has(t.id);
    out.push({ id: t.id, label: potionLabel(t.id, appearances, ident), count, good: t.good, identified: ident });
  }
  return out;
}
