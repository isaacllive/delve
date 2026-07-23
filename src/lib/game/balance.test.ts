import { describe, it, expect } from 'vitest';
import { tierFor } from './monsters.ts';
import { hitChance } from './combat.ts';
import { TICKS_PER_TURN } from './energy.ts';
import {
  makeGear,
  equippedAccuracy,
  equippedDefense,
  weaponDamageRange,
  type GearInstance,
  type WeaponId,
  type ArmorId,
} from './gear.ts';

// Balance regression: encode the intended power curve so a stat change that makes
// the descent unwinnable (or trivial) trips a test. For each biome tier we model a
// delver equipped roughly as they'd be by that depth (gear found + metered enchant
// scrolls + Potion of Life), and check the melee exchange against the tier's
// tougher monster: the delver should reliably WIN the trade (kill it faster than it
// kills them), but not one-shot everything late.

interface Loadout {
  weapon: WeaponId;
  armor: ArmorId;
  enchant: number;
  strength: number;
  hp: number;
}

// One representative loadout per tier (index = biome band). Reflects a careful
// player's progression, not a min-maxed or a neglected one.
const LOADOUTS: Loadout[] = [
  { weapon: 'dagger', armor: 'leather', enchant: 0, strength: 12, hp: 30 }, // Caves
  { weapon: 'sword', armor: 'scale', enchant: 1, strength: 13, hp: 40 }, // Ruins
  { weapon: 'mace', armor: 'chain', enchant: 2, strength: 14, hp: 55 }, // Lava
  { weapon: 'mace', armor: 'banded', enchant: 3, strength: 15, hp: 70 }, // Ancient City
  { weapon: 'warHammer', armor: 'plate', enchant: 4, strength: 17, hp: 90 }, // Corrupted
];

/** Depth at the middle of each biome band (FLOORS_PER_BIOME = 5). */
const TIER_DEPTH = [2, 7, 12, 17, 22];

function loadoutGear(l: Loadout): { weapon: GearInstance; armor: GearInstance } {
  return {
    weapon: makeGear('weapon', l.weapon, 'w', l.enchant, true),
    armor: makeGear('armor', l.armor, 'a', l.enchant, true),
  };
}

/** Player-turns for an attacker to kill `targetHp`, given hit chance, damage
 *  range, and how many of ITS turns fall in one player turn (speedMult: a fast
 *  monster acts >1×, a slow ogre <1×; the player is 1×). Expected damage per
 *  player-turn = speedMult × hitChance × mean damage. */
function turnsToKill(targetHp: number, hitP: number, dmgMin: number, dmgMax: number, speedMult = 1): number {
  const perTurn = speedMult * hitP * ((dmgMin + dmgMax) / 2);
  return perTurn <= 0 ? Infinity : targetHp / perTurn;
}

describe('combat balance curve (26-floor descent)', () => {
  it('a tier-appropriate delver wins the melee exchange against each tier', () => {
    for (let tier = 0; tier < LOADOUTS.length; tier++) {
      const l = LOADOUTS[tier];
      const { weapon, armor } = loadoutGear(l);
      const acc = equippedAccuracy(weapon, l.strength);
      const def = equippedDefense(armor, l.strength);
      const dmg = weaponDamageRange(weapon, l.strength);

      // The tougher monster of the tier (highest HP × damage).
      const monsters = tierFor(TIER_DEPTH[tier]);
      const foe = monsters.reduce((a, b) => (a.hp * a.damage >= b.hp * b.damage ? a : b));

      const playerHitP = hitChance(acc, foe.defense);
      const monsterHitP = hitChance(foe.accuracy, def);
      // The monster's speed relative to the player: a slow ogre (200 ticks) acts
      // half as often, a fast bat (50) twice as often.
      const monsterSpeed = TICKS_PER_TURN / foe.actionTicks;
      const playerTTK = turnsToKill(foe.hp, playerHitP, dmg.min, dmg.max);
      const monsterTTK = turnsToKill(l.hp, monsterHitP, foe.damage * 0.7, foe.damage, monsterSpeed);

      // The delver should land blows reliably…
      expect(playerHitP, `tier ${tier} player hit%`).toBeGreaterThan(0.5);
      // …and win the trade with a comfortable margin (kills it in well under the
      // time it takes to kill them) — a fair fight one-on-one, deadly in packs.
      expect(playerTTK, `tier ${tier} player TTK ${playerTTK.toFixed(1)} vs monster ${monsterTTK.toFixed(1)}`).toBeLessThan(
        monsterTTK,
      );
    }
  });

  it('early monsters are not one-shot by a normal (non-sneak) blow', () => {
    // Sneak attacks SHOULD be able to one-shot early; a normal swing should not
    // trivialize the tier-0 fight (keeps positioning meaningful).
    const l = LOADOUTS[0];
    const { weapon } = loadoutGear(l);
    const dmg = weaponDamageRange(weapon, l.strength);
    const goblin = tierFor(0).find((m) => m.id === 'goblin')!;
    expect(dmg.max, 'dagger max vs goblin HP').toBeLessThan(goblin.hp);
  });
});
