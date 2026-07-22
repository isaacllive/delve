import { describe, it, expect } from 'vitest';
import {
  POTION_TYPES,
  potionAppearances,
  potionBelt,
  potionLabel,
  rollPotionType,
} from './potions.ts';
import { makeRng } from './rng.ts';

describe('potionAppearances', () => {
  it('is deterministic for a seed', () => {
    expect(potionAppearances('abc')).toEqual(potionAppearances('abc'));
  });

  it('assigns a distinct appearance to every type', () => {
    const app = potionAppearances('seed-1');
    const labels = POTION_TYPES.map((t) => app[t.id]);
    expect(new Set(labels).size).toBe(POTION_TYPES.length);
  });

  it('varies across seeds (the whole point of the guessing game)', () => {
    // Different seeds should generally produce a different assignment.
    const a = potionAppearances('seed-a');
    const b = potionAppearances('seed-b');
    const same = POTION_TYPES.every((t) => a[t.id] === b[t.id]);
    expect(same).toBe(false);
  });
});

describe('potionLabel', () => {
  it('hides the name until identified, then reveals it', () => {
    const app = potionAppearances('x');
    expect(potionLabel('might', app, false)).toBe(`${app.might} potion`);
    expect(potionLabel('might', app, true)).toBe('Potion of Might');
  });
});

describe('rollPotionType', () => {
  it('only yields real potion types and is deterministic', () => {
    const ids = new Set(POTION_TYPES.map((t) => t.id));
    const a = makeRng('roll');
    const b = makeRng('roll');
    for (let i = 0; i < 50; i++) {
      const x = rollPotionType(a);
      expect(ids.has(x)).toBe(true);
      expect(x).toBe(rollPotionType(b)); // same stream → same rolls
    }
  });
});

describe('potionBelt', () => {
  it('lists only carried types, in canonical order, with labels + counts', () => {
    const app = potionAppearances('belt');
    const belt = potionBelt({ harm: 2, healing: 1, life: 0 }, app, ['healing']);
    // healing precedes harm in POTION_TYPES order; life (count 0) is omitted.
    expect(belt.map((s) => s.id)).toEqual(['healing', 'harm']);
    expect(belt[0]).toMatchObject({ id: 'healing', count: 1, identified: true, label: 'Potion of Healing' });
    expect(belt[1]).toMatchObject({ id: 'harm', count: 2, identified: false, good: false });
    expect(belt[1].label).toBe(`${app.harm} potion`);
  });

  it('accepts a Set or an array for the identified set', () => {
    const app = potionAppearances('belt');
    const fromArr = potionBelt({ might: 1 }, app, ['might']);
    const fromSet = potionBelt({ might: 1 }, app, new Set(['might']));
    expect(fromArr).toEqual(fromSet);
    expect(fromArr[0].identified).toBe(true);
  });
});
