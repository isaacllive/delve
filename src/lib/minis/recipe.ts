// Miniature recipe schema — the JSON contract between an AI (or a human) and
// the procedural miniature engine. A recipe is a compact, declarative
// description of ONE heroic-32mm fantasy miniature: archetype, species, pose,
// gear, markers, base theme and material palette. The engine (builder.ts)
// turns it into a posed, based, outlined THREE.Group.
//
// Design intent: the recipe stays SMALL and semantic ("dwarf cleric, blessing
// gesture, warhammer") while the engine owns all sculptural decisions
// (proportions, chunkiness, print-safety, style consistency). An AI writing
// recipes can't produce a fragile or off-style mini, because those decisions
// aren't in the recipe.
//
// HOW TO EXTEND
// - New class:   add to CLASS_IDS here, then give it defaults in classes.ts
//                (gear, pose, palette, markers) so sparse recipes still read.
// - New species: add to SPECIES_IDS here, then add proportions + marker
//                builder in species.ts.
// - New pose:    add to POSE_FAMILIES here, then define joint angles in
//                poses.ts.
// - New gear:    add the id to GEAR_IDS here, then a builder in gear.ts.
// - New base:    add to BASE_THEMES here, then a builder in bases.ts.
// Zod keeps unknown ids out at the validation boundary, so a typo in an
// AI-generated recipe fails loudly instead of silently dropping a part.
import { z } from 'zod';

export const CLASS_IDS = [
  'fighter', 'wizard', 'rogue', 'cleric', 'ranger', 'paladin',
  'barbarian', 'druid', 'bard', 'monk', 'warlock', 'sorcerer',
] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const SPECIES_IDS = [
  'human', 'elf', 'dwarf', 'halfling', 'gnome', 'half_orc', 'tiefling', 'dragonborn',
  // monster humanoids (bipeds that reuse the shared rig with their own
  // proportions + markers)
  'goblin', 'orc', 'kobold', 'hobgoblin', 'bugbear', 'gnoll', 'lizardfolk',
  // large bipedal monsters (size-2 brutes on the shared rig, big + broad)
  'ogre', 'troll', 'giant', 'minotaur', 'werewolf',
  // undead
  'skeleton',
] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

export const POSE_FAMILIES = [
  'ready_stance', 'shield_forward', 'overhead_strike', 'two_handed_weapon_pose',
  'casting_staff', 'spell_hand_extended', 'reading_spellbook',
  'crouching_sneak', 'dagger_lunge', 'bow_drawn', 'scouting_pose',
  'blessing_gesture', 'holy_symbol_extended', 'heroic_guard',
  'rage_charge', 'axe_roar', 'performance_pose', 'rapier_flourish',
  'martial_kick', 'staff_monk_stance', 'eldritch_cast', 'summoning_pose',
  'shambling', 'menacing_advance', 'standing',
  // Dynamic action set — signature mid-motion poses for combat figures.
  'sword_lunge', 'shield_bash', 'spell_hurl', 'smite_strike',
  'assassin_lunge', 'staff_sweep', 'wild_surge', 'pounce',
] as const;
export type PoseFamily = (typeof POSE_FAMILIES)[number];

/** Every buildable piece of gear. Hand items carry grip metadata in gear.ts;
 *  worn items (cloak, quiver, pouches…) know their own attach point. */
export const GEAR_IDS = [
  // sentinel: an explicit empty hand. A recipe that OMITS gear inherits the
  // class default weapons; ['none'] means "intentionally unarmed" (townsfolk).
  'none',
  // weapons
  'sword', 'greatsword', 'dagger', 'dual_daggers', 'dual_swords', 'dual_axes',
  'warhammer', 'great_axe', 'battleaxe', 'rapier', 'scimitar', 'mace', 'spear',
  'halberd', 'crossbow', 'club', 'greatclub', 'morningstar', 'quarterstaff',
  'wizard_staff', 'nature_staff', 'monk_staff', 'bow', 'sickle',
  // off-hand / focus
  'round_shield', 'heater_shield', 'spellbook', 'occult_tome', 'orb', 'wand',
  'lute', 'eldritch_flame', 'magic_hands', 'holy_symbol_held',
  // worn
  'cloak', 'hooded_cloak', 'quiver', 'backpack', 'belt_pouch', 'utility_belt',
  'holy_symbol_necklace', 'hand_wraps', 'tabard', 'fur_mantle', 'sash',
  'leaf_charms', 'feather_cap', 'wings',
] as const;
export type GearId = (typeof GEAR_IDS)[number];

export const BASE_THEMES = [
  'plain', 'dungeon_stone', 'arcane_runes', 'shadow_stone', 'temple_ruins',
  'forest', 'sacred_stone', 'rocky_battlefield', 'root_mushroom',
  'tavern_stage', 'training_stone', 'cracked_ritual', 'magic_swirl',
] as const;
export type BaseTheme = (typeof BASE_THEMES)[number];

