import { describe, it, expect } from 'vitest';
import {
  emptyStatuses,
  afflict,
  accumulate,
  cure,
  decayStatuses,
  hasStatus,
  statusTurns,
  statusMagnitude,
  confusedStep,
  resolveStep,
  speedFor,
  effectiveActionTicks,
  isLevitating,
  entryHazardFor,
  effectiveTorchRadius,
  absorbDamage,
  canAct,
  takesFireDamage,
  resolveFireDamage,
  poison,
  poisonDamage,
  foldLegacyPoison,
  STATUS_KINDS,
  MIN_TORCH_RADIUS,
  POISON_DAMAGE_PER_TURN,
  type StatusSet,
} from './status.ts';
import { makeRng } from './rng.ts';
import { HASTE_TICKS, SLOW_TICKS, TICKS_PER_TURN } from './energy.ts';
import { hazardAt, makeCell, type Level } from './terrain.ts';
import { DIRS8 } from './grid.ts';

/** A 3×3 level of floor with a pit in the middle — enough to ask "is stepping
 *  here a hazard?" through the real terrain query. */
function levelWithPit(): Level {
  const cells = Array.from({ length: 9 }, () => makeCell('floor'));
  cells[4] = makeCell('pit');
  return { cols: 3, rows: 3, cells, entry: { col: 0, row: 0 } };
}

describe('status mechanism', () => {
  it('starts unafflicted', () => {
    const s = emptyStatuses();
    expect(s).toHaveLength(0);
    for (const kind of STATUS_KINDS) expect(hasStatus(s, kind)).toBe(false);
  });

  it('afflicting REFRESHES rather than stacks — the longer duration wins', () => {
    let s = afflict(emptyStatuses(), 'confused', 9);
    s = afflict(s, 'confused', 5);
    expect(statusTurns(s, 'confused')).toBe(9);
    expect(s).toHaveLength(1);

    s = afflict(s, 'confused', 20);
    expect(statusTurns(s, 'confused')).toBe(20);
    expect(s).toHaveLength(1);
  });

  it('keeps the stronger magnitude when refreshed with a weaker dose', () => {
    let s = afflict(emptyStatuses(), 'shielded', 10, 25);
    s = afflict(s, 'shielded', 10, 4);
    expect(statusMagnitude(s, 'shielded')).toBe(25);
  });

  it('accumulate ADDS duration — the deliberate exception for venom', () => {
    let s = accumulate(emptyStatuses(), 'poisoned', 4);
    s = accumulate(s, 'poisoned', 3);
    expect(statusTurns(s, 'poisoned')).toBe(7);
  });

  it('ignores an affliction with no duration', () => {
    expect(afflict(emptyStatuses(), 'hasted', 0)).toHaveLength(0);
    expect(afflict(emptyStatuses(), 'hasted', -5)).toHaveLength(0);
  });

  it('never mutates the set it is given', () => {
    const before = afflict(emptyStatuses(), 'hasted', 3);
    const after = afflict(before, 'slowed', 3);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect(cure(after, 'hasted')).toHaveLength(1);
    expect(after).toHaveLength(2);
  });

  it('tracks independent conditions side by side', () => {
    let s = afflict(emptyStatuses(), 'confused', 3);
    s = afflict(s, 'levitating', 12);
    expect(hasStatus(s, 'confused')).toBe(true);
    expect(hasStatus(s, 'levitating')).toBe(true);
    expect(hasStatus(s, 'hasted')).toBe(false);
  });

  it('counts a turn down and reports the kinds that ran out', () => {
    let s = afflict(emptyStatuses(), 'confused', 2);
    s = afflict(s, 'hasted', 1);

    const first = decayStatuses(s);
    expect(first.expired).toEqual(['hasted']);
    expect(hasStatus(first.statuses, 'confused')).toBe(true);
    expect(statusTurns(first.statuses, 'confused')).toBe(1);

    const second = decayStatuses(first.statuses);
    expect(second.expired).toEqual(['confused']);
    expect(second.statuses).toHaveLength(0);
  });

  it('curing removes a condition and leaves the rest', () => {
    let s = afflict(emptyStatuses(), 'confused', 5);
    s = afflict(s, 'paralyzed', 5);
    s = cure(s, 'confused');
    expect(hasStatus(s, 'confused')).toBe(false);
    expect(hasStatus(s, 'paralyzed')).toBe(true);
  });
});

