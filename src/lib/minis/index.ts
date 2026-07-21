// Procedural fantasy miniature generator — public surface.
//
// The system turns compact JSON recipes (recipe.ts) into stylized heroic-32mm
// tabletop miniatures: a species-scaled rig, class outfit + gear, a static
// sculpted pose, a themed base, toon materials and inverted-hull outlines.
// See docs/miniature-generator.md for the architecture and extension guide.
//
// Server-import-safe: nothing here touches THREE until buildMiniature() is
// called with a live namespace (same convention as $lib/models3d).
export {
  MiniRecipeSchema, parseMiniRecipe, safeParseMiniRecipe,
  CLASS_IDS, SPECIES_IDS, POSE_FAMILIES, GEAR_IDS, BASE_THEMES,
  CLASS_MARKERS, SPECIES_MARKERS, MATERIAL_ROLES,
} from './recipe.ts';
export type {
  MiniRecipe, MiniRecipeInput, ClassId, SpeciesId, PoseFamily, GearId,
  BaseTheme, ClassMarker, SpeciesMarker, MaterialRole,
} from './recipe.ts';
export { makeMiniKit, type MiniKit } from './kit.ts';
export { MATERIAL_PRESETS, resolvePalette, type Palette } from './materials.ts';
export { CLASSES, type ClassSpec } from './classes.ts';
export { SPECIES, type SpeciesSpec } from './species.ts';
export { buildMiniature, effectivePose, reaimShields, reaimWeapons, type BuiltMini } from './builder.ts';
// Pose transition engine — tween a built rig between pose families live.
export { poseTargets, applyPoseTargets, type PoseTargets, type PoseJoint } from './poses.ts';
export {
  createPoseAnimator, createPoseFlourish, lerpPoseTargets, easeInOutCubic,
  type PoseAnimator, type PoseAnimatorOpts, type PoseFlourishOpts, type PoseState,
} from './poseAnimation.ts';
export { SAMPLE_RECIPES, RAW_SAMPLE_RECIPES } from './recipes/index.ts';
// Quadruped beast generator (non-biped companion to the humanoid engine).
export {
  BEAST_IDS, BeastRecipeSchema, parseBeastRecipe, buildBeast,
  type BeastId, type BeastRecipe, type BeastRecipeInput, type BuiltBeast,
} from './beast.ts';
// Critter generator (arthropods, serpent, amphibian, flyer, swarms).
export {
  CRITTER_IDS, CritterRecipeSchema, parseCritterRecipe, buildCritter,
  type CritterId, type CritterRecipe, type CritterRecipeInput, type BuiltCritter,
} from './critters.ts';
// Construct / plant generator (golem, treant, animated armour, scarecrow, …).
export {
  CONSTRUCT_IDS, ConstructRecipeSchema, parseConstructRecipe, buildConstruct,
  type ConstructId, type ConstructRecipe, type ConstructRecipeInput, type BuiltConstruct,
} from './constructs.ts';

export {
  AMORPHOUS_IDS, AmorphousRecipeSchema, parseAmorphousRecipe, buildAmorphous,
  type AmorphousId, type AmorphousRecipe, type AmorphousRecipeInput, type BuiltAmorphous,
} from './amorphous.ts';
