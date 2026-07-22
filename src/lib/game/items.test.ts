import { describe, it, expect } from 'vitest';
import {
  ITEM_KINDS,
  ITEM_KIND_BY_ID,
  kindsOfCategory,
  makeIdentities,
  displayName,
  type ItemKindId,
} from './items.ts';

describe('catalog', () => {
  it('every kind is self-consistent and indexable by id', () => {
    for (const k of ITEM_KINDS) {
      expect(ITEM_KIND_BY_ID[k.id]).toBe(k);
      expect(k.name.length).toBeGreaterThan(0);
      expect(['potion', 'scroll']).toContain(k.category);
      expect(['good', 'bad']).toContain(k.polarity);
    }
  });
  it('splits into potions and scrolls', () => {
    expect(kindsOfCategory('potion')).toEqual(['life', 'strength', 'descent']);
    expect(kindsOfCategory('scroll')).toEqual([
      'identify',
      'teleportation',
      'aggravateMonsters',
      'enchanting',
    ]);
  });
});

describe('makeIdentities', () => {
  it('is deterministic for a seed (client and server agree)', () => {
    expect(makeIdentities('ash-bone-123')).toEqual(makeIdentities('ash-bone-123'));
  });
  it('differs across seeds (disguises are reshuffled each run)', () => {
    const a = makeIdentities('seed-A');
    const b = makeIdentities('seed-B');
    // Not guaranteed different for EVERY kind, but the whole table should differ.
    expect(a).not.toEqual(b);
  });
  it('assigns a distinct appearance to every kind within a category', () => {
    const { labelFor } = makeIdentities('distinct');
    const potionLabels = kindsOfCategory('potion').map((id) => labelFor[id]);
    const scrollLabels = kindsOfCategory('scroll').map((id) => labelFor[id]);
    expect(new Set(potionLabels).size).toBe(potionLabels.length);
    expect(new Set(scrollLabels).size).toBe(scrollLabels.length);
  });
  it('gives potions colour labels and scrolls title labels', () => {
    const { labelFor } = makeIdentities('labels');
    // A potion appearance renders as "<colour> potion"; a scroll as a title.
    expect(labelFor.life).not.toMatch(/[A-Z]{3,}/); // colours are lowercase words
    expect(labelFor.identify).toMatch(/^[A-Z]+$/); // scroll titles are uppercase gibberish
  });
});

describe('displayName', () => {
  const identities = makeIdentities('name-seed');

  it('shows the disguise while undiscovered', () => {
    const none = new Set<ItemKindId>();
    expect(displayName('life', identities, none)).toBe(`${identities.labelFor.life} potion`);
    expect(displayName('identify', identities, none)).toBe(`scroll titled "${identities.labelFor.identify}"`);
  });

  it('shows the true name once discovered', () => {
    const known = new Set<ItemKindId>(['life']);
    expect(displayName('life', identities, known)).toBe('potion of life');
    // Other kinds stay disguised.
    expect(displayName('descent', identities, known)).toBe(`${identities.labelFor.descent} potion`);
  });
});
