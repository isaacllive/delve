// Class identity tables: per-class DEFAULTS (pose, gear, base, armor, palette
// accents, markers) that fill anything a recipe leaves out, plus the outfit
// treatment each armor weight gets. This is where the generator is
// "opinionated": a recipe that just says {class:'wizard', species:'elf'} still
// comes out robed, staff in hand, mid-cast, on an arcane base.
//
// HOW TO ADD A CLASS: add the id to CLASS_IDS in recipe.ts, then a ClassSpec
// here. Pick markers/gear from the existing vocabularies (or grow those files
// first). Keep each class to 2–3 signature elements — silhouette readability
// beats gear count.
import type { ClassId, ClassMarker, GearId, PoseFamily, BaseTheme, MaterialRole } from './recipe.ts';

export interface ClassSpec {
  pose: PoseFamily;
  gear: GearId[];
  markers: ClassMarker[];
  base: BaseTheme;
  armor: 'none' | 'light' | 'medium' | 'heavy';
  /** Palette overrides applied when the recipe doesn't set the role itself. */
  palette: Partial<Record<MaterialRole, string>>;
}

export const CLASSES: Record<ClassId, ClassSpec> = {
  fighter: {
    pose: 'sword_lunge', gear: ['sword', 'heater_shield', 'belt_pouch'],
    markers: [], base: 'dungeon_stone', armor: 'medium',
    palette: { cloth: 'charcoal', metal: 'brushed_steel' },
  },
  wizard: {
    pose: 'spell_hurl', gear: ['wizard_staff', 'spellbook'],
    markers: ['full_robe', 'arcane_glow'], base: 'arcane_runes', armor: 'none',
    palette: { cloth: 'arcane_blue', magic: 'arcane_cyan', cloth2: 'midnight_blue' },
  },
  rogue: {
    pose: 'assassin_lunge', gear: ['dual_daggers', 'hooded_cloak', 'utility_belt'],
    markers: ['hood_up', 'sneak_gear'], base: 'shadow_stone', armor: 'light',
    palette: { cloth: 'charcoal', leather: 'black_leather', cloth2: 'midnight_blue' },
  },
  cleric: {
    // smite_strike swings the hammer overhead, so the raised-palm blessing_hand
    // glow is dropped here (it belongs to the calm blessing_gesture pose).
    pose: 'smite_strike', gear: ['warhammer', 'round_shield', 'holy_symbol_necklace'],
    markers: ['holy_symbol', 'robe_and_armor_mix'], base: 'temple_ruins', armor: 'medium',
    palette: { cloth: 'cream_robes', magic: 'soft_gold', metal: 'brushed_steel' },
  },
  ranger: {
    pose: 'bow_drawn', gear: ['bow', 'quiver', 'cloak'],
    markers: ['wilderness_gear'], base: 'forest', armor: 'light',
    palette: { cloth: 'forest_green', cloth2: 'deep_green', leather: 'dark_brown' },
  },
  paladin: {
    pose: 'shield_bash', gear: ['sword', 'heater_shield', 'tabard'],
    markers: ['radiant_motif', 'holy_symbol'], base: 'sacred_stone', armor: 'heavy',
    palette: { metal: 'brushed_steel', metal2: 'gold', cloth2: 'cream_robes', magic: 'holy_white' },
  },
  barbarian: {
    pose: 'rage_charge', gear: ['great_axe', 'fur_mantle', 'belt_pouch'],
    markers: ['trophy_straps'], base: 'rocky_battlefield', armor: 'none',
    palette: { leather: 'dark_brown', fur: 'brown_fur', cloth: 'red_leather' },
  },
  druid: {
    pose: 'wild_surge', gear: ['nature_staff', 'leaf_charms'],
    markers: ['nature_motif', 'half_robe', 'arcane_glow'], base: 'root_mushroom', armor: 'light',
    palette: { cloth: 'deep_green', magic: 'nature_green', leather: 'tan_leather' },
  },
  bard: {
    pose: 'performance_pose', gear: ['lute', 'rapier', 'feather_cap'],
    markers: ['music_motif'], base: 'tavern_stage', armor: 'light',
    palette: { cloth: 'wine_red', cloth2: 'royal_purple', metal: 'gold' },
  },
  monk: {
    pose: 'staff_sweep', gear: ['monk_staff', 'hand_wraps', 'sash'],
    markers: ['monk_wraps'], base: 'training_stone', armor: 'none',
    palette: { cloth: 'ochre', cloth2: 'wine_red' },
  },
  warlock: {
    pose: 'eldritch_cast', gear: ['eldritch_flame', 'occult_tome'],
    markers: ['infernal_motif', 'half_robe'], base: 'cracked_ritual', armor: 'light',
    palette: { cloth: 'midnight_blue', cloth2: 'royal_purple', magic: 'eldritch_green' },
  },
  sorcerer: {
    pose: 'spell_hurl', gear: ['magic_hands', 'sash'],
    markers: ['arcane_glow', 'full_robe'], base: 'magic_swirl', armor: 'none',
    palette: { cloth: 'flame_orange', cloth2: 'wine_red', magic: 'ember_orange' },
  },
};
