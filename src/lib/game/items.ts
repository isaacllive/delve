// Item catalog + the identification game — the spine of Brogue's item system.
// Pure and deterministic: the CATALOG (what each item kind truly is) and the
// per-run APPEARANCES (what an unidentified item looks like until you learn it)
// both live here, with no IO. Effects that mutate world state are applied by the
// authoritative server (gameServer.ts) — this module owns data + identification.
//
// Brogue's identification game: every run, each potion kind is disguised behind a
// random colour and each scroll behind a random gibberish title. You don't know
// "the fizzy potion" is a Potion of Descent until you drink one (use-ID) or read
// a Scroll of Identify. Appearances are shuffled deterministically from the run
// seed, so — exactly like the dungeon geometry — the client can derive them
// without the server shipping them over the wire. Only the DISCOVERED set (which
// kinds the party has learned) is dynamic run state that must be broadcast.
//
// This is the SPINE: a faithful subset of Brogue's items whose effects are
// implementable on the current engine (potions of life/strength/descent; scrolls
// of identify/teleportation/aggravate monsters). The catalog grows as the engine
// gains gases, gear, staffs, etc.

import {
  makeDisguises,
  identifiedName,
  type DisguiseSpec,
  type RunIdentities,
} from './identify.ts';

// Re-exported so consumers keep importing the run's identity table from the
// catalog they already use (gameServer, Hud) — identify.ts stays an
// implementation detail they don't need to know about.
export type { RunIdentities };

export type ItemCategory = 'potion' | 'scroll' | 'food';

export type ItemKindId =
  // potions
  | 'life'
  | 'strength'
  | 'descent'
  | 'incineration'
  | 'caustic'
  // scrolls
  | 'identify'
  | 'teleportation'
  | 'aggravateMonsters'
  | 'enchanting'
  // food (never disguised — always known)
  | 'ration';

/** Whether an item is beneficial or harmful to use blind — the axis a future
 *  Scroll/Potion of Detect Magic reveals. */
export type Polarity = 'good' | 'bad';

export interface ItemKind {
  id: ItemKindId;
  category: ItemCategory;
  /** True name, revealed once the kind is identified (e.g. "potion of life"). */
  name: string;
  polarity: Polarity;
  /** Short Brogue-flavored description of what it does. */
  desc: string;
}

/** The item catalog. Order is stable — appearances are assigned per category in
 *  a seeded shuffle, so this list's order does not leak identities. */
export const ITEM_KINDS: readonly ItemKind[] = [
  {
    id: 'life',
    category: 'potion',
    name: 'potion of life',
    polarity: 'good',
    desc: 'Permanently increases your maximum health and heals you completely.',
  },
  {
    id: 'strength',
    category: 'potion',
    name: 'potion of strength',
    polarity: 'good',
    desc: 'Permanently increases your strength by one point.',
  },
  {
    id: 'descent',
    category: 'potion',
    name: 'potion of descent',
    polarity: 'bad',
    desc: 'The floor vanishes beneath you — you sink to the next level down.',
  },
  {
    id: 'incineration',
    category: 'potion',
    name: 'potion of incineration',
    polarity: 'bad',
    desc: 'Bursts into flame on impact — best hurled at foes, ruinous to quaff.',
  },
  {
    id: 'caustic',
    category: 'potion',
    name: 'potion of caustic gas',
    polarity: 'bad',
    desc: 'Releases a cloud of corrosive gas on impact — throw it, never drink it.',
  },
  {
    id: 'identify',
    category: 'scroll',
    name: 'scroll of identify',
    polarity: 'good',
    desc: 'Reveals the true nature of one unidentified item you carry.',
  },
  {
    id: 'teleportation',
    category: 'scroll',
    name: 'scroll of teleportation',
    polarity: 'good',
    desc: 'Instantly transports you to a random location on the level.',
  },
  {
    id: 'aggravateMonsters',
    category: 'scroll',
    name: 'scroll of aggravate monsters',
    polarity: 'bad',
    desc: 'A blaring alarm wakes and enrages every monster on the level.',
  },
  {
    // The enchant economy's one currency: read it on a weapon or armor to raise
    // its enchant level by 1 (and lower its strength requirement by 1). The
    // effect on a chosen gear instance lives in gear.ts (`enchantItem`); this
    // entry makes it part of the identification game like every other scroll.
    id: 'enchanting',
    category: 'scroll',
    name: 'scroll of enchanting',
    polarity: 'good',
    desc: 'Infuses a weapon or suit of armor with magic, raising its power and easing its strength requirement.',
  },
  {
    id: 'ration',
    category: 'food',
    name: 'ration of food',
    polarity: 'good',
    desc: 'A sustaining meal. Eat it to stave off starvation on the long descent.',
  },
] as const;

export const ITEM_KIND_BY_ID: Record<ItemKindId, ItemKind> = Object.fromEntries(
  ITEM_KINDS.map((k) => [k.id, k]),
) as Record<ItemKindId, ItemKind>;

/** All kind ids of a category, in catalog order. */
export function kindsOfCategory(category: ItemCategory): ItemKindId[] {
  return ITEM_KINDS.filter((k) => k.category === category).map((k) => k.id);
}

// ── per-run appearances (the disguise) ───────────────────────────────────────
// The MECHANISM lives in identify.ts (category-agnostic, shared with the item
// categories still to come). This section only declares what CONSUMABLES hide
// behind: potions draw colours, scrolls draw titles, food is never disguised.

// Pools are intentionally larger than the current catalog so appearances stay
// varied and the catalog can grow without immediately exhausting them.
const POTION_COLORS = [
  'crimson', 'azure', 'cloudy', 'fizzy', 'sea-green', 'teal', 'violet', 'amber',
  'silvery', 'ochre', 'inky', 'pearly', 'rosewater', 'smoky', 'golden', 'jade',
];
const SCROLL_TITLES = [
  'ZELAPA', 'VELNOR', 'KODOKO', 'ISETH', 'YRIX', 'MUNTOK', 'THARSA', 'QUELEB',
  'OMARIN', 'VYSS', 'NOGRETH', 'ELKATH', 'SURIN', 'PRAXIA', 'DWELMOR', 'AXENTU',
];

/** Consumables' disguise rules. Food is absent on purpose — a ration is never a
 *  mystery, so it has no appearance and always shows its true name. */
export const CONSUMABLE_DISGUISES: readonly DisguiseSpec[] = [
  {
    category: 'potion',
    kinds: kindsOfCategory('potion'),
    appearances: POTION_COLORS,
    format: (label) => `${label} potion`,
  },
  {
    category: 'scroll',
    kinds: kindsOfCategory('scroll'),
    appearances: SCROLL_TITLES,
    format: (label) => `scroll titled "${label}"`,
  },
];

/** Build this run's appearance table for consumables. Deterministic from the
 *  seed, so the server and every client agree on which disguise hides which item
 *  without any of it crossing the wire. */
export function makeIdentities(seed: string): RunIdentities {
  return makeDisguises(seed, CONSUMABLE_DISGUISES);
}

/**
 * How an item is named to the player: its true name once the kind is
 * discovered, otherwise its disguised appearance ("the fizzy potion",
 * "a scroll titled OMARIN").
 */
export function displayName(
  kindId: ItemKindId,
  identities: RunIdentities,
  discovered: ReadonlySet<ItemKindId>,
): string {
  return identifiedName(kindId, ITEM_KIND_BY_ID[kindId].name, identities, discovered);
}
