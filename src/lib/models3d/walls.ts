// Procedural wall-segment models. Unlike every other prop, a wall's geometry
// depends on its NEIGHBORS: a run of walls should read as one continuous barrier
// and an L of them as a corner. So the real on-map mesh is built by
// `buildWallGroup(kit, color, links)` — Scene3D computes the 4-way `links` mask
// (shared `wallConnections` kernel) and calls this, growing an arm toward each
// connected side over a common center post. The ModelDef `build` below is only
// the Models-panel PREVIEW / fallback (a straight N–S segment); it never sees
// neighbors.
//
// Unit space: ~1 cell wide/deep, base on y=0. Because walls autotile off grid
// adjacency, they're always placed yaw-0 — orientation comes from the arms, not
// from `facing`.
import { C } from './kit.ts';
import type { ModelKit } from './kit.ts';
import type { ModelDef } from './types.ts';
import type { WallLinks } from './sceneTypes.ts';

type Part = Parameters<ModelKit['group']>[number];

const H = 0.82;      // wall height
const T = 0.24;      // wall thickness
const REACH = 0.52;  // center → just past the cell edge (slight overlap = seamless runs)
const CAP_H = 0.09;  // coping course on top
const CAP_W = T * 1.22;

/** Build a wall token's mesh from its neighbor-connection mask. A center post is
 *  always present (a lone wall = a pillar); each connected side extends a bar to
 *  the shared edge, so N+S → straight run, N+E → corner, 3 → T, 4 → cross. */
export function buildWallGroup(kit: ModelKit, color: string | number, links: WallLinks, capColor: string | number = C.DARKSTONE): ReturnType<ModelKit['group']> {
  const body = kit.mat(color);
  const cap = kit.mat(capColor);
  const parts: Part[] = [];

  // Center post (the junction block) + its coping.
  parts.push(kit.box(T, H, T, body, 0, H / 2, 0));
  parts.push(kit.box(CAP_W, CAP_H, CAP_W, cap, 0, H + CAP_H / 2, 0));

  // One bar + coping per connected direction. N=−Z, S=+Z, E=+X, W=−X — matches
  // the wallConnections kernel (n = row−1) and Scene3D's col→x / row→z mapping.
  if (links.n) { parts.push(kit.box(T, H, REACH, body, 0, H / 2, -REACH / 2)); parts.push(kit.box(CAP_W, CAP_H, REACH, cap, 0, H + CAP_H / 2, -REACH / 2)); }
  if (links.s) { parts.push(kit.box(T, H, REACH, body, 0, H / 2, REACH / 2)); parts.push(kit.box(CAP_W, CAP_H, REACH, cap, 0, H + CAP_H / 2, REACH / 2)); }
  if (links.e) { parts.push(kit.box(REACH, H, T, body, REACH / 2, H / 2, 0)); parts.push(kit.box(REACH, CAP_H, CAP_W, cap, REACH / 2, H + CAP_H / 2, 0)); }
  if (links.w) { parts.push(kit.box(REACH, H, T, body, -REACH / 2, H / 2, 0)); parts.push(kit.box(REACH, CAP_H, CAP_W, cap, -REACH / 2, H + CAP_H / 2, 0)); }

  return kit.group(...parts);
}

/** Cap tint per wall style — the darker coping course on top. */
export function wallCapColor(propKind: string): number {
  switch (propKind) {
    case 'wall-wood': return C.DARKWOOD;
    case 'wall-brick': return 0x6e3d30; // dark fired brick
    case 'wall-cavern': return 0x3f3a34; // damp cave rock
    default: return C.DARKSTONE;
  }
}

// Preview links: a straight vertical segment so the picker thumbnail reads as a
// wall, not a lone post.
const PREVIEW: WallLinks = { n: true, e: false, s: true, w: false };

export const MODELS: ModelDef[] = [
  {
    id: 'wall-stone',
    label: 'Stone Wall',
    icon: '🧱',
    color: '#8f8a80',
    category: 'Structure',
    build: (kit, color) => buildWallGroup(kit, color, PREVIEW, C.DARKSTONE),
  },
  {
    id: 'wall-wood',
    label: 'Timber Wall',
    icon: '🪵',
    color: '#6f4f30',
    category: 'Structure',
    build: (kit, color) => buildWallGroup(kit, color, PREVIEW, C.DARKWOOD),
  },
  {
    id: 'wall-brick',
    label: 'Brick Wall',
    icon: '🧱',
    color: '#9c5a45',
    category: 'Structure',
    build: (kit, color) => buildWallGroup(kit, color, PREVIEW, 0x6e3d30),
  },
  {
    id: 'wall-cavern',
    label: 'Cavern Wall',
    icon: '🪨',
    color: '#7a736a',
    category: 'Structure',
    build: (kit, color) => buildWallGroup(kit, color, PREVIEW, 0x3f3a34),
  },
];
