// The identification engine — Brogue's "what IS this thing?" game, as a
// category-agnostic mechanism.
//
// Every run, each unidentified item kind hides behind a random appearance: a
// potion is "the fizzy potion" until you drink one, a scroll is `scroll titled
// "OMARIN"` until you read it. The disguise is dealt deterministically from the
// run seed, so — exactly like the dungeon geometry — server and clients derive
// the same table without any of it crossing the wire. Only the DISCOVERED set
// (what the party has learned) is live state worth broadcasting.
//
// This module owns the MECHANISM and knows nothing about any catalog. Each item
// category module (items.ts today; staffs/wands/rings/charms as they land —
// gaps G6–G9) declares its own `DisguiseSpec` and calls in here. That is the
// point of the split: five upcoming item categories extend the identification
// game by adding a file, never by editing a shared one.

import { makeRng } from './rng.ts';

/** One category's disguise rules: what to hide, and what to hide it behind. */
export interface DisguiseSpec {
  /** Stable category key. Seeds this category's shuffle — changing it reshuffles
   *  every existing seed's appearances, so treat it as part of the save format. */
  category: string;
  /** Kind ids in catalog order. Appearances are dealt in this order, so the
   *  catalog's order must not leak identities — keep it stable and unsorted. */
  kinds: readonly string[];
  /** The appearance pool to deal from. Must hold at least one entry per kind;
   *  keep it comfortably larger so the catalog can grow. */
  appearances: readonly string[];
  /** Renders an unidentified item's name from its dealt appearance label
   *  (e.g. `'fizzy'` → `'fizzy potion'`). */
  format: (label: string) => string;
}

/** A run's dealt disguises. Keyed by kind id across every category. */
export interface RunIdentities {
  /** kindId → the bare appearance label ("fizzy", "OMARIN"). */
  labelFor: Record<string, string>;
  /** kindId → the full name shown while unidentified ("fizzy potion"). */
  disguiseFor: Record<string, string>;
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
 * Deal this run's appearances across every category. Deterministic from the
 * seed: same seed + same specs → same table, on server and client alike.
 *
 * Throws if a category's pool is too small to disguise every kind — a silent
 * `undefined` appearance would surface as a broken item name mid-run, and a
 * growing catalog outrunning its pool is exactly the failure the item-breadth
 * work (G9) will provoke.
 */
export function makeDisguises(seed: string, specs: readonly DisguiseSpec[]): RunIdentities {
  const labelFor: Record<string, string> = {};
  const disguiseFor: Record<string, string> = {};
  for (const spec of specs) {
    if (spec.appearances.length < spec.kinds.length) {
      throw new Error(
        `identify: the '${spec.category}' appearance pool holds ${spec.appearances.length} ` +
          `entries but must disguise ${spec.kinds.length} kinds`,
      );
    }
    const dealt = shuffled(spec.appearances, `${seed}#appear#${spec.category}`);
    spec.kinds.forEach((kindId, i) => {
      labelFor[kindId] = dealt[i];
      disguiseFor[kindId] = spec.format(dealt[i]);
    });
  }
  return { labelFor, disguiseFor };
}

/**
 * How an item is named to the player: its true name once the party has
 * discovered the kind, otherwise its disguise. Kinds with no disguise (food is
 * never a mystery) always show their true name.
 */
export function identifiedName(
  kindId: string,
  trueName: string,
  identities: RunIdentities,
  discovered: ReadonlySet<string>,
): string {
  if (discovered.has(kindId)) return trueName;
  return identities.disguiseFor[kindId] ?? trueName;
}
