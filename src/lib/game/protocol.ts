// Wire protocol shared by the client (src/lib/net.ts) and the authoritative
// server (src/lib/server/gameServer.ts). Both sides regenerate the dungeon
// geometry deterministically from the run seed (see dungeon.ts), so the wire
// only carries the seed + live player state — never the (large) static map.
//
// The server is authoritative for movement validation, level transitions, and
// hazard (pit fall) resolution. Fog of war / vision is computed client-side
// for rendering; this is a co-op PvE game, so hidden-geometry leakage isn't a
// threat model here (see plan's deferred hardening note).

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
  /** Current / max hit points (0 = dead; permadeath). */
  hp: number;
  hpMax: number;
  /** Gold carried this expedition (lost on death). */
  gold: number;
  /** Healing potions carried. */
  potions: number;
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

/** A loot pickup on the floor, broadcast for the viewer's floor. */
export interface LootState {
  id: string;
  kind: 'gold' | 'potion';
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

/** Rotate a facing by `winds` eighth-turns (45° each), snapping to the 8-wind
 *  grid and normalising to [0, 2π). +1 = one wind clockwise, −1 = anticlockwise. */
export function turnFacing(facing: number, winds: number): number {
  const idx = (Math.round(facing / (Math.PI / 4)) + winds) & 7; // & 7 wraps both signs
  return idx * (Math.PI / 4);
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
  | { t: 'move'; dcol: number; drow: number; face?: boolean } // face:false steps without re-facing (walk backward)
  | { t: 'turn'; dir: -1 | 1 } // rotate facing one wind (45°): −1 = left/CCW, +1 = right/CW
  | { t: 'interact' } // use stairs / portal / shop under-or-adjacent
  | { t: 'use' } // quaff a healing potion
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
      tick: number;
      bossDefeated: boolean;
    }
  | { t: 'chat'; from: string; name: string; text: string; at: number }
  | { t: 'log'; text: string } // system/flavor line ("You fall into the dark…")
  | { t: 'victory'; by: string } // the boss is down and someone reached the exit
  | { t: 'error'; message: string }
  | { t: 'pong' };

export const MAX_NAME_LEN = 24;
export const MAX_CHAT_LEN = 300;