describe('confusion', () => {
  const legal = (step: { dcol: number; drow: number }) =>
    DIRS8.some((d) => d.col === step.dcol && d.row === step.drow);

  it('leaves an unconfused step exactly where it was aimed', () => {
    const rng = makeRng('unconfused');
    const s = emptyStatuses();
    for (let i = 0; i < 20; i++) {
      expect(resolveStep(s, 1, 0, rng)).toEqual({ dcol: 1, drow: 0 });
    }
  });

  it('does not touch the random stream when the actor is not confused', () => {
    // Two runs off the same seed: one interleaved with unconfused steps, one
    // not. If resolveStep rolled, the streams would diverge.
    const plain = makeRng('stream');
    const interleaved = makeRng('stream');
    const s = emptyStatuses();
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < 10; i++) {
      a.push(plain.next());
      resolveStep(s, 1, 1, interleaved);
      b.push(interleaved.next());
    }
    expect(b).toEqual(a);
  });

  it('a confused actor sometimes strays, but always onto a legal direction', () => {
    const rng = makeRng('confusion-legality');
    const s = afflict(emptyStatuses(), 'confused', 100);
    let strayed = 0;
    for (let i = 0; i < 500; i++) {
      const step = resolveStep(s, 0, -1, rng); // intending north
      expect(legal(step)).toBe(true);
      if (step.dcol !== 0 || step.drow !== -1) strayed++;
    }
    // Deviation happens, and not on literally every step.
    expect(strayed).toBeGreaterThan(0);
    expect(strayed).toBeLessThan(500);
  });

  it('a stray never lands back on the intended direction', () => {
    const rng = makeRng('stray-distinct');
    // Drive confusedStep directly and gather every outcome that differs.
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const step = confusedStep(1, 0, rng);
      seen.add(`${step.dcol},${step.drow}`);
      expect(legal(step)).toBe(true);
    }
    // Over many rolls a confused actor reaches every compass direction.
    expect(seen.size).toBe(DIRS8.length);
  });

  it('never scrambles a wait-in-place into a move', () => {
    const rng = makeRng('wait');
    const s = afflict(emptyStatuses(), 'confused', 50);
    for (let i = 0; i < 50; i++) {
      expect(resolveStep(s, 0, 0, rng)).toEqual({ dcol: 0, drow: 0 });
    }
  });

  it('is deterministic — same seed and same input give the same scramble', () => {
    const s = afflict(emptyStatuses(), 'confused', 100);
    const run = (): string[] => {
      const rng = makeRng('deterministic-confusion');
      return Array.from({ length: 40 }, () => {
        const step = resolveStep(s, 1, 1, rng);
        return `${step.dcol},${step.drow}`;
      });
    };
    expect(run()).toEqual(run());
  });

  it('different seeds scramble differently', () => {
    const s = afflict(emptyStatuses(), 'confused', 100);
    const run = (seed: string): string => {
      const rng = makeRng(seed);
      return Array.from({ length: 40 }, () => {
        const step = resolveStep(s, 1, 1, rng);
        return `${step.dcol},${step.drow}`;
      }).join('|');
    };
    expect(run('seed-a')).not.toEqual(run('seed-b'));
  });

  it('normalizes an over-long intent to a single step', () => {
    const rng = makeRng('normalize');
    expect(resolveStep(emptyStatuses(), 5, -3, rng)).toEqual({ dcol: 1, drow: -1 });
  });
});

describe('haste and slow', () => {
  it('leaves an unafflicted actor at its own base cost', () => {
    const s = emptyStatuses();
    expect(speedFor(s)).toBe('normal');
    expect(effectiveActionTicks(s, TICKS_PER_TURN)).toBe(TICKS_PER_TURN);
    expect(effectiveActionTicks(s, 250)).toBe(250);
  });

  it('haste halves the cost and slow doubles it, per energy.ts', () => {
    const fast = afflict(emptyStatuses(), 'hasted', 10);
    const slow = afflict(emptyStatuses(), 'slowed', 10);
    expect(speedFor(fast)).toBe('hasted');
    expect(speedFor(slow)).toBe('slowed');
    expect(effectiveActionTicks(fast, TICKS_PER_TURN)).toBe(HASTE_TICKS);
    expect(effectiveActionTicks(slow, TICKS_PER_TURN)).toBe(SLOW_TICKS);
  });

  it('scales an actor’s own speed rather than snapping to a global constant', () => {
    // A jackal already acts every 50 ticks; hasting it must make it faster still.
    const fast = afflict(emptyStatuses(), 'hasted', 10);
    expect(effectiveActionTicks(fast, HASTE_TICKS)).toBe(25);
    const slow = afflict(emptyStatuses(), 'slowed', 10);
    expect(effectiveActionTicks(slow, SLOW_TICKS)).toBe(400);
  });

  it('haste and slow cancel to normal speed', () => {
    let s = afflict(emptyStatuses(), 'hasted', 10);
    s = afflict(s, 'slowed', 10);
    expect(speedFor(s)).toBe('normal');
    expect(effectiveActionTicks(s, TICKS_PER_TURN)).toBe(TICKS_PER_TURN);
  });

  it('never produces a zero-tick action the scheduler could not advance past', () => {
    const fast = afflict(emptyStatuses(), 'hasted', 10);
    expect(effectiveActionTicks(fast, 1)).toBeGreaterThanOrEqual(1);
  });

  it('a hasted actor gets two actions in the time a normal one gets one', () => {
    const fast = afflict(emptyStatuses(), 'hasted', 10);
    const normal = emptyStatuses();
    const window = effectiveActionTicks(normal, TICKS_PER_TURN);
    expect(window / effectiveActionTicks(fast, TICKS_PER_TURN)).toBe(2);
  });
});

