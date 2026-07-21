// Procedural 3D builders for traps, hazards, and ground markers.
// Most of these are FLAT ground markers: a glowing/translucent disc or tile
// sitting just above y=0, sometimes with a few low props. Built in UNIT space
// (~1 cell, base y=0, front +Z). Never imports 'three' directly.
import type { ModelDef } from './types.ts';
import { C } from './kit.ts';

export const MODELS: ModelDef[] = [
  {
    id: 'fire-patch', label: 'Fire Patch', icon: '🔥', color: '#ff7a2a', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.46, kit.emit(C.FIRE, 0.45), 0.04),
      kit.cone(0.13, 0.36, kit.emit(C.FIRE), 0, 0.18, 0),
      kit.cone(0.1, 0.28, kit.emit(C.EMBER), 0.18, 0.14, 0.08),
      kit.cone(0.11, 0.3, kit.emit(C.FIRE), -0.16, 0.15, -0.06),
      kit.cone(0.08, 0.22, kit.emit(C.EMBER), 0.04, 0.11, -0.18),
    ),
  },
  {
    id: 'smoke-cloud', label: 'Smoke Cloud', icon: '💨', color: '#9a9a9a', category: 'Hazard',
    build: (kit) => kit.group(
      kit.sph(0.28, kit.mat(C.SMOKE, { opacity: 0.5 }), 0, 0.32, 0),
      kit.sph(0.22, kit.mat(C.SMOKE, { opacity: 0.5 }), 0.26, 0.38, 0.06),
      kit.sph(0.2, kit.mat(C.SMOKE, { opacity: 0.5 }), -0.24, 0.36, -0.04),
      kit.sph(0.18, kit.mat(C.SMOKE, { opacity: 0.45 }), 0.05, 0.52, 0.12),
      kit.sph(0.16, kit.mat(C.SMOKE, { opacity: 0.45 }), -0.12, 0.5, 0.14),
    ),
  },
  {
    id: 'fog-cloud', label: 'Fog Cloud', icon: '🌫', color: '#cfd6dd', category: 'Hazard',
    build: (kit) => kit.group(
      kit.sph(0.3, kit.mat(C.FOG, { opacity: 0.38 }), 0, 0.18, 0),
      kit.sph(0.26, kit.mat(C.FOG, { opacity: 0.38 }), 0.28, 0.2, 0.1),
      kit.sph(0.24, kit.mat(C.FOG, { opacity: 0.36 }), -0.28, 0.18, -0.06),
      kit.sph(0.22, kit.mat(C.FOG, { opacity: 0.36 }), 0.04, 0.22, -0.26),
      kit.sph(0.2, kit.mat(C.FOG, { opacity: 0.34 }), -0.1, 0.24, 0.28),
    ),
  },
  {
    id: 'poison-gas', label: 'Poison Gas', icon: '☠', color: '#86d36a', category: 'Hazard',
    build: (kit) => kit.group(
      kit.sph(0.26, kit.mat(C.POISON, { opacity: 0.45 }), 0, 0.24, 0),
      kit.sph(0.22, kit.mat(C.POISON, { opacity: 0.45 }), 0.26, 0.3, 0.08),
      kit.sph(0.2, kit.mat(C.POISON, { opacity: 0.42 }), -0.24, 0.28, -0.06),
      kit.sph(0.18, kit.mat(C.POISON, { opacity: 0.42 }), 0.06, 0.42, 0.14),
      kit.sph(0.15, kit.mat(C.POISON, { opacity: 0.4 }), -0.14, 0.4, 0.1),
    ),
  },
  {
    id: 'acid-pool', label: 'Acid Pool', icon: '🟢', color: '#7bd23a', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.46, kit.emit(C.ACID, 0.45), 0.04),
      kit.sph(0.07, kit.emit(C.ACID), 0.14, 0.08, 0.1),
      kit.sph(0.05, kit.emit(C.ACID), -0.18, 0.06, -0.06),
      kit.sph(0.06, kit.emit(C.ACID), 0.02, 0.07, -0.2),
    ),
  },
  {
    id: 'lava-pool', label: 'Lava Pool', icon: '🌋', color: '#ff5a1e', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.42, kit.emit(C.LAVA, 0.6), 0.04),
      kit.rot(kit.torus(0.42, 0.05, C.DARKSTONE, 0, 0.05, 0), -Math.PI / 2, 0, 0),
      kit.sph(0.06, kit.emit(C.EMBER), 0.12, 0.07, 0.08),
      kit.sph(0.05, kit.emit(C.EMBER), -0.14, 0.06, -0.1),
    ),
  },
  {
    id: 'ice-patch', label: 'Ice Patch', icon: '🧊', color: '#bfe3ff', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.46, kit.mat(C.ICE, { opacity: 0.5, rough: 0.2 }), 0.04),
      kit.cone(0.07, 0.22, kit.mat(C.ICE, { opacity: 0.7 }), 0.14, 0.11, 0.08),
      kit.cone(0.05, 0.16, kit.mat(C.ICE, { opacity: 0.7 }), -0.16, 0.08, -0.04),
      kit.cone(0.06, 0.18, kit.mat(C.ICE, { opacity: 0.7 }), 0.02, 0.09, -0.18),
    ),
  },
  {
    id: 'water-tile', label: 'Water Tile', icon: '💧', color: '#3b6ea5', category: 'Hazard',
    build: (kit) => kit.group(
      kit.tile(0.92, 0.92, kit.glow(C.WATER, 0.45), 0.04),
    ),
  },
  {
    id: 'deep-water', label: 'Deep Water', icon: '💧', color: '#244e7a', category: 'Hazard',
    build: (kit) => kit.group(
      kit.tile(0.94, 0.94, kit.glow(0x244e7a, 0.55), 0.03),
      kit.tile(0.5, 0.5, kit.glow(C.WATER, 0.35), 0.05),
    ),
  },
  {
    id: 'mud-patch', label: 'Mud Patch', icon: '🟤', color: '#6b5236', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.46, kit.mat(C.DIRT, { rough: 0.95 }), 0.04),
      kit.disc(0.22, kit.mat(C.BARK, { rough: 0.95 }), 0.05),
    ),
  },
  {
    id: 'quicksand', label: 'Quicksand', icon: '🟤', color: '#b07a4e', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.46, kit.mat(C.CLAY, { rough: 0.95 }), 0.04),
      kit.rot(kit.torus(0.3, 0.02, C.DIRT, 0, 0.05, 0), -Math.PI / 2, 0, 0),
      kit.rot(kit.torus(0.18, 0.02, C.DIRT, 0, 0.05, 0), -Math.PI / 2, 0, 0),
      kit.rot(kit.torus(0.07, 0.02, C.DIRT, 0, 0.05, 0), -Math.PI / 2, 0, 0),
    ),
  },
  {
    id: 'web-area', label: 'Web Area', icon: '🕸', color: '#e8e2d0', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.46, kit.mat(C.BONE, { opacity: 0.18 }), 0.03),
      kit.box(0.9, 0.01, 0.02, kit.mat(C.BONE, { opacity: 0.8 }), 0, 0.05, 0),
      kit.rot(kit.box(0.9, 0.01, 0.02, kit.mat(C.BONE, { opacity: 0.8 }), 0, 0.05, 0), 0, Math.PI / 2, 0),
      kit.rot(kit.box(0.9, 0.01, 0.02, kit.mat(C.BONE, { opacity: 0.8 }), 0, 0.05, 0), 0, Math.PI / 4, 0),
      kit.rot(kit.box(0.9, 0.01, 0.02, kit.mat(C.BONE, { opacity: 0.8 }), 0, 0.05, 0), 0, -Math.PI / 4, 0),
    ),
  },
  {
    id: 'spike-trap', label: 'Spike Trap', icon: '▲', color: '#55585e', category: 'Hazard',
    build: (kit) => kit.group(
      kit.box(0.8, 0.06, 0.8, C.DARKSTONE, 0, 0.03, 0),
      kit.cone(0.06, 0.3, C.IRON, 0.18, 0.18, 0.18),
      kit.cone(0.06, 0.3, C.IRON, -0.18, 0.18, 0.18),
      kit.cone(0.06, 0.3, C.IRON, 0.18, 0.18, -0.18),
      kit.cone(0.06, 0.3, C.IRON, -0.18, 0.18, -0.18),
      kit.cone(0.06, 0.32, C.STEEL, 0, 0.19, 0),
    ),
  },
  {
    id: 'pit', label: 'Pit', icon: '⬛', color: '#2a2a2a', category: 'Hazard',
    build: (kit) => kit.group(
      kit.tile(0.78, 0.78, kit.mat(0x14140f, { rough: 1 }), 0.02),
      kit.box(0.88, 0.08, 0.08, C.DARKSTONE, 0, 0.04, 0.4),
      kit.box(0.88, 0.08, 0.08, C.DARKSTONE, 0, 0.04, -0.4),
      kit.box(0.08, 0.08, 0.72, C.DARKSTONE, 0.4, 0.04, 0),
      kit.box(0.08, 0.08, 0.72, C.DARKSTONE, -0.4, 0.04, 0),
    ),
  },
  {
    id: 'caltrops', label: 'Caltrops', icon: '✦', color: '#9aa3ad', category: 'Hazard',
    build: (kit) => kit.group(
      kit.cone(0.06, 0.16, C.METAL, 0.16, 0.08, 0.1, 4),
      kit.cone(0.06, 0.16, C.METAL, -0.2, 0.08, 0.04, 4),
      kit.cone(0.06, 0.16, C.METAL, 0.06, 0.08, -0.2, 4),
      kit.cone(0.06, 0.16, C.METAL, -0.1, 0.08, 0.22, 4),
      kit.cone(0.06, 0.16, C.METAL, 0.22, 0.08, -0.14, 4),
      kit.cone(0.06, 0.16, C.METAL, 0, 0.08, 0.02, 4),
    ),
  },
  {
    id: 'bear-trap', label: 'Bear Trap', icon: '🪤', color: '#55585e', category: 'Hazard',
    build: (kit) => kit.group(
      kit.cyl(0.26, 0.26, 0.05, C.IRON, 0, 0.03, 0),
      kit.rot(kit.torus(0.24, 0.03, C.STEEL, 0, 0.08, 0.14), -Math.PI / 2.6, 0, 0),
      kit.rot(kit.torus(0.24, 0.03, C.STEEL, 0, 0.08, -0.14), Math.PI / 2.6, 0, 0),
      kit.cone(0.04, 0.14, C.STEEL, 0.12, 0.1, 0, 4),
      kit.cone(0.04, 0.14, C.STEEL, -0.12, 0.1, 0, 4),
      kit.box(0.06, 0.04, 0.3, C.IRON, 0.34, 0.04, 0),
      kit.cyl(0.03, 0.03, 0.18, C.IRON, 0.46, 0.04, 0),
    ),
  },
  {
    id: 'thorn-patch', label: 'Thorn Patch', icon: '🌵', color: '#2f4f2c', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.42, kit.mat(C.DARKLEAF, { rough: 0.9 }), 0.04),
      kit.cone(0.03, 0.34, C.DARKLEAF, 0.16, 0.17, 0.1),
      kit.cone(0.03, 0.28, C.LEAF, -0.18, 0.14, 0.04),
      kit.cone(0.03, 0.36, C.DARKLEAF, 0.04, 0.18, -0.18),
      kit.cone(0.03, 0.3, C.LEAF, -0.06, 0.15, 0.22),
      kit.cone(0.03, 0.26, C.DARKLEAF, 0.22, 0.13, -0.1),
    ),
  },
  {
    id: 'blood-stain', label: 'Blood Stain', icon: '🩸', color: '#6e1f1f', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.4, kit.mat(0x6e1f1f, { rough: 0.6 }), 0.03),
      kit.disc(0.12, kit.mat(0x8a2a2a, { rough: 0.6 }), 0.04, 12),
      kit.disc(0.08, kit.mat(0x6e1f1f, { rough: 0.6 }), 0.04, 10),
      kit.disc(0.06, kit.mat(0x6e1f1f, { rough: 0.6 }), 0.04, 8),
    ),
  },
  {
    id: 'slime-puddle', label: 'Slime Puddle', icon: '🟢', color: '#86d36a', category: 'Hazard',
    build: (kit) => {
      const dome = kit.sph(0.42, kit.mat(C.POISON, { opacity: 0.55, rough: 0.4 }), 0, -0.26, 0);
      dome.scale.y = 0.45;
      return kit.group(
        kit.disc(0.44, kit.mat(C.POISON, { opacity: 0.45 }), 0.03),
        dome,
      );
    },
  },
  {
    id: 'rune-trap', label: 'Rune Trap', icon: '✶', color: '#a78bfa', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.44, kit.mat(C.DARKSTONE, { rough: 0.85 }), 0.03),
      kit.rot(kit.torus(0.34, 0.02, kit.emit(C.MAGIC, 0.9), 0, 0.05, 0), -Math.PI / 2, 0, 0),
      kit.box(0.4, 0.012, 0.03, kit.emit(C.MAGIC, 0.9), 0, 0.05, 0),
      kit.rot(kit.box(0.4, 0.012, 0.03, kit.emit(C.MAGIC, 0.9), 0, 0.05, 0), 0, Math.PI / 3, 0),
      kit.rot(kit.box(0.4, 0.012, 0.03, kit.emit(C.MAGIC, 0.9), 0, 0.05, 0), 0, -Math.PI / 3, 0),
    ),
  },
  {
    id: 'grease-patch', label: 'Grease Patch', icon: '🛢', color: '#3a3326', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.46, kit.mat(0x3a3326, { rough: 0.15, metal: 0.6, opacity: 0.85 }), 0.04),
      kit.disc(0.2, kit.mat(0x5a4f33, { rough: 0.1, metal: 0.7, opacity: 0.7 }), 0.05),
    ),
  },
  {
    id: 'spike-growth', label: 'Spike Growth', icon: '🪨', color: '#9a948a', category: 'Hazard',
    build: (kit) => kit.group(
      kit.disc(0.44, kit.mat(C.DARKSTONE, { rough: 0.95 }), 0.04),
      kit.cone(0.07, 0.32, C.STONE, 0.16, 0.16, 0.1, 6),
      kit.cone(0.06, 0.26, C.STONE, -0.18, 0.13, 0.02, 6),
      kit.cone(0.07, 0.34, C.STONE, 0.04, 0.17, -0.18, 6),
      kit.cone(0.05, 0.22, C.STONE, -0.08, 0.11, 0.22, 6),
      kit.cone(0.06, 0.28, C.STONE, 0.22, 0.14, -0.08, 6),
    ),
  },
  {
    id: 'magic-darkness', label: 'Magic Darkness', icon: '🌑', color: '#1a1626', category: 'Hazard',
    build: (kit) => {
      const dome = kit.sph(0.46, kit.mat(0x1a1626, { opacity: 0.6, rough: 0.9 }), 0, -0.18, 0);
      dome.scale.y = 0.6;
      return kit.group(
        kit.disc(0.46, kit.mat(0x120f1c, { opacity: 0.7 }), 0.03),
        dome,
      );
    },
  },
];
