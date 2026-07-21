// Procedural 3D model builders for forest / cave / wilderness terrain.
// Each builder works in UNIT space (~1 cell wide, base on y=0, front +Z) and
// returns a THREE.Group. Builders never import 'three' directly — they use the
// kit passed in (see ./kit.ts) so this module stays safe to import server-side.
import type { ModelDef } from './types.ts';
import { C } from './kit.ts';

const SNOW = 0xf4f7fb;
const GEM = 0x6ad0ff;

export const MODELS: ModelDef[] = [
  {
    id: 'tree', label: 'Tree', icon: '🌲', color: '#3f6b3a', category: 'Nature',
    build: (k) => k.group(
      k.cyl(0.06, 0.09, 0.42, C.BARK, 0, 0.21, 0),
      k.cone(0.3, 0.42, C.DARKLEAF, 0, 0.5, 0),
      k.cone(0.24, 0.36, C.LEAF, 0, 0.72, 0),
      k.cone(0.16, 0.3, C.LEAF, 0, 0.92, 0),
    ),
  },
  {
    id: 'tree-large', label: 'Large Tree', icon: '🌲', color: '#3f6b3a', category: 'Nature', size: 2,
    build: (k) => k.group(
      k.cyl(0.1, 0.15, 0.6, C.BARK, 0, 0.3, 0),
      k.cone(0.42, 0.6, C.DARKLEAF, 0, 0.72, 0),
      k.cone(0.34, 0.52, C.LEAF, 0, 1.02, 0),
      k.cone(0.24, 0.44, C.LEAF, 0, 1.32, 0),
      k.cone(0.14, 0.34, C.LEAF, 0, 1.58, 0),
    ),
  },
  {
    id: 'tree-dead', label: 'Dead Tree', icon: '🪾', color: '#5a4128', category: 'Nature',
    build: (k) => k.group(
      k.cyl(0.05, 0.1, 0.7, C.DARKWOOD, 0, 0.35, 0),
      k.rot(k.cyl(0.02, 0.04, 0.34, C.DARKWOOD, 0.13, 0.56, 0), 0, 0, -0.8),
      k.rot(k.cyl(0.02, 0.04, 0.3, C.DARKWOOD, -0.12, 0.62, 0.04), 0.3, 0, 0.9),
      k.rot(k.cyl(0.015, 0.03, 0.24, C.DARKWOOD, 0.04, 0.74, -0.1), -0.5, 0, 0.3),
    ),
  },
  {
    id: 'tree-stump', label: 'Tree Stump', icon: '🪵', color: '#6f4f30', category: 'Nature',
    build: (k) => k.group(
      k.cyl(0.22, 0.26, 0.22, C.BARK, 0, 0.11, 0),
      k.cyl(0.19, 0.19, 0.02, C.WOOD, 0, 0.23, 0),
      k.torus(0.12, 0.02, C.DARKWOOD, 0, 0.24, 0),
      k.torus(0.06, 0.015, C.DARKWOOD, 0, 0.24, 0),
    ),
  },
  {
    id: 'log', label: 'Fallen Log', icon: '🪵', color: '#6f4f30', category: 'Nature',
    build: (k) => k.group(
      k.rot(k.cyl(0.13, 0.13, 0.85, C.BARK, 0, 0.13, 0), Math.PI / 2, 0, 0),
      k.cyl(0.1, 0.1, 0.02, C.WOOD, 0, 0.13, 0.43),
      k.cyl(0.1, 0.1, 0.02, C.WOOD, 0, 0.13, -0.43),
    ),
  },
  {
    id: 'bush', label: 'Bush', icon: '🌳', color: '#4a7340', category: 'Nature',
    build: (k) => k.group(
      k.sph(0.22, C.DARKLEAF, 0, 0.2, 0),
      k.sph(0.18, C.LEAF, -0.18, 0.16, 0.06),
      k.sph(0.17, C.LEAF, 0.18, 0.17, -0.04),
      k.sph(0.16, C.GREEN, 0.02, 0.3, 0.12),
    ),
  },
  {
    id: 'rock', label: 'Rock', icon: '🪨', color: '#9a948a', category: 'Nature',
    build: (k) => {
      const a = k.sph(0.24, C.STONE, 0, 0.16, 0); a.scale.set(1.1, 0.7, 0.9);
      const b = k.sph(0.16, C.DARKSTONE, 0.16, 0.1, 0.1); b.scale.set(1, 0.8, 1.2);
      const c = k.box(0.18, 0.14, 0.16, C.STONE, -0.14, 0.08, -0.06);
      return k.group(a, b, k.rot(c, 0.2, 0.5, 0.1));
    },
  },
  {
    id: 'boulder', label: 'Boulder', icon: '🪨', color: '#9a948a', category: 'Nature', size: 2,
    build: (k) => {
      const a = k.sph(0.5, C.STONE, 0, 0.34, 0); a.scale.set(1.1, 0.8, 1);
      const b = k.sph(0.34, C.DARKSTONE, 0.3, 0.2, 0.18); b.scale.set(1, 0.9, 1.1);
      const c = k.sph(0.3, C.STONE, -0.28, 0.22, -0.1); c.scale.set(1.2, 0.7, 1);
      return k.group(a, b, c);
    },
  },
  {
    id: 'stalagmite', label: 'Stalagmite', icon: '🔺', color: '#9a948a', category: 'Nature',
    build: (k) => k.group(
      k.cone(0.2, 0.8, C.STONE, 0, 0.4, 0, 8),
      k.cone(0.1, 0.4, C.DARKSTONE, 0.16, 0.2, 0.06, 7),
    ),
  },
  {
    id: 'stalactite', label: 'Stalactite', icon: '🔻', color: '#9a948a', category: 'Nature',
    build: (k) => k.group(
      k.box(0.6, 0.08, 0.6, C.DARKSTONE, 0, 0.96, 0),
      k.rot(k.cone(0.16, 0.7, C.STONE, 0, 0.57, 0, 8), Math.PI, 0, 0),
      k.rot(k.cone(0.08, 0.36, C.STONE, 0.18, 0.74, 0.1, 7), Math.PI, 0, 0),
    ),
  },
  {
    id: 'mushroom', label: 'Mushroom', icon: '🍄', color: '#b23b3b', category: 'Nature',
    build: (k) => {
      const cap = k.sph(0.18, C.RED, 0, 0.34, 0); cap.scale.set(1, 0.6, 1);
      return k.group(
        k.cyl(0.05, 0.07, 0.3, C.BONE, 0, 0.15, 0),
        cap,
        k.sph(0.03, C.BONE, 0.08, 0.36, 0.06),
        k.sph(0.025, C.BONE, -0.06, 0.37, -0.04),
      );
    },
  },
  {
    id: 'mushroom-giant', label: 'Giant Mushroom', icon: '🍄', color: '#a78bfa', category: 'Nature', size: 2,
    build: (k) => {
      const cap = k.sph(0.46, C.MAGIC, 0, 0.78, 0); cap.scale.set(1, 0.55, 1);
      return k.group(
        k.cyl(0.13, 0.18, 0.7, C.BONE, 0, 0.35, 0),
        cap,
        k.sph(0.07, C.BONE, 0.2, 0.82, 0.14),
        k.sph(0.06, C.BONE, -0.18, 0.84, -0.1),
        k.cyl(0.2, 0.2, 0.02, C.DARKLEAF, 0, 0.62, 0),
      );
    },
  },
  {
    id: 'cactus', label: 'Cactus', icon: '🌵', color: '#4a7340', category: 'Nature',
    build: (k) => k.group(
      k.cyl(0.1, 0.12, 0.6, C.GREEN, 0, 0.3, 0),
      k.sph(0.1, C.GREEN, 0, 0.62, 0),
      k.cyl(0.05, 0.06, 0.2, C.GREEN, 0.16, 0.36, 0),
      k.cyl(0.05, 0.06, 0.16, C.GREEN, 0.18, 0.5, 0),
      k.cyl(0.05, 0.06, 0.18, C.GREEN, -0.15, 0.42, 0),
      k.cyl(0.05, 0.06, 0.14, C.GREEN, -0.17, 0.54, 0),
    ),
  },
  {
    id: 'reeds', label: 'Reeds', icon: '🌾', color: '#4a7340', category: 'Nature',
    build: (k) => k.group(
      k.rot(k.cyl(0.012, 0.02, 0.6, C.GREEN, -0.1, 0.3, 0.02), 0, 0, 0.1),
      k.rot(k.cyl(0.012, 0.02, 0.7, C.LEAF, 0, 0.35, 0), 0, 0, -0.05),
      k.rot(k.cyl(0.012, 0.02, 0.55, C.GREEN, 0.1, 0.28, -0.06), 0, 0, -0.12),
      k.rot(k.cyl(0.012, 0.02, 0.64, C.LEAF, 0.04, 0.32, 0.1), 0, 0, 0.08),
      k.cone(0.025, 0.12, C.DIRT, 0, 0.72, 0),
    ),
  },
  {
    id: 'lilypad', label: 'Lily Pad', icon: '🪷', color: '#4a7340', category: 'Nature',
    build: (k) => k.group(
      k.disc(0.34, C.LEAF, 0.02),
      k.disc(0.16, C.DARKLEAF, 0.025),
      k.sph(0.05, C.RED, 0.06, 0.05, 0),
      k.cone(0.06, 0.08, 0xf6c1d4, 0.06, 0.07, 0),
    ),
  },
  {
    id: 'vines', label: 'Hanging Vines', icon: '🌿', color: '#4a7340', category: 'Nature',
    build: (k) => k.group(
      k.box(0.5, 0.04, 0.06, C.DARKWOOD, 0, 0.96, 0),
      k.cyl(0.015, 0.015, 0.7, C.LEAF, -0.18, 0.6, 0),
      k.cyl(0.015, 0.015, 0.9, C.GREEN, -0.04, 0.5, 0.02),
      k.cyl(0.015, 0.015, 0.6, C.LEAF, 0.12, 0.64, -0.02),
      k.cyl(0.015, 0.015, 0.8, C.DARKLEAF, 0.2, 0.54, 0.01),
      k.sph(0.04, C.LEAF, -0.04, 0.06, 0.02),
    ),
  },
  {
    id: 'fountain', label: 'Fountain', icon: '⛲', color: '#9a948a', category: 'Nature',
    build: (k) => k.group(
      k.cyl(0.42, 0.46, 0.16, C.STONE, 0, 0.08, 0),
      k.cyl(0.4, 0.4, 0.02, k.glow(C.WATER, 0.7), 0, 0.17, 0),
      k.cyl(0.08, 0.1, 0.3, C.DARKSTONE, 0, 0.31, 0),
      k.cyl(0.2, 0.22, 0.08, C.STONE, 0, 0.48, 0),
      k.cyl(0.18, 0.18, 0.02, k.glow(C.WATER, 0.7), 0, 0.53, 0),
      k.cyl(0.04, 0.05, 0.16, C.DARKSTONE, 0, 0.6, 0),
      k.sph(0.06, k.glow(C.WATER, 0.7), 0, 0.7, 0),
    ),
  },
  {
    id: 'signpost', label: 'Signpost', icon: '🪧', color: '#6f4f30', category: 'Nature',
    build: (k) => k.group(
      k.cyl(0.04, 0.05, 0.8, C.WOOD, 0, 0.4, 0),
      k.box(0.4, 0.16, 0.04, C.PLANK, 0.06, 0.62, 0.02),
      k.rot(k.box(0.12, 0.16, 0.04, C.PLANK, 0.28, 0.62, 0.02), 0, 0, 0.785),
      k.box(0.3, 0.1, 0.04, C.DARKWOOD, -0.04, 0.4, 0.02),
    ),
  },
  {
    id: 'totem', label: 'Totem Pole', icon: '🗿', color: '#6f4f30', category: 'Nature',
    build: (k) => k.group(
      k.box(0.3, 0.3, 0.28, C.WOOD, 0, 0.15, 0),
      k.box(0.32, 0.06, 0.5, C.DARKWOOD, 0, 0.32, 0),
      k.box(0.28, 0.3, 0.26, C.PLANK, 0, 0.5, 0),
      k.box(0.26, 0.3, 0.24, C.WOOD, 0, 0.78, 0),
      k.box(0.1, 0.06, 0.05, C.DARKWOOD, 0, 0.5, 0.14),
      k.cone(0.18, 0.16, C.DARKLEAF, 0, 1.0, 0, 4),
    ),
  },
  {
    id: 'ore-vein', label: 'Ore Vein', icon: '⛏️', color: '#9a948a', category: 'Nature',
    build: (k) => {
      const a = k.sph(0.3, C.DARKSTONE, 0, 0.2, 0); a.scale.set(1.1, 0.8, 1);
      const b = k.sph(0.18, C.STONE, 0.18, 0.14, 0.12); b.scale.set(1, 0.9, 1.1);
      return k.group(
        a, b,
        k.box(0.06, 0.06, 0.06, k.emit(GEM, 0.95), 0.1, 0.24, 0.16),
        k.box(0.05, 0.05, 0.05, k.emit(GEM, 0.95), -0.12, 0.18, 0.1),
        k.box(0.04, 0.04, 0.04, k.emit(GEM, 0.95), 0.0, 0.3, -0.1),
      );
    },
  },
  {
    id: 'crystal-cluster', label: 'Crystal Cluster', icon: '💎', color: '#a78bfa', category: 'Nature',
    build: (k) => {
      const m = k.emit(C.MAGIC, 0.85);
      return k.group(
        k.cyl(0.18, 0.22, 0.1, C.DARKSTONE, 0, 0.05, 0),
        k.cone(0.07, 0.5, m, 0, 0.3, 0, 5),
        k.rot(k.cone(0.05, 0.34, m, 0.14, 0.18, 0.04, 5), 0, 0, -0.5),
        k.rot(k.cone(0.05, 0.4, m, -0.12, 0.2, -0.04, 5), 0.3, 0, 0.4),
        k.rot(k.cone(0.04, 0.28, k.emit(C.ARCANE, 0.85), 0.04, 0.16, 0.16, 5), -0.4, 0, 0.2),
      );
    },
  },
  {
    id: 'snowdrift', label: 'Snowdrift', icon: '❄️', color: '#f4f7fb', category: 'Nature',
    build: (k) => {
      const a = k.sph(0.4, SNOW, 0, 0.05, 0); a.scale.set(1.3, 0.45, 1);
      const b = k.sph(0.26, SNOW, 0.22, 0.04, 0.1); b.scale.set(1.2, 0.5, 1);
      const c = k.sph(0.24, C.ICE, -0.2, 0.04, -0.08); c.scale.set(1.1, 0.4, 1.1);
      return k.group(a, b, c);
    },
  },
];
