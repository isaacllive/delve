// Arcane / loot / interactive procedural 3D models. Each build() returns a
// THREE.Group in UNIT space (~1 cell, base on y=0, front facing +Z). Builders
// never import 'three' — they only use the passed-in kit (see ./kit.ts).
import type { ModelDef } from './types.ts';
import { C } from './kit.ts';

export const MODELS: ModelDef[] = [
  {
    id: 'portal', label: 'Portal', icon: '🌀', color: '#a78bfa', category: 'Magic',
    build: (k) => {
      const swirl = k.emit(C.MAGIC, 0.55);
      return k.group(
        k.box(0.7, 0.06, 0.16, C.DARKSTONE, 0, 0.03, 0),
        k.rot(k.torus(0.34, 0.05, C.ARCANE, 0, 0.5, 0), Math.PI / 2),
        k.rot(k.torus(0.28, 0.025, swirl, 0, 0.5, 0.01), Math.PI / 2),
        k.rot(k.disc(0.27, k.emit(C.MAGIC, 0.4)), Math.PI / 2),
        k.sph(0.05, k.emit(C.ARCANE, 0.9), 0.15, 0.62, 0.02),
        k.sph(0.04, k.emit(C.ARCANE, 0.9), -0.12, 0.4, 0.02),
      );
    },
  },
  {
    id: 'magic-crystal', label: 'Magic Crystal', icon: '💠', color: '#6ad0ff', category: 'Magic',
    build: (k) => {
      const lit = k.emit(C.ARCANE, 0.85);
      return k.group(
        k.cyl(0.18, 0.24, 0.08, C.DARKSTONE, 0, 0.04, 0, 6),
        k.torus(0.14, 0.02, k.emit(C.MAGIC, 0.6), 0, 0.06, 0),
        k.rot(k.cone(0.1, 0.34, lit, 0, 0.62, 0, 6), Math.PI, 0, 0),
        k.cone(0.1, 0.34, lit, 0, 0.46, 0, 6),
        k.sph(0.03, k.emit(C.ARCANE, 0.9), 0.16, 0.5, 0.1),
        k.sph(0.025, k.emit(C.MAGIC, 0.9), -0.14, 0.7, -0.08),
      );
    },
  },
  {
    id: 'rune-stone', label: 'Rune Stone', icon: '🪨', color: '#9a948a', category: 'Magic',
    build: (k) => {
      const r = k.emit(C.ARCANE, 0.95);
      return k.group(
        k.box(0.4, 0.08, 0.3, C.DARKSTONE, 0, 0.04, 0),
        k.rot(k.box(0.34, 0.62, 0.16, C.STONE, 0, 0.4, 0), 0, 0, 0.04),
        k.box(0.06, 0.12, 0.02, r, -0.06, 0.5, 0.09),
        k.box(0.1, 0.04, 0.02, r, 0.05, 0.42, 0.09),
        k.box(0.04, 0.16, 0.02, r, 0.07, 0.34, 0.09),
        k.box(0.08, 0.06, 0.02, r, -0.05, 0.26, 0.09),
      );
    },
  },
  {
    id: 'summoning-circle', label: 'Summoning Circle', icon: '⭕', color: '#a78bfa', category: 'Magic',
    build: (k) => {
      const r = k.emit(C.MAGIC, 0.7);
      return k.group(
        k.disc(0.45, k.emit(C.MAGIC, 0.18), 0.01),
        k.rot(k.torus(0.42, 0.012, r, 0, 0.02, 0), Math.PI / 2),
        k.rot(k.torus(0.3, 0.012, r, 0, 0.02, 0), Math.PI / 2),
        k.box(0.03, 0.005, 0.12, r, 0.36, 0.025, 0),
        k.box(0.03, 0.005, 0.12, r, -0.36, 0.025, 0),
        k.box(0.12, 0.005, 0.03, r, 0, 0.025, 0.36),
        k.box(0.12, 0.005, 0.03, r, 0, 0.025, -0.36),
      );
    },
  },
  {
    id: 'spellbook', label: 'Spellbook', icon: '📖', color: '#8a6f4a', category: 'Magic',
    build: (k) => {
      return k.group(
        k.box(0.34, 0.5, 0.3, C.DARKWOOD, 0, 0.25, 0),
        k.cyl(0.02, 0.02, 0.46, C.WOOD, -0.2, 0.62, -0.16),
        k.cyl(0.02, 0.02, 0.46, C.WOOD, 0.2, 0.62, -0.16),
        k.rot(k.box(0.4, 0.04, 0.34, C.WOOD, 0, 0.56, 0.04), 0.32, 0, 0),
        k.rot(k.box(0.18, 0.012, 0.3, C.PARCH, -0.1, 0.6, 0.04), 0.32, 0, 0),
        k.rot(k.box(0.18, 0.012, 0.3, C.PARCH, 0.1, 0.6, 0.04), 0.32, 0, 0),
        k.rot(k.box(0.06, 0.013, 0.16, k.emit(C.ARCANE, 0.8), 0.1, 0.61, 0.04), 0.32, 0, 0),
      );
    },
  },
  {
    id: 'scroll-stack', label: 'Scroll Stack', icon: '📜', color: '#cabf94', category: 'Magic',
    build: (k) => {
      const paper = C.PARCH;
      return k.group(
        k.rot(k.cyl(0.05, 0.05, 0.46, paper, -0.08, 0.06, 0.04), 0, 0, Math.PI / 2),
        k.rot(k.cyl(0.05, 0.05, 0.44, paper, 0.1, 0.06, -0.06), 0, 0.4, Math.PI / 2),
        k.rot(k.cyl(0.045, 0.045, 0.42, paper, 0, 0.15, 0), 0, 0.15, Math.PI / 2),
        k.rot(k.torus(0.052, 0.012, C.RED, -0.08, 0.06, 0.04), 0, 0, Math.PI / 2),
        k.rot(k.torus(0.047, 0.012, C.BLUE, 0, 0.15, 0), 0, 0.15, Math.PI / 2),
      );
    },
  },
  {
    id: 'crystal-ball', label: 'Crystal Ball', icon: '🔮', color: '#a78bfa', category: 'Magic',
    build: (k) => {
      return k.group(
        k.cyl(0.16, 0.22, 0.1, C.DARKWOOD, 0, 0.05, 0),
        k.cyl(0.13, 0.13, 0.06, C.GOLD, 0, 0.13, 0),
        k.torus(0.12, 0.02, C.GOLD, 0, 0.18, 0),
        k.sph(0.18, k.mat(C.GLASS, { opacity: 0.4, rough: 0.1 }), 0, 0.34, 0),
        k.sph(0.07, k.emit(C.MAGIC, 0.85), 0, 0.34, 0),
        k.sph(0.02, k.emit(C.ARCANE, 0.9), 0.05, 0.4, 0.05),
      );
    },
  },
  {
    id: 'potion-rack', label: 'Potion Rack', icon: '🧪', color: '#86d36a', category: 'Magic',
    build: (k) => {
      const bottle = (x: number, col: number) => k.group(
        k.cyl(0.04, 0.05, 0.12, k.mat(C.GLASS, { opacity: 0.45 }), x, 0.24, 0),
        k.sph(0.045, k.emit(col, 0.8), x, 0.22, 0),
        k.cyl(0.02, 0.02, 0.05, C.CLOTH, x, 0.32, 0),
      );
      return k.group(
        k.box(0.5, 0.04, 0.2, C.DARKWOOD, 0, 0.02, 0),
        k.box(0.5, 0.04, 0.2, C.DARKWOOD, 0, 0.16, 0),
        k.box(0.02, 0.18, 0.2, C.WOOD, -0.24, 0.1, 0),
        k.box(0.02, 0.18, 0.2, C.WOOD, 0.24, 0.1, 0),
        bottle(-0.15, C.ACID), bottle(0, C.RED), bottle(0.15, C.ARCANE),
      );
    },
  },
  {
    id: 'alchemy-table', label: 'Alchemy Table', icon: '⚗️', color: '#9aa3ad', category: 'Magic',
    build: (k) => {
      return k.group(
        k.box(0.7, 0.05, 0.42, C.WOOD, 0, 0.5, 0),
        k.box(0.05, 0.5, 0.05, C.DARKWOOD, -0.3, 0.25, -0.16),
        k.box(0.05, 0.5, 0.05, C.DARKWOOD, 0.3, 0.25, -0.16),
        k.box(0.05, 0.5, 0.05, C.DARKWOOD, -0.3, 0.25, 0.16),
        k.box(0.05, 0.5, 0.05, C.DARKWOOD, 0.3, 0.25, 0.16),
        k.cyl(0.02, 0.1, 0.16, k.mat(C.GLASS, { opacity: 0.45 }), -0.18, 0.61, 0),
        k.sph(0.07, k.emit(C.ACID, 0.8), -0.18, 0.56, 0),
        k.cyl(0.07, 0.07, 0.12, k.mat(C.GLASS, { opacity: 0.45 }), 0.12, 0.59, 0.05),
        k.sph(0.05, k.emit(C.MAGIC, 0.8), 0.12, 0.57, 0.05),
        k.cyl(0.03, 0.03, 0.18, C.GLASS, 0.28, 0.62, -0.06),
      );
    },
  },
  {
    id: 'coin-pile', label: 'Coin Pile', icon: '🪙', color: '#d4af37', category: 'Loot',
    build: (k) => {
      const stack = (x: number, z: number, n: number) => k.group(
        ...Array.from({ length: n }, (_, i) =>
          k.cyl(0.07, 0.07, 0.02, C.GOLD, x, 0.02 + i * 0.022, z, 16)),
      );
      return k.group(
        k.disc(0.34, C.GOLD, 0.01),
        stack(-0.1, 0.05, 4), stack(0.08, -0.06, 3), stack(0.02, 0.12, 2),
        k.cyl(0.07, 0.07, 0.02, C.GOLD, 0.18, 0.02, 0.08, 16),
        k.rot(k.cyl(0.07, 0.07, 0.02, C.GOLD, -0.18, 0.03, -0.1, 16), 0.4, 0, 0.2),
      );
    },
  },
  {
    id: 'gem-pile', label: 'Gem Pile', icon: '💎', color: '#6ad0ff', category: 'Loot',
    build: (k) => {
      const gem = (x: number, y: number, z: number, col: number, r: number) => k.group(
        k.cone(r, r * 1.6, k.emit(col, 0.85), x, y, z, 5),
        k.rot(k.cone(r, r * 0.8, k.emit(col, 0.85), x, y - r * 1.2, z, 5), Math.PI, 0, 0),
      );
      return k.group(
        k.disc(0.3, C.DARKSTONE, 0.01),
        gem(-0.1, 0.14, 0.05, C.ARCANE, 0.08),
        gem(0.1, 0.12, -0.04, C.RED, 0.07),
        gem(0.02, 0.16, 0.14, C.ACID, 0.06),
        gem(0.16, 0.1, 0.12, C.MAGIC, 0.05),
        gem(-0.16, 0.1, -0.1, C.GOLD, 0.06),
      );
    },
  },
  {
    id: 'gold-bars', label: 'Gold Bars', icon: '🟨', color: '#d4af37', category: 'Loot',
    build: (k) => {
      const bar = (x: number, y: number, z: number, ry: number) =>
        k.rot(k.box(0.26, 0.08, 0.13, C.GOLD, x, y, z), 0, ry, 0);
      return k.group(
        bar(-0.07, 0.04, 0, 0),
        bar(0.09, 0.04, 0.02, 0.15),
        bar(0.0, 0.12, 0.0, 0.05),
        bar(0.02, 0.2, -0.01, -0.1),
        k.box(0.02, 0.005, 0.06, k.emit(C.EMBER, 0.6), 0.0, 0.24, 0.04),
      );
    },
  },
  {
    id: 'treasure-pile', label: 'Treasure Pile', icon: '💰', color: '#d4af37', category: 'Loot', size: 2,
    build: (k) => {
      const coinStack = (x: number, z: number, n: number) => k.group(
        ...Array.from({ length: n }, (_, i) =>
          k.cyl(0.08, 0.08, 0.022, C.GOLD, x, 0.02 + i * 0.024, z, 16)),
      );
      return k.group(
        k.disc(0.55, C.GOLD, 0.01),
        coinStack(-0.2, 0.1, 4), coinStack(0.18, -0.12, 5), coinStack(0.05, 0.22, 3),
        k.cone(0.09, 0.16, k.emit(C.ARCANE, 0.85), -0.05, 0.16, -0.05, 5),
        k.cone(0.06, 0.1, k.emit(C.RED, 0.85), 0.22, 0.12, 0.1, 5),
        k.cyl(0.06, 0.04, 0.14, C.GOLD, -0.28, 0.1, -0.18),
        k.cyl(0.09, 0.06, 0.03, C.GOLD, -0.28, 0.04, -0.18),
        k.rot(k.cyl(0.07, 0.07, 0.022, C.GOLD, 0.3, 0.04, 0.24, 16), 0.5, 0, 0.3),
      );
    },
  },
  {
    id: 'idol', label: 'Idol', icon: '🗿', color: '#d4af37', category: 'Loot',
    build: (k) => {
      const g = k.mat(C.GOLD, { metal: 0.8, rough: 0.3 });
      return k.group(
        k.box(0.34, 0.1, 0.34, C.DARKSTONE, 0, 0.05, 0),
        k.box(0.26, 0.06, 0.26, C.STONE, 0, 0.13, 0),
        k.box(0.16, 0.26, 0.12, g, 0, 0.29, 0),
        k.sph(0.1, g, 0, 0.46, 0),
        k.rot(k.box(0.1, 0.18, 0.04, g, -0.14, 0.32, 0.02), 0, 0, 0.5),
        k.rot(k.box(0.1, 0.18, 0.04, g, 0.14, 0.32, 0.02), 0, 0, -0.5),
        k.sph(0.02, k.emit(C.RED, 0.9), 0, 0.48, 0.08),
      );
    },
  },
  {
    id: 'lever', label: 'Lever', icon: '🎚️', color: '#9aa3ad', category: 'Magic',
    build: (k) => {
      return k.group(
        k.box(0.3, 0.08, 0.2, C.IRON, 0, 0.04, 0),
        k.cyl(0.04, 0.04, 0.1, C.STEEL, 0, 0.1, 0),
        k.rot(k.cyl(0.025, 0.025, 0.4, C.WOOD, 0.08, 0.26, 0), 0, 0, -0.5),
        k.sph(0.06, C.RED, 0.18, 0.42, 0),
      );
    },
  },
  {
    id: 'pressure-plate', label: 'Pressure Plate', icon: '▣', color: '#5d5a54', category: 'Magic',
    build: (k) => {
      return k.group(
        k.box(0.6, 0.02, 0.6, C.DARKSTONE, 0, 0.01, 0),
        k.box(0.46, 0.04, 0.46, C.STONE, 0, 0.03, 0),
        k.box(0.4, 0.01, 0.4, C.DARKSTONE, 0, 0.055, 0),
        k.box(0.42, 0.005, 0.02, k.emit(C.ARCANE, 0.4), 0, 0.052, 0.21),
        k.box(0.42, 0.005, 0.02, k.emit(C.ARCANE, 0.4), 0, 0.052, -0.21),
      );
    },
  },
  {
    id: 'bell', label: 'Bell', icon: '🔔', color: '#d4af37', category: 'Magic',
    build: (k) => {
      const m = k.mat(C.GOLD, { metal: 0.7, rough: 0.3 });
      return k.group(
        k.box(0.08, 0.5, 0.08, C.DARKWOOD, -0.22, 0.25, 0),
        k.box(0.08, 0.5, 0.08, C.DARKWOOD, 0.22, 0.25, 0),
        k.box(0.56, 0.08, 0.08, C.WOOD, 0, 0.52, 0),
        k.cyl(0.16, 0.2, 0.24, m, 0, 0.36, 0),
        k.cyl(0.2, 0.22, 0.04, m, 0, 0.24, 0),
        k.torus(0.04, 0.015, C.IRON, 0, 0.5, 0),
        k.sph(0.05, C.STEEL, 0, 0.24, 0),
      );
    },
  },
  {
    id: 'beacon', label: 'Beacon', icon: '🔥', color: '#ff7a2a', category: 'Magic',
    build: (k) => {
      return k.group(
        k.cyl(0.18, 0.24, 0.08, C.DARKSTONE, 0, 0.04, 0),
        k.cyl(0.07, 0.09, 0.7, C.IRON, 0, 0.43, 0),
        k.cyl(0.16, 0.1, 0.12, C.IRON, 0, 0.82, 0),
        k.sph(0.13, k.emit(C.FIRE, 0.85), 0, 0.92, 0),
        k.cone(0.1, 0.22, k.emit(C.EMBER, 0.8), 0, 1.05, 0, 8),
        k.cone(0.05, 0.12, k.emit(C.FIRE, 0.9), 0, 1.12, 0, 8),
      );
    },
  },
  {
    id: 'ward-stone', label: 'Ward Stone', icon: '🛡️', color: '#6ad0ff', category: 'Magic',
    build: (k) => {
      const s = k.emit(C.ARCANE, 0.9);
      return k.group(
        k.cyl(0.2, 0.26, 0.1, C.DARKSTONE, 0, 0.05, 0, 6),
        k.cyl(0.16, 0.18, 0.56, C.STONE, 0, 0.38, 0, 6),
        k.cone(0.18, 0.16, C.STONE, 0, 0.74, 0, 6),
        k.rot(k.torus(0.1, 0.018, s, 0, 0.42, 0.155), Math.PI / 2, 0, 0),
        k.box(0.02, 0.16, 0.01, s, 0, 0.42, 0.16),
        k.box(0.12, 0.02, 0.01, s, 0, 0.42, 0.16),
      );
    },
  },
  {
    id: 'soul-gem', label: 'Soul Gem', icon: '💜', color: '#a78bfa', category: 'Loot',
    build: (k) => {
      const claw = (ry: number) => k.rot(
        k.rot(k.cone(0.03, 0.26, C.IRON, 0, 0.34, 0.13, 5), -0.5, 0, 0), 0, ry, 0);
      return k.group(
        k.cyl(0.14, 0.18, 0.08, C.IRON, 0, 0.04, 0),
        k.cyl(0.05, 0.08, 0.16, C.STEEL, 0, 0.14, 0),
        claw(0), claw(Math.PI / 2), claw(Math.PI), claw(-Math.PI / 2),
        k.sph(0.04, k.emit(C.MAGIC, 0.6), 0, 0.42, 0),
        k.rot(k.cone(0.08, 0.2, k.emit(C.MAGIC, 0.9), 0, 0.46, 0, 6), Math.PI, 0, 0),
        k.cone(0.08, 0.18, k.emit(C.MAGIC, 0.9), 0, 0.34, 0, 6),
      );
    },
  },
  {
    id: 'telescope', label: 'Telescope', icon: '🔭', color: '#9aa3ad', category: 'Magic',
    build: (k) => {
      const leg = (x: number, z: number) =>
        k.rot(k.cyl(0.02, 0.02, 0.6, C.DARKWOOD, x, 0.28, z), x ? 0 : 0.3, 0, x ? (x > 0 ? -0.35 : 0.35) : 0);
      return k.group(
        leg(-0.18, -0.1), leg(0.18, -0.1), leg(0, 0.2),
        k.sph(0.05, C.IRON, 0, 0.5, 0),
        k.rot(k.cyl(0.06, 0.08, 0.42, C.STEEL, 0, 0.6, 0), 0.6, 0, 0),
        k.rot(k.cyl(0.05, 0.06, 0.16, C.GOLD, 0.0, 0.74, 0.18), 0.6, 0, 0),
        k.rot(k.disc(0.05, k.emit(C.ARCANE, 0.7)), Math.PI / 2 + 0.6, 0, 0),
      );
    },
  },
  {
    id: 'obelisk-arcane', label: 'Arcane Obelisk', icon: '🗿', color: '#6ad0ff', category: 'Magic', size: 1,
    build: (k) => {
      const s = k.emit(C.ARCANE, 0.8);
      return k.group(
        k.box(0.34, 0.08, 0.34, C.DARKSTONE, 0, 0.04, 0),
        k.box(0.22, 1.0, 0.22, C.STONE, 0, 0.56, 0),
        k.cone(0.16, 0.18, C.DARKSTONE, 0, 1.13, 0, 4),
        k.box(0.005, 0.9, 0.005, s, 0.111, 0.56, 0.111),
        k.box(0.005, 0.9, 0.005, s, -0.111, 0.56, -0.111),
        k.box(0.23, 0.005, 0.005, s, 0, 0.9, 0.111),
        k.sph(0.05, k.emit(C.MAGIC, 0.9), 0, 1.16, 0),
      );
    },
  },
  {
    id: 'floating-runes', label: 'Floating Runes', icon: '🔯', color: '#a78bfa', category: 'Magic',
    build: (k) => {
      const rune = (a: number, col: number) => {
        const x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.3;
        return k.rot(k.group(
          k.box(0.12, 0.16, 0.012, k.emit(col, 0.35), x, 0.5, z),
          k.box(0.05, 0.1, 0.014, k.emit(col, 0.9), x, 0.5, z),
        ), 0, -a, 0);
      };
      return k.group(
        k.disc(0.2, k.emit(C.MAGIC, 0.15), 0.02),
        rune(0, C.ARCANE), rune((Math.PI * 2) / 3, C.MAGIC), rune((Math.PI * 4) / 3, C.ACID),
        k.sph(0.03, k.emit(C.ARCANE, 0.9), 0, 0.5, 0),
      );
    },
  },
];
