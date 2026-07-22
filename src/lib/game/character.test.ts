import { describe, it, expect } from 'vitest';
import {
  startingVitals,
  potionOfStrength,
  potionOfLife,
  healBy,
  hungerLevel,
  eatFood,
  STARTING_STRENGTH,
  STARTING_MAX_HP,
  POTION_OF_LIFE_HP_BONUS,
  STOMACH_SIZE,
  HUNGER_THRESHOLD,
  WEAK_THRESHOLD,
  FAINT_THRESHOLD,
} from './character.ts';

describe('startingVitals (Brogue baseline)', () => {
  it('is Strength 12 and 30/30 HP', () => {
    expect(startingVitals()).toEqual({ hp: 30, hpMax: 30, strength: 12 });
    expect(STARTING_STRENGTH).toBe(12);
    expect(STARTING_MAX_HP).toBe(30);
  });
});

describe('potionOfStrength', () => {
  it('permanently raises Strength by exactly 1', () => {
    expect(potionOfStrength(12)).toBe(13);
    expect(potionOfStrength(potionOfStrength(12))).toBe(14);
  });
});

describe('potionOfLife', () => {
  it('raises max HP by a flat +10 and heals to the new full', () => {
    expect(potionOfLife(30)).toEqual({ hp: 40, hpMax: 40 });
  });
  it('stacks additively across multiple potions', () => {
    let { hpMax } = potionOfLife(30);
    ({ hpMax } = potionOfLife(hpMax));
    expect(hpMax).toBe(30 + 2 * POTION_OF_LIFE_HP_BONUS);
  });
});

describe('healBy', () => {
  it('adds health but never exceeds the max', () => {
    expect(healBy(10, 30, 12)).toBe(22);
    expect(healBy(25, 30, 12)).toBe(30); // capped
  });
  it('ignores negative amounts (never harms)', () => {
    expect(healBy(20, 30, -5)).toBe(20);
  });
  it('a Potion of Life fully heals even a badly hurt delver', () => {
    const { hp, hpMax } = potionOfLife(30);
    expect(hp).toBe(hpMax); // full regardless of prior HP
  });
});

describe('nutrition (the descent clock)', () => {
  it('bands nutrition into Brogue hunger levels', () => {
    expect(hungerLevel(STOMACH_SIZE)).toBe('full');
    expect(hungerLevel(HUNGER_THRESHOLD - 1)).toBe('hungry');
    expect(hungerLevel(WEAK_THRESHOLD - 1)).toBe('weak');
    expect(hungerLevel(FAINT_THRESHOLD - 1)).toBe('faint');
    expect(hungerLevel(0)).toBe('starving');
  });
  it('eating refills toward a full stomach, never past it', () => {
    expect(eatFood(100)).toBe(100 + 1800);
    expect(eatFood(STOMACH_SIZE - 10)).toBe(STOMACH_SIZE); // capped
  });
});
