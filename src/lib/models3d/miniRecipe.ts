// Recipe → scene-map figure adapter.
//
// Bridges the presentation-grade miniature generator ($lib/minis) into the
// tabletop model library ($lib/models3d). The generator builds premium toon
// miniatures in MILLIMETRES with a themed plinth; the scene map wants a figure
// in UNIT (~1 cell) space, base on y=0, facing +Z, WITHOUT a plinth (Scene3D
// draws its own pedestal ring). `fromRecipe(recipe)` returns a `ModelBuild`
// (the same signature every models3d builder uses) that:
//   1. runs buildMiniature() with the kit's live THREE namespace,
//   2. strips the generator's plinth (tagged `isMiniBase` in minis/builder.ts),
//   3. scales mm → unit space with a FIXED factor so species keep their
//      relative stature (a dwarf stays shorter than a human on the same map),
//   4. grounds the lowest point to y=0 so every pose stands on the cell.
//
// Server-import-safe: like every models3d builder, the returned function is
// inert until Scene3D calls it in the browser with a real ModelKit. The recipe
// itself is validated eagerly at module load, so a bad recipe fails loudly at
// import time (matching the generator's zod-enum contract) instead of on first
// render.
import {
  buildMiniature, parseMiniRecipe, type MiniRecipeInput,
  buildBeast, parseBeastRecipe, type BeastRecipeInput,
  buildCritter, parseCritterRecipe, type CritterRecipeInput,
  buildConstruct, parseConstructRecipe, type ConstructRecipeInput,
  buildAmorphous, parseAmorphousRecipe, type AmorphousRecipeInput,
} from '$lib/minis/index.ts';
import type { ModelBuild } from './types.ts';

// Millimetres per unit cell. The generator's "standard human heroic" is ~30mm
// to the scalp (rig.ts HUMAN_DIMS.height); dividing by 30 lands a human body at
// ~1.0 unit tall, matching the hand-built humanoid figures this replaces.
// Weapons/wings legitimately reach above that — figTop is measured per-figure
// downstream, so tall poses still get the right HP/name-stack clearance.
const MM_PER_UNIT = 30;

/** Turn a miniature recipe into a scene-map `ModelBuild`. The per-token `color`
 *  is intentionally ignored: the recipe owns the figure's palette (far richer
 *  than a single tint), and Scene3D's downed/unpainted path re-materialises the
 *  whole figure to pewter grey regardless. */
export function fromRecipe(recipe: MiniRecipeInput): ModelBuild {
  // Validate + default-fill once at module load (throws a readable ZodError on a
  // bad recipe, exactly like a typo in a gear/pose enum would).
  const parsed = parseMiniRecipe(recipe);
  return (kit) => {
    const THREE = kit.THREE;
    const built = buildMiniature(THREE, parsed);
    const fig = built.group;
    // Drop the generator's plinth — the scene map has its own ground + ring.
    for (const child of [...fig.children]) {
      if (child.userData?.isMiniBase) fig.remove(child);
    }
    fig.scale.setScalar(1 / MM_PER_UNIT);
    fig.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(fig);
    if (Number.isFinite(bb.min.y)) fig.position.y -= bb.min.y; // plant on y=0
    // Wrap so Scene3D's `figure.scale.setScalar(size)` scales the cell footprint
    // without clobbering our mm→unit scale on `fig`.
    const wrap = new THREE.Group();
    wrap.add(fig);
    return wrap;
  };
}

/** Turn a quadruped BEAST recipe into a scene-map `ModelBuild`. Same mm→unit
 *  contract as fromRecipe, but there's no plinth to strip — buildBeast already
 *  grounds the animal on y=0. */
export function fromBeastRecipe(recipe: BeastRecipeInput): ModelBuild {
  const parsed = parseBeastRecipe(recipe);
  return (kit) => {
    const THREE = kit.THREE;
    const { group } = buildBeast(THREE, parsed);
    return groundScaleWrap(THREE, group);
  };
}

/** Turn a CRITTER recipe (arthropod/serpent/swarm/…) into a scene-map
 *  `ModelBuild` — same mm→unit + ground contract as the beast adapter. */
export function fromCritterRecipe(recipe: CritterRecipeInput): ModelBuild {
  const parsed = parseCritterRecipe(recipe);
  return (kit) => {
    const THREE = kit.THREE;
    const { group } = buildCritter(THREE, parsed);
    return groundScaleWrap(THREE, group);
  };
}

/** Turn a CONSTRUCT recipe (golem/treant/animated-armour/…) into a scene-map
 *  `ModelBuild` — same mm→unit + ground contract as the beast/critter adapters. */
export function fromConstructRecipe(recipe: ConstructRecipeInput): ModelBuild {
  const parsed = parseConstructRecipe(recipe);
  return (kit) => {
    const THREE = kit.THREE;
    const { group } = buildConstruct(THREE, parsed);
    return groundScaleWrap(THREE, group);
  };
}

export function fromAmorphousRecipe(recipe: AmorphousRecipeInput): ModelBuild {
  const parsed = parseAmorphousRecipe(recipe);
  return (kit) => {
    const THREE = kit.THREE;
    const { group } = buildAmorphous(THREE, parsed);
    return groundScaleWrap(THREE, group);
  };
}

/** Shared tail of the beast/critter adapters: scale mm→unit, ground to y=0,
 *  and wrap so Scene3D's per-token size scale doesn't clobber the mm→unit one. */
function groundScaleWrap(THREE: typeof import('three'), group: import('three').Group): import('three').Group {
  group.scale.setScalar(1 / MM_PER_UNIT);
  group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(group);
  if (Number.isFinite(bb.min.y)) group.position.y -= bb.min.y;
  const wrap = new THREE.Group();
  wrap.add(group);
  return wrap;
}
