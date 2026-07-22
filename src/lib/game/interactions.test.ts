import { describe, it, expect } from 'vitest';
import { generateDungeon, getLevel } from './dungeon.ts';
import { interactablePrompt } from './interactions.ts';

const SEED = 'interact-test';

describe('interactablePrompt', () => {
  it('prompts to descend when standing on the down-stair', () => {
    const d = generateDungeon(SEED);
    const l0 = getLevel(d, 0);
    expect(l0.stairsDown).toBeDefined();
    const s = l0.stairsDown!;
    const p = interactablePrompt(l0, s.col, s.row, false, d.levelCount);
    expect(p).toEqual({ key: 'E', label: 'Descend to level 2' });
  });

  it('prompts to return to the hub on floor 0 up-stair', () => {
    const d = generateDungeon(SEED);
    const l0 = getLevel(d, 0);
    const s = l0.stairsUp!;
    const p = interactablePrompt(l0, s.col, s.row, false, d.levelCount);
    expect(p?.label).toBe('Return to base camp');
    expect(p?.blocked).toBeFalsy();
  });

  it('prompts to ascend one level from a deeper floor up-stair', () => {
    const d = generateDungeon(SEED);
    const l2 = getLevel(d, 2);
    const s = l2.stairsUp!;
    const p = interactablePrompt(l2, s.col, s.row, false, d.levelCount);
    // depth 2 (displayed level 3) climbs to displayed level 2.
    expect(p?.label).toBe('Ascend to level 2');
  });

  it('guards the Amulet until the boss falls, then lets you claim it', () => {
    const d = generateDungeon(SEED);
    const last = getLevel(d, d.levelCount - 1);
    expect(last.exit).toBeDefined();
    const e = last.exit!;
    expect(interactablePrompt(last, e.col, e.row, false, d.levelCount)).toEqual({
      key: 'E',
      label: 'The Warden guards the Amulet',
      blocked: true,
    });
    expect(interactablePrompt(last, e.col, e.row, true, d.levelCount)?.label).toBe(
      'Claim the Amulet of Yendor',
    );
    // Once claimed, the dais has nothing left to offer.
    expect(interactablePrompt(last, e.col, e.row, true, d.levelCount, true)).toBeNull();
  });

  it('turns floor 0 up-stair into the victory escape once the Amulet is borne', () => {
    const d = generateDungeon(SEED);
    const l0 = getLevel(d, 0);
    const s = l0.stairsUp!;
    expect(interactablePrompt(l0, s.col, s.row, false, d.levelCount, false)?.label).toBe(
      'Return to base camp',
    );
    expect(interactablePrompt(l0, s.col, s.row, false, d.levelCount, true)?.label).toBe(
      'Escape to the surface — victory!',
    );
  });

  it('returns null on a plain floor tile', () => {
    const d = generateDungeon(SEED);
    const l0 = getLevel(d, 0);
    const stairs = new Set([
      l0.stairsUp && `${l0.stairsUp.col},${l0.stairsUp.row}`,
      l0.stairsDown && `${l0.stairsDown.col},${l0.stairsDown.row}`,
    ]);
    // Find any ordinary floor cell that isn't a stair.
    let found: { col: number; row: number } | null = null;
    for (let row = 0; row < l0.rows && !found; row++) {
      for (let col = 0; col < l0.cols; col++) {
        const cell = l0.cells[row * l0.cols + col];
        if (cell?.kind === 'floor' && !stairs.has(`${col},${row}`)) {
          found = { col, row };
          break;
        }
      }
    }
    expect(found).not.toBeNull();
    expect(interactablePrompt(l0, found!.col, found!.row, false, d.levelCount)).toBeNull();
  });
});
