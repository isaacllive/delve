// Character classes. Each class leans toward COMBAT or EXPLORATION (or a hybrid
// of both) and carries starting stats plus a couple of signature abilities.
// Right now the stats that actually bite are HP (for permadeath, coming) and
// torch/vision radius; abilities are data shown on the sheet and will hook into
// the combat/skill system as it lands.

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
  /** Starting max HP (drives permadeath once combat exists). */
  hp: number;
  /** Torch / vision radius in cells — exploration classes see farther. */
  torchRadius: number;
  /** Base melee damage dealt by a bump attack. */
  attack: number;
  abilities: Ability[];
  /** UI accent + default token colour. */
  accent: string;
}

export const CLASSES: DelverClass[] = [
  {
    id: 'warden',
    name: 'Warden',
    role: 'combat',
    blurb: 'A frontline bulwark. Soaks hits and cleaves through packs.',
    hp: 32,
    torchRadius: 6,
    attack: 8,
    accent: '#ff7a7a',
    abilities: [
      { name: 'Cleave', desc: 'Strike all foes in the three cells you face.', kind: 'combat' },
      { name: 'Bulwark', desc: 'Brace: halve incoming damage until your next move.', kind: 'utility' },
    ],
  },
  {
    id: 'ranger',
    name: 'Ranger',
    role: 'hybrid',
    blurb: 'Eyes of the deep. Sees far and strikes from range.',
    hp: 22,
    torchRadius: 9,
    attack: 5,
    accent: '#8affa0',
    abilities: [
      { name: 'Keen Sight', desc: 'Your vision reaches noticeably farther than most.', kind: 'exploration' },
      { name: 'Volley', desc: 'Loose an arrow at any foe in line of sight.', kind: 'combat' },
    ],
  },
  {
    id: 'delver',
    name: 'Delver',
    role: 'exploration',
    blurb: 'Born for the dark. Quick, careful, and hard to trap.',
    hp: 20,
    torchRadius: 8,
    attack: 5,
    accent: '#ffcf5a',
    abilities: [
      { name: 'Pathfinder', desc: 'Sense the way down — stairs reveal from farther off.', kind: 'exploration' },
      { name: 'Nimble Step', desc: 'Slip a hazard: the next pit or trap you enter is dodged.', kind: 'utility' },
    ],
  },
  {
    id: 'mystic',
    name: 'Mystic',
    role: 'combat',
    blurb: 'Channels arcane fire and conjures light in the void.',
    hp: 18,
    torchRadius: 8,
    attack: 7,
    accent: '#c4b5fd',
    abilities: [
      { name: 'Arcane Bolt', desc: 'Hurl a bolt of force at a foe in sight.', kind: 'combat' },
      { name: 'Lightbringer', desc: 'Flare a burst of daylight, lighting a wide area.', kind: 'utility' },
    ],
  },
];

const BY_ID = new Map(CLASSES.map((c) => [c.id, c]));

/** Look up a class by id, falling back to the first class for unknown ids. */
export function getClass(id: string | undefined): DelverClass {
  return (id && BY_ID.get(id)) || CLASSES[0];
}

/** A random class id — used by the "surprise me" button in character creation.
 *  Non-deterministic on purpose (this is a player choice, not run geometry). */
export function randomClassId(): string {
  return CLASSES[Math.floor(Math.random() * CLASSES.length)].id;
}

export function roleLabel(role: ClassRole): string {
  return role === 'combat' ? 'Combat' : role === 'exploration' ? 'Exploration' : 'Hybrid';
}
