// Wire protocol shared by the client (src/lib/net.ts) and the authoritative
// server (src/lib/server/gameServer.ts). Both sides regenerate the dungeon
// geometry deterministically from the run seed (see dungeon.ts), so the wire
// only carries the seed + live player state — never the (large) static map.
//
// The server is authoritative for movement validation, level transitions, and
// hazard (pit fall) resolution. Fog of war / vision is computed client-side
// for rendering; this is a co-op PvE game, so hidden-geometry leakage isn't a
// threat model here (see plan's deferred hardening note).

import type { ItemKindId, ItemCategory } from './items.ts';
import type { GearInstance, GearCategory } from './gear.ts';
import type { GasKind } from './hazards.ts';
import type { StatusEffect } from './status.ts';

// The status vocabulary is owned by `status.ts` (which also holds the rules for
// what each condition does) and imported here for the wire, the same way this
// contract imports GasKind / ItemKindId / GearInstance from their domains.
// Re-exported so client code can name the types without reaching past protocol.
export type { StatusKind, StatusEffect } from './status.ts';

/** One stack of carried items (a kind + how many). The client renders each by
 *  its per-run appearance (derived from the seed) unless the kind is in the
 *  run's `discovered` set, in which case it shows the true name. */
export interface InvStack {
  kindId: ItemKindId;
  count: number;
}

/** A targeted cell for a thrown item or a zapped bolt. The server validates and
 *  clamps it (range, line of sight); the client never resolves the effect. */
export interface AimPoint {
  col: number;
  row: number;
}

/** A player's live state, as broadcast to everyone in the run. */
export interface PlayerState {
  id: string;
  name: string;
  color: string;
  /** Chosen character class id (see classes.ts). */
  classId: string;
  /** Level index (dungeon depth). */
  level: number;
  col: number;
  row: number;
  /** Height above the level floor, in cells (raised when standing on a ledge). */
  elevation: number;
  /** Torch light/vision radius this player carries (from the class). */
  torchRadius: number;
  /** Current / max hit points (0 = dead; permadeath). Max HP grows ONLY by
   *  drinking a Potion of Life — never by experience (see character.ts). */
  hp: number;
  hpMax: number;
  /** Strength: gates weapon/armor requirements and scales combat via netEnchant
   *  (combat.ts). Starts at 12 and grows ONLY by drinking a Potion of Strength. */
  strength: number;
  /** Remaining poison — 1 HP lost per turn until it decays to 0 (0 = unpoisoned).
   *  Predates `statuses` and stays the authoritative source for poison; G2 folds
   *  it into the status layer rather than running two poison clocks at once. */
  poison: number;
  /** Timed afflictions and boons currently on this delver. */
  statuses: StatusEffect[];
  /** Stomach fullness (nutrition). Drains ~1/turn; 0 = starving (see character.ts). */
  nutrition: number;
  /** Gold carried this expedition (lost on death). */
  gold: number;
  /** Items carried this expedition (lost on death). Rendered by appearance
   *  until the kind is identified. */
  inventory: InvStack[];
  /** Gear (weapons/armor) carried this expedition. Base type is known; enchant
   *  is hidden until identified. Lost on death. */
  gear: GearInstance[];
  /** instId of the equipped weapon / armor (from `gear`), or null. */
  equippedWeapon: string | null;
  equippedArmor: string | null;
  /** Facing as a compass heading in radians: 0 = North (−row), increasing
   *  clockwise (PI/2 = East). Updated from the last move direction. */
  facing: number;
  alive: boolean;
}

/** A monster's awareness of the delvers (Brogue-style stealth states):
 *  `sleeping` (unaware, stationary — sneak-attackable), `wandering`
 *  (disturbed, investigating — still sneak-attackable), `hunting` (alert,
 *  chasing). The client tints/indicates each state (💤 / ❓ / ‼️). */
export type MonsterAwareness = 'sleeping' | 'wandering' | 'hunting';

/** A monster's live state, broadcast for the floor the viewer is on. */
export interface MonsterState {
  id: string;
  name: string;
  color: number;
  level: number;
  col: number;
  row: number;
  hp: number;
  hpMax: number;
  boss: boolean;
  /** Awareness state, for the client's stealth indicator. */
  state: MonsterAwareness;
  /** Notable ability flags, for the client's monster tint/glyph. */
  abilities?: string[];
  /** Timed afflictions on this monster (omitted when it has none, to keep the
   *  per-floor monster broadcast small). */
  statuses?: StatusEffect[];
  /** True when this monster is currently concealed (aquatic ambusher lurking in
   *  deep water) — the client skips rendering it until it surfaces to strike. */
  hidden?: boolean;
}

