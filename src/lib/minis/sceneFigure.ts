// Adapter: generated miniatures (mm-scale toon/outline style) → scene-map
// figures (cell units). docs/miniature-generator.md reserves exactly this
// shape — wrap buildMiniature output and rescale, never merge the kits.
//
// Templates are cached per recipe (keyed by recipe JSON) and handed out as
// clones that SHARE the template's geometry + materials; every cloned node is
// marked `userData.shared` so Scene3D's per-rebuild disposeGroup (which skips
// shared resources) leaves the cache intact. Same lifetime pattern as the GLB
// model cache: templates live for the component's lifetime, clones are cheap.
import type * as THREE_NS from 'three';
import { buildMiniature, type BuiltMini } from './builder.ts';
import { makeMiniKit, type MiniKit } from './kit.ts';
import type { MiniRecipe } from './recipe.ts';
import type { Rig } from './rig.ts';
import type { PoseState } from './poseAnimation.ts';

/** mm → cell: a 30mm-to-scalp human + ~3mm display plinth ≈ 0.95 cell tall,
 *  matching the height the procedural models3d figures read on the board. */
const MM_TO_CELL = 1 / 35;

interface Template { group: THREE_NS.Group; topCells: number }

let kit: MiniKit | null = null;
const templates = new Map<string, Template>();

export interface SceneMiniFigure {
  /** Board-scale clone (base bottom on y=0, facing +Z), safe to add per token. */
  group: THREE_NS.Group;
  /** Figure height in cell units — where the floating HP/name stack starts. */
  topCells: number;
}

/** Strip the generator's tagged plinth and re-plant the figure's lowest point
 *  on y=0, baking mm→cell on `built.group` (the returned root keeps scale 1 so
 *  the renderer can setScalar(tokenSize) without undoing the unit change).
 *  The scene map draws its OWN pedestal ring under every token, so a built-in
 *  plinth would double up (and z-fight) with it — the same reason the
 *  models3d/miniRecipe.ts adapter drops it. Returns the grounded figure height
 *  in cell units (for the floating HP/name stack). */
function stripBaseAndGround(THREE: typeof THREE_NS, built: BuiltMini): number {
  const fig = built.group;
  for (const child of [...fig.children]) {
    if (child.userData?.isMiniBase) fig.remove(child);
  }
  fig.scale.setScalar(MM_TO_CELL);
  fig.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(fig);
  if (Number.isFinite(bb.min.y)) fig.position.y -= bb.min.y; // plant feet on y=0
  return Number.isFinite(bb.max.y) ? bb.max.y - bb.min.y : built.heightMm * MM_TO_CELL;
}

/** Build (or fetch cached) the board-scale figure for a recipe and return a
 *  shared-resource clone. Throws only on a genuinely broken recipe — callers
 *  should catch and fall back to the library figure. */
export function sceneMiniFigure(THREE: typeof THREE_NS, recipe: MiniRecipe): SceneMiniFigure {
  // Build on the plain plinth (cheapest base — themed scatter like mushrooms /
  // rubble would only get stripped anyway) then drop it in stripBaseAndGround
  // so the figure stands directly on the scene map's own pedestal.
  const boardRecipe: MiniRecipe = { ...recipe, baseTheme: 'plain' };
  const key = JSON.stringify(boardRecipe);
  let t = templates.get(key);
  if (!t) {
    kit ??= makeMiniKit(THREE);
    const built = buildMiniature(THREE, boardRecipe, kit);
    const topCells = stripBaseAndGround(THREE, built);
    const root = new THREE.Group();
    root.add(built.group);
    t = { group: root, topCells };
    templates.set(key, t);
  }
  const clone = t.group.clone(true);
  clone.traverse((o) => { o.userData.shared = true; });
  return { group: clone, topCells: t.topCells };
}

export interface AnimatableSceneFigure extends SceneMiniFigure {
  /** Live skeleton — hand to createPoseAnimator to tween between poses. */
  rig: Rig;
}

/** Board-scale figure with a LIVE rig, for tokens mid pose-transition. Built
 *  fresh (template clones share geometry and carry no rig), optionally in an
 *  overridden pose (the transition's FROM state; the animator then tweens it
 *  to the recipe's pose). Nothing is marked `shared`, so the renderer's
 *  per-rebuild disposeGroup frees it like any one-off figure. */
export function animatableSceneFigure(
  THREE: typeof THREE_NS,
  recipe: MiniRecipe,
  pose?: PoseState,
): AnimatableSceneFigure {
  const boardRecipe: MiniRecipe = {
    ...recipe,
    baseTheme: 'plain',
    ...(pose ? { poseFamily: pose.family, poseIntensity: pose.intensity } : {}),
  };
  kit ??= makeMiniKit(THREE);
  const built = buildMiniature(THREE, boardRecipe, kit);
  const topCells = stripBaseAndGround(THREE, built);
  const root = new THREE.Group();
  root.add(built.group);
  return { group: root, topCells, rig: built.rig };
}
