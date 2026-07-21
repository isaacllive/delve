// Aggregated procedural 3D model library. Each category file exports a
// `MODELS: ModelDef[]`; this merges them, de-duplicates by id (first wins), and
// exposes lookups. Builders take a ModelKit (Scene3D builds one from the live
// THREE) so this module stays import-safe on the server.
import type { ModelDef } from './types.ts';
import { MODELS as core } from './core.ts';
import { MODELS as structures } from './structures.ts';
import { MODELS as walls } from './walls.ts';
import { MODELS as nature } from './nature.ts';
import { MODELS as furniture } from './furniture.ts';
import { MODELS as camp } from './camp.ts';
import { MODELS as magic } from './magic.ts';
import { MODELS as hazards } from './hazards.ts';
// Creature minis (figures). These carry `creature: true` + `keywords`, so they
// surface in the mini picker / Figures panel rather than as placeable props.
import { MODELS as minisMartial } from './minis-martial.ts';
import { MODELS as minisArcane } from './minis-arcane.ts';
import { MODELS as minisFolk } from './minis-folk.ts';
import { MODELS as minisMonsterHumanoid } from './minis-monster-humanoid.ts';
import { MODELS as minisBeasts } from './minis-beasts.ts';
import { MODELS as minisLarge } from './minis-large.ts';

const ALL: ModelDef[] = [
  ...core, ...structures, ...walls, ...nature, ...furniture, ...camp, ...magic, ...hazards,
  ...minisMartial, ...minisArcane, ...minisFolk, ...minisMonsterHumanoid, ...minisBeasts, ...minisLarge,
];

// Drop accidental duplicate ids across category files (first definition wins).
// A collision silently removes the *second* definition — and since props are
// spread before minis, a mini whose id clashes with a prop would vanish from
// MINI_MODELS, the Figures panel, AND pickMiniId with no trace. Warn loudly in
// dev so that never happens unnoticed (the scarecrow/animated-scarecrow lineage
// was the near-miss).
const seen = new Set<string>();
export const MODEL_LIBRARY: ModelDef[] = ALL.filter(m => {
  if (seen.has(m.id)) {
    if (import.meta.env?.DEV) console.warn(`[models3d] duplicate model id "${m.id}" dropped (first definition wins)`);
    return false;
  }
  seen.add(m.id);
  return true;
});

export const MODEL_BY_ID: Record<string, ModelDef> = Object.fromEntries(MODEL_LIBRARY.map(m => [m.id, m]));

/** Placeable scenery/props only (decorative `kind: 'prop'` tokens). */
export const PROP_MODELS: ModelDef[] = MODEL_LIBRARY.filter(m => !m.creature);
/** Creature figures (auto-picked for image-less char/npc tokens, or assignable). */
export const MINI_MODELS: ModelDef[] = MODEL_LIBRARY.filter(m => m.creature);

// Pre-tokenise each mini's keywords once for the matcher.
const MINI_KW: { def: ModelDef; words: string[] }[] = MINI_MODELS.map(def => ({
  def,
  words: (def.keywords ?? []).map(k => k.toLowerCase().trim()).filter(Boolean),
}));

/** Pick the best-matching creature mini for a token's free text (label +
 *  species + notes, anything descriptive). Returns the mini id or null when
 *  nothing matches well enough. Scoring favours longer, whole-word keyword
 *  hits so "owlbear" beats a bare "bear" substring and "dire wolf" beats
 *  "wolf". Pure + deterministic so both renderers can share it. */
export function pickMiniId(text: string | null | undefined): string | null {
  if (!text) return null;
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  if (hay.trim() === '') return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const { def, words } of MINI_KW) {
    let score = 0;
    for (const kw of words) {
      const padded = ` ${kw} `;
      if (hay.includes(padded)) {
        // Whole-word (or whole-phrase) hit: weight by length + phrase bonus.
        score = Math.max(score, kw.length + (kw.includes(' ') ? 4 : 0) + 2);
      } else if (kw.length >= 5 && hay.includes(kw)) {
        // Substring hit for longer keywords only (avoids "rat"/"bat" noise).
        score = Math.max(score, kw.length);
      }
    }
    if (score > bestScore) { bestScore = score; best = def.id; }
  }
  return best;
}

export type { ModelDef, ModelBuild } from './types.ts';
export { makeKit, type ModelKit } from './kit.ts';

// Preview-only models for map markers (objectKind) + lights (lightKind). These
// are deliberately NOT part of MODEL_LIBRARY / MODEL_BY_ID (a token never
// references one, so they stay out of the props catalog + model validation);
// the thumbnail renderer resolves them through PREVIEW_MODEL_BY_ID so the
// Library panel can render a marker/light the same way it renders a prop.
export { objectModelId, lightModelId, PREVIEW_MODEL_BY_ID } from './objects.ts';
