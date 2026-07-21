import type { Group } from 'three';
import type { ModelKit } from './kit.ts';

/** Build a procedural model in unit (~1 cell) space, base on y=0, front +Z.
 *  `color` is the per-token tint (a CSS colour); builders may use it or ignore
 *  it in favour of their own palette. */
export type ModelBuild = (kit: ModelKit, color: string) => Group;

/** The fixed set of Models-panel groups. A union (not a free string) so a
 *  typo can't silently split a group into two (e.g. 'Structure' vs 'Dungeon').
 *  Props use the scenery categories; minis use 'PC' / 'NPC'. */
export type ModelCategory =
  | 'Gear' | 'Containers' | 'Dressing' | 'Structure' | 'Furniture' | 'Camp'
  | 'Loot' | 'Dungeon' | 'Nature' | 'Magic' | 'Hazard'
  | 'PC' | 'NPC';

export interface ModelDef {
  /** Stable id stored on tokens (token.propKind / "builtin:<id>"). kebab-case. */
  id: string;
  label: string;
  /** 2D emoji icon (shown on the map coin + Models panel). */
  icon: string;
  /** Default tint. */
  color: string;
  /** Models-panel grouping. */
  category: ModelCategory;
  /** Default cell footprint (width=height). 1 unless a big piece (wall=… etc.). */
  size?: number;
  /** For creature minis: lowercase keywords matched against a token's
   *  label/species to auto-pick this model. Omit for scenery/props. */
  keywords?: string[];
  /** Creature minis flagged so the auto-figure picker considers them and the
   *  Models panel can assign them to a token (vs placing as a prop). */
  creature?: boolean;
  build: ModelBuild;
}
