// Client-side "interaction indicator" logic. Given the dungeon level the player
// stands on and their cell, decide whether they're on an interactable tile
// (stairs / exit portal) and what pressing the interact key would do. This
// mirrors the server's handleInteract branches (gameServer.ts) so the on-screen
// prompt matches what the server will actually honour — the server stays
// authoritative; this only drives the HUD cue.
//
// The out-of-dungeon hub (CAMP_DEPTH) is menu-driven (HubScreen.svelte), so its
// interactions are buttons, not tiles — this helper covers dungeon floors only.

import { cellAt } from './terrain.ts';
import type { DungeonLevel } from './dungeon.ts';

export interface InteractPrompt {
  /** The key the player presses to act (shown in the HUD label). */
  key: string;
  /** Human-readable action, e.g. "Descend to level 3". */
  label: string;
  /** True when the action is currently unavailable (e.g. a sealed exit) so the
   *  HUD can render it muted rather than inviting. */
  blocked?: boolean;
}

/** The interact key, kept in one place so the HUD label and the keybinding in
 *  the play route can't drift apart. */
export const INTERACT_KEY = 'E';

/** What, if anything, the interact key does at (col,row) on this dungeon floor.
 *  Returns null when the player is not standing on an interactable tile. */
export function interactablePrompt(
  level: DungeonLevel,
  col: number,
  row: number,
  bossDefeated: boolean,
  levelCount: number,
  hasAmulet = false,
): InteractPrompt | null {
  // Commutation altar (a machine) — swap equipped weapon/armor enchant.
  if (level.altar && level.altar.col === col && level.altar.row === row) {
    return { key: INTERACT_KEY, label: 'Commute: swap weapon & armor enchant' };
  }

  // The Amulet of Yendor (deepest floor, on the boss's dais). Guarded until the
  // Warden falls; nothing to do here once it's been claimed.
  if (level.exit && level.exit.col === col && level.exit.row === row) {
    if (hasAmulet) return null;
    return bossDefeated
      ? { key: INTERACT_KEY, label: 'Claim the Amulet of Yendor' }
      : { key: INTERACT_KEY, label: 'The Warden guards the Amulet', blocked: true };
  }

  const cell = cellAt(level, col, row);
  if (!cell) return null;

  if (cell.kind === 'stairsDown' && level.depth + 1 < levelCount) {
    // depth is 0-based; the floor below is displayed 1-based as depth + 2.
    return { key: INTERACT_KEY, label: `Descend to level ${level.depth + 2}` };
  }
  if (cell.kind === 'stairsUp') {
    // Floor 0's up-stair escapes: victory if you bear the Amulet, else a retreat
    // to the safe hub. Deeper floors climb one up.
    if (level.depth === 0) {
      return hasAmulet
        ? { key: INTERACT_KEY, label: 'Escape to the surface — victory!' }
        : { key: INTERACT_KEY, label: 'Return to base camp' };
    }
    return { key: INTERACT_KEY, label: `Ascend to level ${level.depth}` };
  }
  return null;
}
