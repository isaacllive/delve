// The original built-in props, ported into the model registry. Builders use
// the shared kit (THREE primitives) and the per-token tint `color`.
import { C } from './kit.ts';
import type { ModelDef } from './types.ts';

export const MODELS: ModelDef[] = [
  { id: 'sword', label: 'Sword', icon: '🗡', color: '#c3ccd6', category: 'Gear', build: (k, color) =>
    k.group(k.box(0.05, 0.5, 0.015, C.STEEL, 0, 0.5, 0), k.box(0.24, 0.04, 0.05, color, 0, 0.24, 0), k.cyl(0.025, 0.025, 0.14, C.WOOD, 0, 0.16, 0), k.sph(0.045, C.GOLD, 0, 0.07, 0)) },
  { id: 'shield', label: 'Shield', icon: '🛡', color: '#9a6a3a', category: 'Gear', build: (k, color) =>
    k.group(k.rot(k.cyl(0.3, 0.3, 0.06, color, 0, 0.34, 0, 20), Math.PI / 2), k.sph(0.07, C.STEEL, 0, 0.34, 0)) },
  { id: 'potion', label: 'Potion', icon: '🧪', color: '#5ad1a0', category: 'Gear', build: (k, color) =>
    k.group(k.sph(0.16, color, 0, 0.18, 0), k.cyl(0.05, 0.07, 0.1, 0x9ad0c0, 0, 0.34, 0), k.cyl(0.05, 0.05, 0.05, C.WOOD, 0, 0.41, 0)) },
  { id: 'chest', label: 'Chest', icon: '🧰', color: '#8a5a2b', category: 'Containers', build: (k, color) =>
    k.group(k.box(0.6, 0.32, 0.4, C.WOOD, 0, 0.16, 0), k.box(0.62, 0.16, 0.42, color, 0, 0.4, 0), k.box(0.1, 0.12, 0.05, C.GOLD, 0, 0.3, 0.21)) },
  { id: 'barrel', label: 'Barrel', icon: '🛢', color: '#7c5230', category: 'Containers', build: (k, color) =>
    k.group(k.cyl(0.26, 0.3, 0.6, color, 0, 0.3, 0, 16), k.cyl(0.32, 0.32, 0.04, 0x3a3a3a, 0, 0.12, 0, 16), k.cyl(0.32, 0.32, 0.04, 0x3a3a3a, 0, 0.48, 0, 16)) },
  { id: 'crate', label: 'Crate', icon: '📦', color: '#9c7a48', category: 'Containers', build: (k, color) =>
    k.group(k.box(0.56, 0.56, 0.56, color, 0, 0.28, 0), k.box(0.6, 0.06, 0.06, C.WOOD, 0, 0.5, 0), k.box(0.06, 0.6, 0.06, C.WOOD, 0, 0.28, 0)) },
  { id: 'torch', label: 'Torch', icon: '🔥', color: '#ffaa55', category: 'Dressing', build: (k) =>
    k.group(k.cyl(0.035, 0.045, 0.6, C.WOOD, 0, 0.3, 0), k.sph(0.1, k.emit(0xffcf6b), 0, 0.66, 0), k.cone(0.08, 0.2, k.emit(0xff7a2a), 0, 0.74, 0)) },
  { id: 'banner', label: 'Banner', icon: '🚩', color: '#b23b3b', category: 'Structure', build: (k, color) =>
    k.group(k.cyl(0.025, 0.025, 0.95, C.WOOD, 0, 0.47, 0), k.box(0.34, 0.42, 0.02, color, 0.18, 0.7, 0)) },
  { id: 'pillar', label: 'Pillar', icon: '🏛', color: '#cabfa6', category: 'Structure', build: (k, color) =>
    k.group(k.box(0.36, 0.1, 0.36, C.STONE, 0, 0.05, 0), k.cyl(0.13, 0.15, 0.78, color, 0, 0.5, 0, 16), k.box(0.36, 0.1, 0.36, C.STONE, 0, 0.95, 0)) },
  { id: 'wall', label: 'Wall', icon: '🧱', color: '#8d8377', category: 'Structure', size: 1, build: (k, color) => {
    const g = k.group(k.box(0.96, 0.62, 0.3, color, 0, 0.31, 0));
    for (const y of [0.18, 0.44]) for (const x of [-0.3, 0, 0.3]) g.add(k.box(0.28, 0.02, 0.31, 0x6f675c, x, y, 0));
    return g;
  } },
  { id: 'bookshelf', label: 'Bookshelf', icon: '📚', color: '#5e4228', category: 'Furniture', build: (k, color) => {
    const g = k.group(k.box(0.6, 0.92, 0.22, color, 0, 0.46, 0));
    const spines = [0xaa3333, 0x33aa66, 0x3366aa, 0xaaaa33, 0x669933];
    for (const y of [0.28, 0.56, 0.84]) {
      g.add(k.box(0.56, 0.03, 0.22, 0x3a2c1c, 0, y, 0));
      for (let i = 0; i < 5; i++) g.add(k.box(0.07, 0.16, 0.16, spines[i], -0.22 + i * 0.11, y + 0.1, 0));
    }
    return g;
  } },
  { id: 'table', label: 'Table', icon: '🪑', color: '#6f4f30', category: 'Furniture', build: (k, color) => {
    const g = k.group(k.box(0.7, 0.06, 0.5, color, 0, 0.42, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(k.box(0.06, 0.4, 0.06, C.WOOD, sx * 0.3, 0.2, sz * 0.2));
    return g;
  } },
  { id: 'campfire', label: 'Campfire', icon: '🏕', color: '#ff8844', category: 'Camp', build: (k) => {
    const g = k.group();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(k.sph(0.08, C.STONE, Math.cos(a) * 0.26, 0.06, Math.sin(a) * 0.26)); }
    g.add(k.rot(k.cyl(0.04, 0.04, 0.4, C.WOOD, 0, 0.1, 0, 8), 0, 0, Math.PI / 2));
    g.add(k.rot(k.cyl(0.04, 0.04, 0.4, C.WOOD, 0, 0.13, 0, 8), Math.PI / 2, 0, 0.6));
    g.add(k.cone(0.16, 0.34, k.emit(0xff8a3a), 0, 0.3, 0));
    return g;
  } },
  { id: 'anvil', label: 'Anvil', icon: '🔨', color: '#5a5f66', category: 'Furniture', build: (k, color) =>
    k.group(k.box(0.3, 0.16, 0.22, color, 0, 0.08, 0), k.box(0.16, 0.14, 0.16, color, 0, 0.22, 0), k.box(0.46, 0.1, 0.2, color, 0, 0.34, 0), k.cone(0.09, 0.18, color, 0.27, 0.34, 0)) },
  { id: 'gravestone', label: 'Gravestone', icon: '🪦', color: '#9aa0a6', category: 'Structure', build: (k, color) =>
    k.group(k.box(0.36, 0.5, 0.1, color, 0, 0.3, 0), k.rot(k.cyl(0.18, 0.18, 0.1, color, 0, 0.55, 0, 16), Math.PI / 2), k.box(0.46, 0.08, 0.24, C.STONE, 0, 0.04, 0)) },
  { id: 'statue', label: 'Statue', icon: '🗿', color: '#b8b2a4', category: 'Structure', build: (k, color) =>
    k.group(k.box(0.4, 0.14, 0.4, C.STONE, 0, 0.07, 0), k.cyl(0.1, 0.13, 0.5, color, 0, 0.4, 0), k.sph(0.11, color, 0, 0.72, 0), k.box(0.34, 0.08, 0.12, color, 0, 0.6, 0)) },
  { id: 'coins', label: 'Coins', icon: '🪙', color: '#e3c050', category: 'Loot', build: (k) => {
    const g = k.group();
    for (let i = 0; i < 5; i++) g.add(k.cyl(0.12 - i * 0.012, 0.12 - i * 0.012, 0.03, C.GOLD, 0, 0.02 + i * 0.03, 0, 16));
    g.add(k.cyl(0.1, 0.1, 0.03, C.GOLD, 0.16, 0, 0.08, 16));
    return g;
  } },
  { id: 'key', label: 'Key', icon: '🗝', color: '#d4af37', category: 'Loot', build: (k, color) =>
    k.group(k.rot(k.cyl(0.02, 0.02, 0.34, color, 0, 0.02, 0, 8), Math.PI / 2), k.rot(k.torus(0.07, 0.022, color, 0, 0.02, -0.2, 18), Math.PI / 2), k.box(0.02, 0.02, 0.08, color, 0.03, 0.02, 0.16)) },
  { id: 'skull', label: 'Skull', icon: '💀', color: '#e8e2d0', category: 'Dressing', build: (k, color) =>
    k.group(k.sph(0.16, color, 0, 0.18, 0), k.box(0.18, 0.08, 0.14, color, 0, 0.06, 0), k.sph(0.04, k.glow(0x0a0a0a), -0.06, 0.2, 0.1), k.sph(0.04, k.glow(0x0a0a0a), 0.06, 0.2, 0.1)) },
  { id: 'crystal', label: 'Crystal', icon: '🔮', color: '#a78bfa', category: 'Gear', build: (k, color) =>
    k.group(k.cone(0.12, 0.5, color, 0, 0.25, 0, 6), k.cone(0.07, 0.3, color, 0.13, 0.15, 0.05, 6), k.cone(0.06, 0.26, color, -0.12, 0.13, -0.04, 6)) },
];