/** A trap revealed to the client (sprung, or spotted by standing next to it).
 *  Hidden traps are never sent — the server keeps them secret until triggered
 *  or noticed, so the client can't wall-hack their locations. */
export interface TrapState {
  id: string;
  kind: 'pit' | 'dart';
  col: number;
  row: number;
  level: number;
  /** True once triggered (spent); false = spotted but still armed. */
  sprung: boolean;
}

/** A live hazard cell (fire and/or gas) on the viewer's floor. Only non-empty
 *  cells are sent; the client renders these as dynamic overlays. */
export interface HazardCell {
  col: number;
  row: number;
  /** Fire intensity in (0, 1], or 0. */
  fire: number;
  /** Dominant gas kind at this cell, if any. */
  gasKind?: GasKind;
  /** Gas concentration (> 0) when gasKind is present. */
  gas?: number;
}

/** A loot pickup on the floor, broadcast for the viewer's floor. The item's true
 *  KIND is not sent — only its category — so a dropped item stays a mystery until
 *  it's in your pack (and even then, disguised until identified). */
export interface LootState {
  id: string;
  kind: 'gold' | 'item' | 'gear';
  /** Item category (present when kind === 'item'), for the on-floor icon. */
  category?: ItemCategory;
  /** Gear category (present when kind === 'gear'), for the on-floor icon. */
  gearCategory?: GearCategory;
  col: number;
  row: number;
  level: number;
}

/** 8-wind compass label for a heading in radians (0 = N, clockwise). */
export function compassLabel(facing: number): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const idx = Math.round(facing / (Math.PI / 4)) & 7;
  return dirs[idx];
}

/** Compass heading in radians (0 = N, clockwise) for a grid move delta. */
export function headingOf(dcol: number, drow: number): number {
  // North is −row; clockwise means East (+col) is +PI/2.
  const a = Math.atan2(dcol, -drow);
  return a < 0 ? a + Math.PI * 2 : a;
}

/** Messages the client sends to the server. */
export type ClientMsg =
  | { t: 'join'; code: string; name: string; seed?: string; classId?: string }
  | { t: 'move'; dcol: number; drow: number }
  | { t: 'interact' } // use stairs / portal / shop under-or-adjacent
  | { t: 'use-item'; kindId: ItemKindId } // quaff/read a carried item by kind
  | { t: 'equip'; instId: string } // equip/unequip a carried gear instance
  // Hurl a potion. `aim` targets a cell (the client's targeting cursor, gap
  // G16); without it the throw flies in the facing direction, which is what the
  // current HUD sends. The server validates range and line of sight either way.
  | { t: 'throw'; kindId: ItemKindId; aim?: AimPoint }
  | { t: 'wait' } // pass a turn in place (rest)
  | { t: 'descend' } // leave the out-of-dungeon hub → enter floor 0
  | { t: 'buy'; item: 'potion' } // buy from a hub shop (menu-driven, no walking)
  | { t: 'chat'; text: string }
  | { t: 'ping' };

/** Messages the server sends to the client. */
export type ServerMsg =
  | { t: 'welcome'; playerId: string; seed: string; levelCount: number }
  | {
      t: 'state';
      you: string;
      players: PlayerState[];
      monsters: MonsterState[];
      loot: LootState[];
      traps: TrapState[];
      /** Live fire/gas cells on the viewer's floor (dynamic terrain). */
      hazards: HazardCell[];
      /** Item kinds the party has identified this run (shared knowledge). */
      discovered: ItemKindId[];
      tick: number;
      bossDefeated: boolean;
      /** True once the Amulet of Yendor has been claimed — now escape upward. */
      hasAmulet: boolean;
      /** Depths whose guardian-vault gate has been opened (lever pulled). */
      openVaults: number[];
      /** Live guardian-statue positions on the viewer's floor. */
      guardians: { col: number; row: number }[];
    }
  | { t: 'chat'; from: string; name: string; text: string; at: number }
  | { t: 'log'; text: string } // system/flavor line ("You fall into the dark…")
  | { t: 'victory'; by: string } // the boss is down and someone reached the exit
  | { t: 'error'; message: string }
  | { t: 'pong' };

export const MAX_NAME_LEN = 24;
export const MAX_CHAT_LEN = 300;