describe('levitation', () => {
  it('an ordinary actor falls into a pit it steps onto', () => {
    const level = levelWithPit();
    const s = emptyStatuses();
    expect(isLevitating(s)).toBe(false);
    expect(entryHazardFor(s, hazardAt(level, 1, 1))).toBe('pit');
  });

  it('a levitating actor crosses the same pit unharmed', () => {
    const level = levelWithPit();
    const s = afflict(emptyStatuses(), 'levitating', 20);
    expect(isLevitating(s)).toBe(true);
    expect(entryHazardFor(s, hazardAt(level, 1, 1))).toBeNull();
  });

  it('falls again the moment levitation runs out', () => {
    const level = levelWithPit();
    const { statuses, expired } = decayStatuses(afflict(emptyStatuses(), 'levitating', 1));
    expect(expired).toContain('levitating');
    expect(entryHazardFor(statuses, hazardAt(level, 1, 1))).toBe('pit');
  });

  it('leaves a non-hazard cell alone either way', () => {
    const level = levelWithPit();
    expect(entryHazardFor(emptyStatuses(), hazardAt(level, 0, 0))).toBeNull();
  });
});

describe('darkness', () => {
  it('leaves an unafflicted torch at full reach', () => {
    expect(effectiveTorchRadius(emptyStatuses(), 8)).toBe(8);
  });

  it('smothers the light by its magnitude', () => {
    const s = afflict(emptyStatuses(), 'darkened', 10, 5);
    expect(effectiveTorchRadius(s, 8)).toBe(3);
  });

  it('never blinds an actor completely', () => {
    const s = afflict(emptyStatuses(), 'darkened', 10, 99);
    expect(effectiveTorchRadius(s, 8)).toBe(MIN_TORCH_RADIUS);
  });

  it('restores the full radius once the darkness passes', () => {
    const s = afflict(emptyStatuses(), 'darkened', 1, 5);
    expect(effectiveTorchRadius(decayStatuses(s).statuses, 8)).toBe(8);
  });
});

describe('shielding', () => {
  it('passes damage straight through when unshielded', () => {
    const hit = absorbDamage(emptyStatuses(), 7);
    expect(hit.damage).toBe(7);
    expect(hit.absorbed).toBe(0);
  });

  it('absorbs a hit smaller than the shield and keeps the remainder', () => {
    const s = afflict(emptyStatuses(), 'shielded', 20, 10);
    const hit = absorbDamage(s, 4);
    expect(hit.damage).toBe(0);
    expect(hit.absorbed).toBe(4);
    expect(hit.shieldRemaining).toBe(6);
    expect(hasStatus(hit.statuses, 'shielded')).toBe(true);
  });

  it('breaks on a hit larger than it, letting the overflow through', () => {
    const s = afflict(emptyStatuses(), 'shielded', 20, 10);
    const hit = absorbDamage(s, 14);
    expect(hit.absorbed).toBe(10);
    expect(hit.damage).toBe(4);
    expect(hit.shieldRemaining).toBe(0);
    expect(hasStatus(hit.statuses, 'shielded')).toBe(false);
  });

  it('absorbs across successive hits until it is spent', () => {
    let s: StatusSet = afflict(emptyStatuses(), 'shielded', 20, 10);
    let through = 0;
    for (const dmg of [3, 3, 3, 3]) {
      const hit = absorbDamage(s, dmg);
      s = hit.statuses;
      through += hit.damage;
    }
    expect(through).toBe(2); // 10 soaked, the 12th point lands
    expect(hasStatus(s, 'shielded')).toBe(false);
  });

  it('does not consume the shield on a harmless hit', () => {
    const s = afflict(emptyStatuses(), 'shielded', 20, 10);
    const hit = absorbDamage(s, 0);
    expect(hit.shieldRemaining).toBe(10);
    expect(statusMagnitude(hit.statuses, 'shielded')).toBe(10);
  });
});

