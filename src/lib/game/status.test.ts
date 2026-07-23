import { describe, it, expect } from 'vitest';
import {
  addStatus,
  clearStatus,
  decayStatuses,
  getStatus,
  hasStatus,
  type StatusHolder,
} from './status.ts';

/** A fresh unafflicted actor (a monster shape — no status list until afflicted). */
function actor(): StatusHolder {
  return {};
}

describe('afflicting an actor', () => {
  it('starts with nothing active', () => {
    const a = actor();
    expect(hasStatus(a, 'confused')).toBe(false);
    expect(getStatus(a, 'confused')).toBeUndefined();
  });

  it('applies a status for a number of turns', () => {
    const a = actor();
    addStatus(a, 'confused', 5);
    expect(hasStatus(a, 'confused')).toBe(true);
    expect(getStatus(a, 'confused')?.turns).toBe(5);
  });

  it('carries an optional magnitude', () => {
    const a = actor();
    addStatus(a, 'shielded', 10, 20);
    expect(getStatus(a, 'shielded')?.magnitude).toBe(20);
  });

  it('ignores a zero or negative duration', () => {
    const a = actor();
    addStatus(a, 'paralyzed', 0);
    addStatus(a, 'paralyzed', -3);
    expect(hasStatus(a, 'paralyzed')).toBe(false);
  });

  it('holds several different statuses at once', () => {
    const a = actor();
    addStatus(a, 'confused', 3);
    addStatus(a, 'hasted', 8);
    expect(hasStatus(a, 'confused')).toBe(true);
    expect(hasStatus(a, 'hasted')).toBe(true);
    expect(a.statuses).toHaveLength(2);
  });
});

describe('re-applying a status refreshes rather than stacks', () => {
  // Stacking copies is how three overlapping gas clouds become permanent
  // paralysis. A status stays bounded by its strongest single source.
  it('keeps one entry per kind', () => {
    const a = actor();
    addStatus(a, 'confused', 4);
    addStatus(a, 'confused', 4);
    addStatus(a, 'confused', 4);
    expect(a.statuses).toHaveLength(1);
  });

  it('extends to the longer remaining duration', () => {
    const a = actor();
    addStatus(a, 'confused', 3);
    addStatus(a, 'confused', 9);
    expect(getStatus(a, 'confused')?.turns).toBe(9);
  });

  it('never shortens an affliction already running longer', () => {
    const a = actor();
    addStatus(a, 'confused', 9);
    addStatus(a, 'confused', 2);
    expect(getStatus(a, 'confused')?.turns).toBe(9);
  });

  it('keeps the stronger magnitude', () => {
    const a = actor();
    addStatus(a, 'shielded', 5, 30);
    addStatus(a, 'shielded', 5, 12);
    expect(getStatus(a, 'shielded')?.magnitude).toBe(30);
  });
});

describe('statuses lapse on the turn clock', () => {
  it('ticks down one turn at a time', () => {
    const a = actor();
    addStatus(a, 'hasted', 3);
    decayStatuses(a);
    expect(getStatus(a, 'hasted')?.turns).toBe(2);
    decayStatuses(a);
    expect(getStatus(a, 'hasted')?.turns).toBe(1);
  });

  it('drops the status on the turn it runs out', () => {
    const a = actor();
    addStatus(a, 'hasted', 2);
    decayStatuses(a);
    decayStatuses(a);
    expect(hasStatus(a, 'hasted')).toBe(false);
    expect(a.statuses).toHaveLength(0);
  });

  it('expires each status on its own schedule', () => {
    const a = actor();
    addStatus(a, 'confused', 1);
    addStatus(a, 'levitating', 4);
    decayStatuses(a);
    expect(hasStatus(a, 'confused')).toBe(false);
    expect(hasStatus(a, 'levitating')).toBe(true);
  });

  it('is a no-op on an actor with nothing active', () => {
    const a = actor();
    expect(() => decayStatuses(a)).not.toThrow();
    decayStatuses(a);
    expect(hasStatus(a, 'confused')).toBe(false);
  });

  it('lets a refresh outlast the original expiry', () => {
    // Walking back into the gas cloud must not let the first dose's clock end it.
    const a = actor();
    addStatus(a, 'confused', 2);
    decayStatuses(a);
    addStatus(a, 'confused', 5);
    decayStatuses(a);
    expect(getStatus(a, 'confused')?.turns).toBe(4);
  });
});

describe('ending a status early', () => {
  it('clears one kind and leaves the others running', () => {
    const a = actor();
    addStatus(a, 'confused', 6);
    addStatus(a, 'levitating', 6);
    clearStatus(a, 'confused');
    expect(hasStatus(a, 'confused')).toBe(false);
    expect(hasStatus(a, 'levitating')).toBe(true);
  });

  it('is a no-op when the status was never applied', () => {
    const a = actor();
    expect(() => clearStatus(a, 'negated')).not.toThrow();
  });
});
