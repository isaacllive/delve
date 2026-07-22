// Brogue is CLASSLESS — there is one adventurer, and all power comes from items
// and positioning, never from a chosen class. Delve's earlier class system is
// retired to a single Adventurer with the Brogue baseline (Strength 12 lives in
// character.ts; max HP 30 here). The `classId`/`getClass` plumbing is kept inert
// (one entry) so the wire protocol and renderer need not change — a future pass
// can remove the field entirely.

import { STARTING_MAX_HP } from './character.ts';

export type ClassRole = 'combat' | 'exploration' | 'hybrid';

export interface Ability {
  name: string;
  desc: string;
  kind: 'combat' | 'exploration' | 'utility';
}

export interface DelverClass {
  id: string;
  name: string;
  role: ClassRole;
  blurb: string;
  /** Starting max HP (Brogue baseline). */
  hp: number;
  /** Torch / vision radius in cells. */
  torchRadius: number;
  /** Legacy melee value — unused now that combat runs on equipped gear. */
  attack: number;
  abilities: Ability[];
  /** UI accent + default token colour. */
  accent: string;
}

/** The sole adventurer. Brogue baseline: HP 30, generous torch-lit vision. */
export const ADVENTURER: DelverClass = {
  id: 'adventurer',
  name: 'Adventurer',
  role: 'hybrid',
  blurb: 'A lone delver. Your power is what you find and how you wield it.',
  hp: STARTING_MAX_HP,
  torchRadius: 8,
  attack: 3,
  accent: '#ffcf5a',
  abilities: [],
};

export const CLASSES: DelverClass[] = [ADVENTURER];

/** The adventurer, regardless of id (the game is classless). */
export function getClass(_id?: string | undefined): DelverClass {
  return ADVENTURER;
}