describe('paralysis', () => {
  it('lets an unafflicted actor act', () => {
    expect(canAct(emptyStatuses())).toBe(true);
  });

  it('blocks a paralyzed actor entirely', () => {
    expect(canAct(afflict(emptyStatuses(), 'paralyzed', 3))).toBe(false);
  });

  it('frees the actor as soon as it wears off', () => {
    let s = afflict(emptyStatuses(), 'paralyzed', 2);
    s = decayStatuses(s).statuses;
    expect(canAct(s)).toBe(false);
    s = decayStatuses(s).statuses;
    expect(canAct(s)).toBe(true);
  });
});

describe('fire immunity', () => {
  it('burns an ordinary actor', () => {
    expect(takesFireDamage(emptyStatuses())).toBe(true);
    expect(resolveFireDamage(emptyStatuses(), 8)).toBe(8);
  });

  it('spares a fire-immune actor entirely', () => {
    const s = afflict(emptyStatuses(), 'fireImmune', 15);
    expect(takesFireDamage(s)).toBe(false);
    expect(resolveFireDamage(s, 8)).toBe(0);
  });
});

describe('poison', () => {
  it('costs HP every turn while it lasts, on ONE clock', () => {
    let s = poison(emptyStatuses(), 3);
    let lost = 0;
    for (let turn = 0; turn < 5; turn++) {
      lost += poisonDamage(s);
      s = decayStatuses(s).statuses;
    }
    expect(lost).toBe(3 * POISON_DAMAGE_PER_TURN);
    expect(hasStatus(s, 'poisoned')).toBe(false);
  });

  it('compounds when a venomous monster bites again', () => {
    let s = poison(emptyStatuses(), 4);
    s = decayStatuses(s).statuses; // 3 left
    s = poison(s, 4); // bitten again
    expect(statusTurns(s, 'poisoned')).toBe(7);
  });

  it('does nothing to an unpoisoned actor', () => {
    expect(poisonDamage(emptyStatuses())).toBe(0);
  });

  it('folds the legacy counter into the status layer', () => {
    const s = foldLegacyPoison(emptyStatuses(), 6);
    expect(statusTurns(s, 'poisoned')).toBe(6);
    expect(poisonDamage(s)).toBe(POISON_DAMAGE_PER_TURN);
  });

  it('folding adds to poison already tracked as a status', () => {
    const s = foldLegacyPoison(poison(emptyStatuses(), 2), 3);
    expect(statusTurns(s, 'poisoned')).toBe(5);
  });

  it('folding an empty legacy counter is a no-op', () => {
    const already = poison(emptyStatuses(), 2);
    expect(foldLegacyPoison(already, 0)).toBe(already);
    expect(foldLegacyPoison(emptyStatuses(), 0)).toHaveLength(0);
  });
});

describe('afflictions compose without interfering', () => {
  it('resolves each condition independently on one actor', () => {
    let s = afflict(emptyStatuses(), 'hasted', 5);
    s = afflict(s, 'levitating', 5);
    s = afflict(s, 'shielded', 5, 6);
    s = afflict(s, 'darkened', 5, 3);
    s = poison(s, 5);

    expect(effectiveActionTicks(s, TICKS_PER_TURN)).toBe(HASTE_TICKS);
    expect(entryHazardFor(s, 'pit')).toBeNull();
    expect(absorbDamage(s, 2).damage).toBe(0);
    expect(effectiveTorchRadius(s, 8)).toBe(5);
    expect(poisonDamage(s)).toBe(POISON_DAMAGE_PER_TURN);
    expect(canAct(s)).toBe(true);
  });

  it('runs every condition down on the same turn clock', () => {
    let s = afflict(emptyStatuses(), 'hasted', 2);
    s = afflict(s, 'confused', 2);
    const after = decayStatuses(decayStatuses(s).statuses);
    expect(after.statuses).toHaveLength(0);
    expect(after.expired.sort()).toEqual(['confused', 'hasted']);
  });
});
