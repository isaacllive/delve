import { describe, it, expect } from 'vitest';
import {
  speedTicks,
  nextToAct,
  runUntilPlayer,
  TICKS_PER_TURN,
  HASTE_TICKS,
  SLOW_TICKS,
  type Scheduled,
} from './energy.ts';

describe('speedTicks', () => {
  it('maps speed states to Brogue tick costs', () => {
    expect(speedTicks('normal')).toBe(TICKS_PER_TURN);
    expect(speedTicks('hasted')).toBe(HASTE_TICKS);
    expect(speedTicks('slowed')).toBe(SLOW_TICKS);
    expect(TICKS_PER_TURN).toBe(100);
    expect(HASTE_TICKS).toBe(50);
    expect(SLOW_TICKS).toBe(200);
  });
});

describe('nextToAct', () => {
  it('returns actor -1 for an empty list', () => {
    expect(nextToAct([])).toEqual({ actor: -1, elapsed: 0 });
  });

  it('picks the actor with the lowest ticksUntilTurn and elapses that time', () => {
    const actors: Scheduled[] = [{ ticksUntilTurn: 100 }, { ticksUntilTurn: 30 }, { ticksUntilTurn: 70 }];
    const { actor, elapsed } = nextToAct(actors);
    expect(actor).toBe(1);
    expect(elapsed).toBe(30);
    // Everyone advanced by the elapsed time; the chosen actor is now at 0.
    expect(actors.map((a) => a.ticksUntilTurn)).toEqual([70, 0, 40]);
  });

  it('breaks ties by lowest index (player-first fairness)', () => {
    const actors: Scheduled[] = [{ ticksUntilTurn: 0 }, { ticksUntilTurn: 0 }];
    expect(nextToAct(actors).actor).toBe(0);
  });

  it('does not go negative when an actor is already overdue', () => {
    const actors: Scheduled[] = [{ ticksUntilTurn: -5 }, { ticksUntilTurn: 10 }];
    const { actor, elapsed } = nextToAct(actors);
    expect(actor).toBe(0);
    expect(elapsed).toBe(0); // never elapse negative time
    expect(actors[1].ticksUntilTurn).toBe(10);
  });
});

describe('runUntilPlayer', () => {
  it('runs monster turns until the player (index 0) is next', () => {
    // Player ready now; two monsters queued behind. The player should be the
    // very next to act, so no monster runs.
    const actors: Scheduled[] = [{ ticksUntilTurn: 0 }, { ticksUntilTurn: 100 }, { ticksUntilTurn: 100 }];
    const ran: number[] = [];
    const steps = runUntilPlayer(actors, 0, (i) => {
      ran.push(i);
      return 100;
    });
    expect(steps).toBe(0);
    expect(ran).toEqual([]);
  });

  it('lets a fast (hasted) monster act twice before a normal player turn', () => {
    // Player at 100 ticks; a hasted monster at 0 acting every 50 ticks gets two
    // turns (0 and 50) before the player's 100 comes due.
    const actors: Scheduled[] = [{ ticksUntilTurn: 100 }, { ticksUntilTurn: 0 }];
    const ran: number[] = [];
    runUntilPlayer(actors, 0, (i) => {
      ran.push(i);
      return HASTE_TICKS;
    });
    expect(ran).toEqual([1, 1]);
    expect(actors[0].ticksUntilTurn).toBe(0); // player's turn has arrived
  });

  it('a slow monster acts less often than the player', () => {
    // Both start ready; the monster acts at slow speed (200), the player at 100.
    // Simulate the player also taking turns via a driver loop.
    const actors: Scheduled[] = [{ ticksUntilTurn: 0 }, { ticksUntilTurn: 0 }];
    const monsterTurns: number[] = [];
    const runMonsters = () =>
      runUntilPlayer(actors, 0, (i) => {
        monsterTurns.push(i);
        return SLOW_TICKS;
      });
    // Player takes 4 turns of 100 ticks each.
    for (let t = 0; t < 4; t++) {
      runMonsters();
      actors[0].ticksUntilTurn = TICKS_PER_TURN; // player acted
    }
    // Over 400 player ticks a 200-tick monster should act ~2 times, well fewer
    // than the player's 4 turns.
    expect(monsterTurns.length).toBeLessThanOrEqual(2);
    expect(monsterTurns.length).toBeGreaterThanOrEqual(1);
  });

  it('respects the maxSteps guard against runaway callbacks', () => {
    const actors: Scheduled[] = [{ ticksUntilTurn: 100 }, { ticksUntilTurn: 0 }];
    // A monster that always returns 0 cost would spin forever; the guard stops it.
    const steps = runUntilPlayer(actors, 0, () => 0, 25);
    expect(steps).toBe(25);
  });
});
