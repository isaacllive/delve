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

import { makeRng } from './rng.ts';

export type ItemCategory = 'potion' | 'scroll';

export type ItemKindId =
  // potions
  | 'life'
  | 'strength'
  | 'descent'
  // scrolls
  | 'identify'
  | 'teleportation'
  | 'aggravateMonsters';

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
] as const;

export const ITEM_KIND_BY_ID: Record<ItemKindId, ItemKind> = Object.fromEntries(
  ITEM_KINDS.map((k) => [k.id, k]),
) as Record<ItemKindId, ItemKind>;

/** All kind ids of a category, in catalog order. */
export function kindsOfCategory(category: ItemCategory): ItemKindId[] {
  return ITEM_KINDS.filter((k) => k.category === category).map((k) => k.id);
}

// ── per-run appearances (the disguise) ───────────────────────────────────────

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

/** The opaque appearance labels assigned to each item kind for a run. */
export interface RunIdentities {
  /** kindId → the label shown while unidentified (colour or scroll title). */
  labelFor: Record<ItemKindId, string>;
}

/** Seeded Fisher–Yates shuffle (does not mutate the input). */
function shuffled<T>(arr: readonly T[], seed: string): T[] {
  const out = arr.slice();
  const rng = makeRng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build this run's appearance table. Deterministic from the seed, so the server
 * and every client agree on which disguise hides which item without any of it
 * crossing the wire. Potions draw colours, scrolls draw titles; each pool is
 * shuffled and dealt to that category's kinds in catalog order.
 */
export function makeIdentities(seed: string): RunIdentities {
  const labelFor = {} as Record<ItemKindId, string>;
  const potionLabels = shuffled(POTION_COLORS, `${seed}#appear#potion`);
  const scrollLabels = shuffled(SCROLL_TITLES, `${seed}#appear#scroll`);
  let pi = 0;
  let si = 0;
  for (const kind of ITEM_KINDS) {
    if (kind.category === 'potion') labelFor[kind.id] = potionLabels[pi++];
    else labelFor[kind.id] = scrollLabels[si++];
  }
  return { labelFor };
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
  const kind = ITEM_KIND_BY_ID[kindId];
  if (discovered.has(kindId)) return kind.name;
  const label = identities.labelFor[kindId];
  return kind.category === 'potion' ? `${label} potion` : `scroll titled "${label}"`;
}
