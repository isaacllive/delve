// Procedural 3D model builders for dungeon / structure pieces. Each builder
// works in UNIT space (~1 cell wide/deep, base on y=0, front facing +Z) and
// returns a THREE.Group assembled from the shared ModelKit helpers. Builders
// never import 'three' directly — the live namespace arrives via `kit`.
import { C } from './kit.ts';
import type { ModelKit } from './kit.ts';
import type { ModelDef } from './types.ts';

/** Any mesh/object the kit produces — the element type `group()` accepts. */
type Part = Parameters<ModelKit['group']>[number];

export const MODELS: ModelDef[] = [
  {
    id: 'door',
    label: 'Door',
    icon: '🚪',
    color: '#6f4f30',
    category: 'Dungeon',
    build: (kit) => {
      const frame = kit.mat(C.DARKWOOD);
      return kit.group(
        kit.box(0.1, 1.0, 0.12, frame, -0.45, 0.5, 0),
        kit.box(0.1, 1.0, 0.12, frame, 0.45, 0.5, 0),
        kit.box(1.0, 0.1, 0.12, frame, 0, 0.95, 0),
        kit.box(0.7, 0.85, 0.06, C.WOOD, 0, 0.45, 0.03),
        kit.box(0.72, 0.05, 0.08, C.IRON, 0, 0.62, 0.05),
        kit.box(0.72, 0.05, 0.08, C.IRON, 0, 0.28, 0.05),
        kit.sph(0.045, C.IRON, 0.24, 0.45, 0.08),
      );
    },
  },
  {
    id: 'door-double',
    label: 'Double Door',
    icon: '🚪',
    color: '#6f4f30',
    category: 'Dungeon',
    size: 2,
    build: (kit) => {
      const frame = kit.mat(C.DARKWOOD);
      return kit.group(
        kit.box(0.12, 1.0, 0.14, frame, -0.52, 0.5, 0),
        kit.box(0.12, 1.0, 0.14, frame, 0.52, 0.5, 0),
        kit.box(1.16, 0.12, 0.14, frame, 0, 0.96, 0),
        kit.box(0.44, 0.86, 0.06, C.WOOD, -0.24, 0.45, 0.03),
        kit.box(0.44, 0.86, 0.06, C.WOOD, 0.24, 0.45, 0.03),
        kit.box(0.46, 0.05, 0.08, C.IRON, -0.24, 0.6, 0.05),
        kit.box(0.46, 0.05, 0.08, C.IRON, 0.24, 0.6, 0.05),
        kit.sph(0.045, C.IRON, -0.05, 0.45, 0.08),
        kit.sph(0.045, C.IRON, 0.05, 0.45, 0.08),
      );
    },
  },
  {
    id: 'door-iron',
    label: 'Iron Door',
    icon: '🚪',
    color: '#55585e',
    category: 'Dungeon',
    build: (kit) => {
      const frame = kit.mat(C.IRON, { metal: 0.6, rough: 0.5 });
      const plate = kit.mat(C.METAL, { metal: 0.7, rough: 0.42 });
      return kit.group(
        kit.box(0.1, 1.0, 0.12, frame, -0.45, 0.5, 0),
        kit.box(0.1, 1.0, 0.12, frame, 0.45, 0.5, 0),
        kit.box(1.0, 0.1, 0.12, frame, 0, 0.95, 0),
        kit.box(0.72, 0.86, 0.08, plate, 0, 0.45, 0.03),
        kit.box(0.74, 0.07, 0.1, frame, 0, 0.66, 0.05),
        kit.box(0.74, 0.07, 0.1, frame, 0, 0.26, 0.05),
        kit.sph(0.05, frame, 0.26, 0.45, 0.09),
        kit.sph(0.03, frame, -0.26, 0.66, 0.1),
        kit.sph(0.03, frame, 0.26, 0.26, 0.1),
      );
    },
  },
  {
    id: 'trapdoor',
    label: 'Trapdoor',
    icon: '🕳️',
    color: '#8a6a3e',
    category: 'Dungeon',
    build: (kit) => {
      const ring = kit.rot(kit.torus(0.08, 0.018, C.IRON, 0, 0.1, 0.22), Math.PI / 2, 0, 0);
      return kit.group(
        kit.box(1.0, 0.05, 1.0, C.DARKSTONE, 0, 0.025, 0),
        kit.box(0.82, 0.07, 0.82, C.PLANK, 0, 0.06, 0),
        kit.box(0.86, 0.04, 0.08, C.IRON, 0, 0.1, -0.38),
        kit.box(0.08, 0.04, 0.82, C.IRON, -0.34, 0.1, 0),
        kit.box(0.08, 0.04, 0.82, C.IRON, 0.34, 0.1, 0),
        ring,
      );
    },
  },
  {
    id: 'portcullis',
    label: 'Portcullis',
    icon: '⛓️',
    color: '#55585e',
    category: 'Dungeon',
    size: 2,
    build: (kit) => {
      const iron = kit.mat(C.IRON, { metal: 0.5, rough: 0.5 });
      const ms: Part[] = [
        kit.box(1.74, 0.07, 0.07, iron, 0, 0.88, 0),
        kit.box(1.74, 0.07, 0.07, iron, 0, 0.46, 0),
        kit.box(1.74, 0.07, 0.07, iron, 0, 1.02, 0),
      ];
      for (let i = 0; i < 7; i++) {
        const x = -0.75 + i * 0.25;
        ms.push(kit.box(0.05, 1.0, 0.05, iron, x, 0.5, 0));
        ms.push(kit.rot(kit.cone(0.05, 0.13, iron, x, -0.02, 0), Math.PI, 0, 0));
      }
      return kit.group(...ms);
    },
  },
  {
    id: 'gate',
    label: 'Gate',
    icon: '🚪',
    color: '#6f4f30',
    category: 'Dungeon',
    size: 2,
    build: (kit) => {
      const stone = kit.mat(C.STONE);
      return kit.group(
        kit.box(0.26, 1.1, 0.28, stone, -0.8, 0.55, 0),
        kit.box(0.26, 1.1, 0.28, stone, 0.8, 0.55, 0),
        kit.box(1.94, 0.22, 0.34, stone, 0, 1.16, 0),
        kit.box(0.6, 0.92, 0.08, C.WOOD, -0.32, 0.46, 0),
        kit.box(0.6, 0.92, 0.08, C.WOOD, 0.32, 0.46, 0),
        kit.box(0.6, 0.06, 0.1, C.IRON, -0.32, 0.68, 0.05),
        kit.box(0.6, 0.06, 0.1, C.IRON, -0.32, 0.28, 0.05),
        kit.box(0.6, 0.06, 0.1, C.IRON, 0.32, 0.68, 0.05),
        kit.box(0.6, 0.06, 0.1, C.IRON, 0.32, 0.28, 0.05),
      );
    },
  },
  {
    id: 'archway',
    label: 'Archway',
    icon: '🏛️',
    color: '#9a948a',
    category: 'Dungeon',
    build: (kit) => {
      const stone = kit.mat(C.STONE);
      return kit.group(
        kit.box(0.2, 0.85, 0.28, stone, -0.4, 0.42, 0),
        kit.box(0.2, 0.85, 0.28, stone, 0.4, 0.42, 0),
        kit.box(0.26, 0.1, 0.32, C.DARKSTONE, -0.4, 0.05, 0),
        kit.box(0.26, 0.1, 0.32, C.DARKSTONE, 0.4, 0.05, 0),
        kit.torus(0.4, 0.1, stone, 0, 0.82, 0, 20),
        kit.box(0.18, 0.18, 0.32, C.DARKSTONE, 0, 1.24, 0),
      );
    },
  },
  {
    id: 'stairs',
    label: 'Stairs',
    icon: '⛰️',
    color: '#9a948a',
    category: 'Dungeon',
    build: (kit) => {
      const stone = kit.mat(C.STONE);
      const ms: Part[] = [];
      for (let i = 0; i < 5; i++) {
        const h = 0.16 * (i + 1);
        ms.push(kit.box(0.9, h, 0.2, stone, 0, h / 2, 0.4 - i * 0.18));
      }
      return kit.group(...ms);
    },
  },
  {
    id: 'spiral-stairs',
    label: 'Spiral Stairs',
    icon: '🌀',
    color: '#9a948a',
    category: 'Dungeon',
    build: (kit) => {
      const stone = kit.mat(C.STONE);
      const ms: Part[] = [kit.cyl(0.07, 0.07, 1.05, C.DARKSTONE, 0, 0.52, 0, 10)];
      for (let i = 0; i < 11; i++) {
        const a = i * 0.62;
        const step = kit.box(0.42, 0.06, 0.18, stone, Math.cos(a) * 0.3, 0.08 + i * 0.09, Math.sin(a) * 0.3);
        ms.push(kit.rot(step, 0, -a, 0));
      }
      return kit.group(...ms);
    },
  },
  {
    id: 'ladder',
    label: 'Ladder',
    icon: '🪜',
    color: '#6f4f30',
    category: 'Dungeon',
    build: (kit) => {
      const wood = kit.mat(C.WOOD);
      const ms: Part[] = [
        kit.box(0.06, 1.0, 0.06, wood, -0.2, 0.5, 0),
        kit.box(0.06, 1.0, 0.06, wood, 0.2, 0.5, 0),
      ];
      for (let i = 0; i < 6; i++) ms.push(kit.box(0.46, 0.04, 0.04, C.PLANK, 0, 0.12 + i * 0.16, 0));
      return kit.group(...ms);
    },
  },
  {
    id: 'bridge-stone',
    label: 'Stone Bridge',
    icon: '🌉',
    color: '#9a948a',
    category: 'Dungeon',
    size: 2,
    build: (kit) => {
      const stone = kit.mat(C.STONE);
      const ms: Part[] = [
        kit.box(1.9, 0.12, 0.72, stone, 0, 0.36, 0),
        kit.box(0.22, 0.42, 0.72, C.DARKSTONE, -0.72, 0.21, 0),
        kit.box(0.22, 0.42, 0.72, C.DARKSTONE, 0.72, 0.21, 0),
        kit.box(1.9, 0.14, 0.06, stone, 0, 0.5, 0.33),
        kit.box(1.9, 0.14, 0.06, stone, 0, 0.5, -0.33),
        kit.torus(0.55, 0.1, C.DARKSTONE, 0, 0.04, 0.2, 20),
        kit.torus(0.55, 0.1, C.DARKSTONE, 0, 0.04, -0.2, 20),
      ];
      return kit.group(...ms);
    },
  },
  {
    id: 'bridge-rope',
    label: 'Rope Bridge',
    icon: '🌉',
    color: '#8a6a3e',
    category: 'Dungeon',
    size: 2,
    build: (kit) => {
      const rope = kit.mat(C.LEATHER);
      const ms: Part[] = [];
      for (let i = 0; i < 9; i++) ms.push(kit.box(0.15, 0.04, 0.6, C.PLANK, -0.8 + i * 0.2, 0.3, 0));
      for (const z of [0.3, -0.3]) {
        ms.push(kit.rot(kit.cyl(0.02, 0.02, 1.9, rope, 0, 0.56, z), 0, 0, Math.PI / 2));
        ms.push(kit.rot(kit.cyl(0.02, 0.02, 1.9, rope, 0, 0.29, z), 0, 0, Math.PI / 2));
      }
      for (const x of [-0.86, 0.86]) {
        ms.push(kit.box(0.06, 0.34, 0.06, C.DARKWOOD, x, 0.46, 0.3));
        ms.push(kit.box(0.06, 0.34, 0.06, C.DARKWOOD, x, 0.46, -0.3));
      }
      return kit.group(...ms);
    },
  },
  {
    id: 'prison-bars',
    label: 'Prison Bars',
    icon: '⛓️',
    color: '#55585e',
    category: 'Dungeon',
    build: (kit) => {
      const iron = kit.mat(C.IRON, { metal: 0.5, rough: 0.5 });
      const ms: Part[] = [
        kit.box(1.0, 0.06, 0.06, iron, 0, 0.97, 0),
        kit.box(1.0, 0.06, 0.06, iron, 0, 0.03, 0),
        kit.box(1.0, 0.06, 0.06, iron, 0, 0.5, 0),
      ];
      for (let i = 0; i < 6; i++) ms.push(kit.box(0.05, 0.94, 0.05, iron, -0.4 + i * 0.16, 0.5, 0));
      return kit.group(...ms);
    },
  },
  {
    id: 'cage',
    label: 'Cage',
    icon: '🪤',
    color: '#55585e',
    category: 'Dungeon',
    build: (kit) => {
      const iron = kit.mat(C.IRON, { metal: 0.5, rough: 0.5 });
      const ms: Part[] = [
        kit.box(0.82, 0.05, 0.82, C.DARKSTONE, 0, 0.025, 0),
        kit.box(0.82, 0.05, 0.82, iron, 0, 0.9, 0),
      ];
      for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [0.38, 0.38], [-0.38, 0.38]] as const)
        ms.push(kit.box(0.05, 0.88, 0.05, iron, x, 0.46, z));
      for (let i = 0; i < 3; i++) {
        const x = -0.2 + i * 0.2;
        ms.push(kit.box(0.03, 0.84, 0.03, iron, x, 0.46, 0.38));
        ms.push(kit.box(0.03, 0.84, 0.03, iron, x, 0.46, -0.38));
      }
      return kit.group(...ms);
    },
  },
  {
    id: 'sarcophagus',
    label: 'Sarcophagus',
    icon: '⚰️',
    color: '#9a948a',
    category: 'Dungeon',
    build: (kit) => {
      const stone = kit.mat(C.STONE);
      return kit.group(
        kit.box(0.6, 0.5, 0.95, stone, 0, 0.25, 0),
        kit.box(0.66, 0.12, 1.0, C.DARKSTONE, 0, 0.56, 0),
        kit.sph(0.13, stone, 0, 0.68, 0.3),
        kit.box(0.34, 0.04, 0.5, kit.mat(C.GOLD, { metal: 0.6, rough: 0.4 }), 0, 0.63, -0.05),
        kit.box(0.04, 0.04, 0.3, kit.mat(C.GOLD, { metal: 0.6, rough: 0.4 }), 0, 0.63, -0.05),
      );
    },
  },
  {
    id: 'coffin',
    label: 'Coffin',
    icon: '⚰️',
    color: '#4a3220',
    category: 'Dungeon',
    build: (kit) => {
      const wood = kit.mat(C.DARKWOOD);
      const iron = kit.mat(C.IRON, { metal: 0.4 });
      return kit.group(
        kit.box(0.5, 0.38, 0.5, wood, 0, 0.19, 0.18),
        kit.box(0.32, 0.38, 0.5, wood, 0, 0.19, -0.3),
        kit.box(0.54, 0.06, 0.5, C.WOOD, 0, 0.41, 0.18),
        kit.box(0.36, 0.06, 0.5, C.WOOD, 0, 0.41, -0.3),
        kit.box(0.04, 0.03, 0.24, iron, 0, 0.45, 0.2),
        kit.box(0.18, 0.03, 0.05, iron, 0, 0.45, 0.16),
      );
    },
  },
  {
    id: 'obelisk',
    label: 'Obelisk',
    icon: '🗼',
    color: '#5d5a54',
    category: 'Dungeon',
    build: (kit) => {
      const stone = kit.mat(C.DARKSTONE);
      return kit.group(
        kit.box(0.42, 0.1, 0.42, C.STONE, 0, 0.05, 0),
        kit.box(0.34, 0.06, 0.34, C.DARKSTONE, 0, 0.13, 0),
        kit.rot(kit.cyl(0.1, 0.2, 1.1, stone, 0, 0.71, 0, 4), 0, Math.PI / 4, 0),
        kit.rot(kit.cone(0.15, 0.2, kit.mat(C.GOLD, { metal: 0.6, rough: 0.4 }), 0, 1.36, 0, 4), 0, Math.PI / 4, 0),
      );
    },
  },
  {
    id: 'brazier',
    label: 'Brazier',
    icon: '🔥',
    color: '#ff7a2a',
    category: 'Dungeon',
    build: (kit) => {
      const iron = kit.mat(C.IRON, { metal: 0.5, rough: 0.5 });
      const ms: Part[] = [
        kit.cyl(0.3, 0.16, 0.2, iron, 0, 0.55, 0, 16),
        kit.cyl(0.27, 0.27, 0.04, C.DARKSTONE, 0, 0.47, 0, 16),
      ];
      for (const a of [0, 2.094, 4.189]) ms.push(kit.box(0.04, 0.5, 0.04, iron, Math.cos(a) * 0.18, 0.22, Math.sin(a) * 0.18));
      ms.push(kit.sph(0.1, kit.emit(C.EMBER), 0, 0.58, 0, 8, 6));
      ms.push(kit.sph(0.06, kit.emit(C.LAVA), 0.09, 0.6, 0.05, 8, 6));
      ms.push(kit.cone(0.13, 0.3, kit.emit(C.FIRE), 0, 0.78, 0));
      ms.push(kit.cone(0.07, 0.18, kit.emit(C.EMBER), 0, 0.94, 0));
      return kit.group(...ms);
    },
  },
  {
    id: 'rubble',
    label: 'Rubble',
    icon: '🪨',
    color: '#9a948a',
    category: 'Dungeon',
    build: (kit) => {
      const stone = kit.mat(C.STONE);
      const dark = kit.mat(C.DARKSTONE);
      return kit.group(
        kit.sph(0.19, stone, 0, 0.12, 0, 6, 5),
        kit.sph(0.14, dark, 0.23, 0.1, 0.1, 6, 5),
        kit.sph(0.12, stone, -0.21, 0.08, 0.13, 6, 5),
        kit.sph(0.1, dark, 0.11, 0.09, -0.22, 6, 5),
        kit.sph(0.13, stone, -0.13, 0.1, -0.19, 6, 5),
        kit.sph(0.09, dark, 0.04, 0.25, 0.02, 6, 5),
      );
    },
  },
  {
    id: 'fence',
    label: 'Fence',
    icon: '🚧',
    color: '#6f4f30',
    category: 'Dungeon',
    build: (kit) => {
      const wood = kit.mat(C.WOOD);
      const ms: Part[] = [];
      for (const x of [-0.4, 0, 0.4]) ms.push(kit.box(0.06, 0.6, 0.06, wood, x, 0.3, 0));
      ms.push(kit.box(1.0, 0.05, 0.04, C.PLANK, 0, 0.46, 0));
      ms.push(kit.box(1.0, 0.05, 0.04, C.PLANK, 0, 0.22, 0));
      return kit.group(...ms);
    },
  },
  {
    id: 'palisade',
    label: 'Palisade',
    icon: '🪵',
    color: '#4a3220',
    category: 'Dungeon',
    build: (kit) => {
      const wood = kit.mat(C.DARKWOOD);
      const ms: Part[] = [];
      for (let i = 0; i < 6; i++) {
        const x = -0.42 + i * 0.17;
        ms.push(kit.cyl(0.07, 0.08, 0.9, wood, x, 0.45, 0, 8));
        ms.push(kit.cone(0.08, 0.16, wood, x, 0.98, 0, 8));
      }
      ms.push(kit.rot(kit.cyl(0.025, 0.025, 1.0, C.BARK, 0, 0.7, 0.07), 0, 0, Math.PI / 2));
      return kit.group(...ms);
    },
  },
  {
    id: 'well',
    label: 'Well',
    icon: '🪣',
    color: '#9a948a',
    category: 'Dungeon',
    build: (kit) => {
      const stone = kit.mat(C.STONE);
      const ms: Part[] = [
        kit.cyl(0.36, 0.4, 0.42, stone, 0, 0.21, 0, 16),
        kit.cyl(0.3, 0.3, 0.05, C.DARKSTONE, 0, 0.42, 0, 16),
        kit.disc(0.27, kit.glow(C.WATER), 0.32),
        kit.box(0.05, 0.7, 0.05, C.WOOD, -0.3, 0.57, 0),
        kit.box(0.05, 0.7, 0.05, C.WOOD, 0.3, 0.57, 0),
        kit.rot(kit.box(0.5, 0.04, 0.36, C.PLANK, -0.14, 0.92, 0), 0, 0, 0.5),
        kit.rot(kit.box(0.5, 0.04, 0.36, C.PLANK, 0.14, 0.92, 0), 0, 0, -0.5),
        kit.rot(kit.cyl(0.03, 0.03, 0.62, C.DARKWOOD, 0, 0.82, 0), 0, 0, Math.PI / 2),
        kit.cyl(0.08, 0.07, 0.13, C.DARKWOOD, 0.0, 0.57, 0, 12),
      ];
      return kit.group(...ms);
    },
  },
  {
    id: 'gargoyle',
    label: 'Gargoyle',
    icon: '🗿',
    color: '#5d5a54',
    category: 'Dungeon',
    build: (kit) => {
      const stone = kit.mat(C.DARKSTONE);
      return kit.group(
        kit.box(0.5, 0.08, 0.5, C.STONE, 0, 0.04, 0),
        kit.box(0.3, 0.3, 0.32, stone, 0, 0.25, 0),
        kit.sph(0.17, stone, 0, 0.5, 0.05),
        kit.cone(0.05, 0.13, stone, -0.08, 0.64, 0.05),
        kit.cone(0.05, 0.13, stone, 0.08, 0.64, 0.05),
        kit.rot(kit.box(0.06, 0.36, 0.26, stone, -0.22, 0.42, -0.08), 0, 0.5, 0.3),
        kit.rot(kit.box(0.06, 0.36, 0.26, stone, 0.22, 0.42, -0.08), 0, -0.5, -0.3),
        kit.box(0.09, 0.18, 0.1, stone, -0.12, 0.13, 0.18),
        kit.box(0.09, 0.18, 0.1, stone, 0.12, 0.13, 0.18),
      );
    },
  },
];
