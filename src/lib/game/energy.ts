// Turn / energy scheduler — the heartbeat of a TURN-BASED roguelike, replacing
// Delve's old real-time wall-clock tick. Time is measured in TICKS, exactly as
// in Brogue: a normal action costs 100 ticks; a hasted actor acts twice as often
// (50), a slowed actor half as often (200). Because move and attack durations
// are tracked PER ACTOR, fast monsters (jackals) get extra turns and slow hits
// (ogres) cost extra time — the decoupled timing that makes hit-and-run,
// kiting, and speed items matter.
//
// This module is pure and deterministic: it decides *who acts next*, never *what*
// they do. The authoritative server owns the actor list and performs the action;
// it calls `nextToAct` to advance the shared clock, runs the chosen actor, then
// resets that actor's `ticksUntilTurn` to its action's cost.
//
// Model: every actor carries `ticksUntilTurn` (how many ticks until it may act).
// The scheduler finds the smallest such value, that much time "elapses" for
// everyone, and the actor(s) that reach 0 act. The player is placed first so it
// wins ties — a fairness convention matching classic roguelikes.

/** A normal action's duration in ticks (one full turn). */
export const TICKS_PER_TURN = 100;
/** A hasted actor's action duration (acts twice as often). */
export const HASTE_TICKS = 50;
/** A slowed actor's action duration (acts half as often). */
export const SLOW_TICKS = 200;

/** Speed states an actor can be in, mapping to an action duration. */
export type Speed = 'normal' | 'hasted' | 'slowed';

/** Action duration in ticks for a speed state. */
export function speedTicks(speed: Speed): number {
  switch (speed) {
    case 'hasted':
      return HASTE_TICKS;
    case 'slowed':
      return SLOW_TICKS;
    default:
      return TICKS_PER_TURN;
  }
}

/** Anything the scheduler orders: it only needs to know when the actor is due. */
export interface Scheduled {
  /** Ticks remaining until this actor may act (0 = ready now). */
  ticksUntilTurn: number;
}

/**
 * Advance the shared clock to the next actor ready to act. Returns the elapsed
 * ticks (the minimum `ticksUntilTurn` across all actors) and the index of the
 * actor whose turn it is — the lowest `ticksUntilTurn`, ties broken by lowest
 * index (so a player at index 0 acts before simultaneously-ready monsters).
 *
 * This MUTATES: every actor has `elapsed` subtracted, leaving the chosen actor
 * at 0. The caller performs that actor's action, then sets its `ticksUntilTurn`
 * to the action's cost (see `speedTicks`). Returns `actor = -1` for an empty
 * list (nothing to schedule).
 */
export function nextToAct(actors: readonly Scheduled[]): { actor: number; elapsed: number } {
  if (actors.length === 0) return { actor: -1, elapsed: 0 };
  let min = Infinity;
  let actor = -1;
  for (let i = 0; i < actors.length; i++) {
    if (actors[i].ticksUntilTurn < min) {
      min = actors[i].ticksUntilTurn;
      actor = i;
    }
  }
  const elapsed = Math.max(0, min);
  if (elapsed > 0) {
    for (const a of actors) a.ticksUntilTurn -= elapsed;
  }
  return { actor, elapsed };
}

/**
 * Convenience for the server loop: repeatedly advance the clock and run every
 * NON-player actor that comes due, stopping as soon as the player (index
 * `playerIndex`) is the next to act. `act(index)` performs the actor's turn and
 * must return the action's cost in ticks, which becomes that actor's next
 * `ticksUntilTurn`. Guarded by `maxSteps` so a misbehaving `act` can't spin
 * forever. Returns the number of actor turns run.
 *
 * Kept pure of game rules — all behavior lives in the `act` callback the server
 * supplies — so it stays unit-testable with a stub.
 */
export function runUntilPlayer(
  actors: Scheduled[],
  playerIndex: number,
  act: (index: number) => number,
  maxSteps = 10_000,
): number {
  let steps = 0;
  while (steps < maxSteps) {
    const { actor } = nextToAct(actors);
    if (actor < 0 || actor === playerIndex) return steps;
    const cost = act(actor);
    actors[actor].ticksUntilTurn = Math.max(1, Math.floor(cost));
    steps++;
  }
  return steps;
}
