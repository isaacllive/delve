import { describe, it, expect } from 'vitest';
import { makeDisguises, identifiedName, type DisguiseSpec } from './identify.ts';

const POTIONS: DisguiseSpec = {
  category: 'potion',
  kinds: ['life', 'strength', 'descent'],
  appearances: ['crimson', 'azure', 'cloudy', 'fizzy', 'teal'],
  format: (label) => `${label} potion`,
};

const RINGS: DisguiseSpec = {
  category: 'ring',
  kinds: ['clairvoyance', 'stealth'],
  appearances: ['jade', 'obsidian', 'bone'],
  format: (label) => `${label} ring`,
};

describe('makeDisguises', () => {
  it('is deterministic for a seed', () => {
    expect(makeDisguises('ash-bone-123', [POTIONS])).toEqual(makeDisguises('ash-bone-123', [POTIONS]));
  });

  it('deals different disguises for different seeds', () => {
    const a = makeDisguises('seed-A', [POTIONS]);
    const b = makeDisguises('seed-B', [POTIONS]);
    expect(a.labelFor).not.toEqual(b.labelFor);
  });

  it('gives every kind a distinct appearance', () => {
    const { labelFor } = makeDisguises('distinct', [POTIONS]);
    const labels = POTIONS.kinds.map((k) => labelFor[k]);
    expect(new Set(labels).size).toBe(POTIONS.kinds.length);
    for (const label of labels) expect(POTIONS.appearances).toContain(label);
  });

  it('formats the disguised name per category', () => {
    const { labelFor, disguiseFor } = makeDisguises('fmt', [POTIONS, RINGS]);
    expect(disguiseFor.life).toBe(`${labelFor.life} potion`);
    expect(disguiseFor.stealth).toBe(`${labelFor.stealth} ring`);
  });

  // The reason categories live in separate modules: adding one must not disturb
  // the appearances an existing seed already dealt to the others.
  it('deals each category independently of the others present', () => {
    const alone = makeDisguises('run-seed', [POTIONS]);
    const together = makeDisguises('run-seed', [POTIONS, RINGS]);
    for (const kind of POTIONS.kinds) {
      expect(together.labelFor[kind]).toBe(alone.labelFor[kind]);
    }
  });

  it('refuses to deal when a pool cannot disguise every kind', () => {
    const outgrown: DisguiseSpec = { ...POTIONS, kinds: ['a', 'b', 'c', 'd', 'e', 'f'] };
    expect(() => makeDisguises('seed', [outgrown])).toThrow(/pool/);
  });
});

describe('identifiedName', () => {
  const identities = makeDisguises('name-seed', [POTIONS]);

  it('shows the disguise until the kind is discovered', () => {
    expect(identifiedName('life', 'potion of life', identities, new Set())).toBe(
      `${identities.labelFor.life} potion`,
    );
  });

  it('shows the true name once discovered', () => {
    expect(identifiedName('life', 'potion of life', identities, new Set(['life']))).toBe('potion of life');
  });

  it('discovering one kind does not reveal another', () => {
    expect(identifiedName('descent', 'potion of descent', identities, new Set(['life']))).toBe(
      `${identities.labelFor.descent} potion`,
    );
  });

  it('shows the true name for kinds that were never disguised', () => {
    // Food is never a mystery — it has no appearance dealt at all.
    expect(identifiedName('ration', 'ration of food', identities, new Set())).toBe('ration of food');
  });
});
