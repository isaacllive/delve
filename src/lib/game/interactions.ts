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
): InteractPrompt | null {
  // Exit portal (bottom floor, on the boss's cell). Sealed until the boss falls.
  if (level.exit && level.exit.col === col && level.exit.row === row) {
    return bossDefeated
      ? { key: INTERACT_KEY, label: 'Escape to the surface' }
      : { key: INTERACT_KEY, label: 'The portal is sealed', blocked: true };
  }

  const cell = cellAt(level, col, row);
  if (!cell) return null;

  if (cell.kind === 'stairsDown' && level.depth + 1 < levelCount) {
    // depth is 0-based; the floor below is displayed 1-based as depth + 2.
    return { key: INTERACT_KEY, label: `Descend to level ${level.depth + 2}` };
  }
  if (cell.kind === 'stairsUp') {
    // Floor 0's up-stair retreats to the safe hub; deeper floors climb one up.
    return level.depth === 0
      ? { key: INTERACT_KEY, label: 'Return to base camp' }
      : { key: INTERACT_KEY, label: `Ascend to level ${level.depth}` };
  }
  return null;
}