/** Class markers are semantic flags the builder maps onto sculpt features
 *  (a robe layer, a glow, an icon on the shield…). Unknown markers are
 *  rejected so recipes stay honest about what the engine can do. */
export const CLASS_MARKERS = [
  'holy_symbol', 'blessing_hand', 'robe_and_armor_mix', 'full_robe', 'half_robe',
  'arcane_glow', 'nature_motif', 'infernal_motif', 'radiant_motif', 'music_motif',
  'hood_up', 'trophy_straps', 'monk_wraps', 'sneak_gear', 'wilderness_gear',
  'skeletal',
] as const;
export type ClassMarker = (typeof CLASS_MARKERS)[number];

/** Species markers let a recipe emphasise or suppress individual features
 *  (e.g. a beardless dwarf). Anything omitted falls back to the species'
 *  default marker set in species.ts. */
export const SPECIES_MARKERS = [
  'pointed_ears', 'braided_beard', 'full_beard', 'tusks', 'horns', 'tail',
  'draconic_head', 'scaled_hide', 'broad_nose', 'short_stout_body',
  'slender_build', 'small_and_nimble', 'heavy_jaw', 'topknot', 'long_hair',
  'short_hair', 'bald', 'undead_bones', 'snout', 'mane',
] as const;
export type SpeciesMarker = (typeof SPECIES_MARKERS)[number];

export const MATERIAL_ROLES = [
  'skin', 'cloth', 'cloth2', 'leather', 'metal', 'metal2', 'wood', 'bone',
  'magic', 'stone', 'fur', 'scale', 'hair',
] as const;
export type MaterialRole = (typeof MATERIAL_ROLES)[number];

const JoinStyle = z.enum(['smooth', 'beveled', 'hard']);

/** The full recipe. Everything except name/class/species is optional — the
 *  class + species tables fill sensible defaults so an AI can emit a 4-line
 *  recipe and still get a polished mini. */
export const MiniRecipeSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(['player_character_mini', 'npc_mini', 'monster_mini']).default('player_character_mini'),
  scale: z.literal('32mm_heroic').default('32mm_heroic'),
  baseSize: z.enum(['25mm_round', '32mm_round']).default('25mm_round'),
  class: z.enum(CLASS_IDS),
  species: z.enum(SPECIES_IDS),
  genderPresentation: z.enum(['masculine', 'feminine', 'androgynous']).default('androgynous'),
  /** Free-text body descriptor — advisory; real proportions come from species. */
  bodyType: z.string().max(40).optional(),
  /** Free-text silhouette note — advisory, for humans reading the recipe. */
  silhouette: z.string().max(60).optional(),
  armorWeight: z.enum(['none', 'light', 'medium', 'heavy']).optional(),
  poseFamily: z.enum(POSE_FAMILIES).optional(),
  /** 0..1 — how far from neutral toward the pose's full expression. */
  poseIntensity: z.number().min(0).max(1).default(0.6),
  mood: z.string().max(60).optional(),
  gear: z.array(z.enum(GEAR_IDS)).max(10).default([]),
  classMarkers: z.array(z.enum(CLASS_MARKERS)).max(8).default([]),
  speciesMarkers: z.array(z.enum(SPECIES_MARKERS)).max(8).default([]),
  baseTheme: z.enum(BASE_THEMES).optional(),
  /** Role → named preset from materials.ts (e.g. "warm_skin") or "#rrggbb". */
  materials: z.partialRecord(z.enum(MATERIAL_ROLES), z.string().max(30)).default({}),
  /** Advisory join hints; the engine already picks smooth for organic parts
   *  and hard/beveled for gear, so this exists for recipe readability and
   *  future per-part overrides. */
  joinRules: z.record(z.string().max(20), JoinStyle).optional(),
  /** Print-safety notes are documentation; the *rules* (min thickness, fused
   *  masses, thick handles) are enforced by the part builders themselves. */
  printSafety: z.object({
    minThicknessMm: z.number().min(0.8).max(5).default(1.2),
    fragileRisk: z.enum(['low', 'medium', 'high']).default('low'),
    notes: z.array(z.string().max(120)).max(10).default([]),
  }).optional(),
});

export type MiniRecipe = z.infer<typeof MiniRecipeSchema>;
/** What an AI actually emits — all defaults still optional. */
export type MiniRecipeInput = z.input<typeof MiniRecipeSchema>;

/** Validate + default-fill a raw recipe (e.g. straight from an LLM). Throws a
 *  ZodError with a readable path on bad input. */
export function parseMiniRecipe(raw: unknown): MiniRecipe {
  return MiniRecipeSchema.parse(raw);
}

/** Non-throwing variant for UI flows. */
export function safeParseMiniRecipe(raw: unknown) {
  return MiniRecipeSchema.safeParse(raw);
}
