// Biomes drive how each floor generates and looks. The 100-floor descent is
// split into 20-floor bands (5 biomes); each biome has several SUB-BIOMES that
// vary the caves — density, hazard mix, light fixtures, palette. A floor's
// sub-biome is picked deterministically from the seed + depth, so the same run
// always produces the same descent.

import { makeRng } from './rng.ts';
import type { LightKind } from './lighting.ts';

/** Per-cell base colours the renderer uses for a floor's terrain. */
export interface BiomePalette {
  floor: number;
  wall: number;
  ledge: number;
  pit: number;
  water: number;
  stairsDown: number;
  stairsUp: number;
  /** Ceiling rock tint. */
  rock: number;
  /** Scene background / far fog colour. */
  bg: number;
}

export interface SubBiome {
  name: string;
  /** Initial wall probability for the cellular-automata fill (cave tightness). */
  fillProb: number;
  smoothSteps: number;
  /** Multipliers on the base blob counts for each terrain feature. */
  ledgeMul: number;
  pitMul: number;
  waterMul: number;
  /** Fixture light kinds this sub-biome scatters. */
  lights: LightKind[];
  palette: BiomePalette;
}

export interface Biome {
  name: string;
  sub: SubBiome[];
}

// Five biomes across the 26-floor descent (~5 floors each): Caves → Ruins →
// Lava Zone → Ancient City → Corrupted Halls. Each has a couple of sub-biomes
// that reshape the caves and repaint them, so the descent keeps changing
// character within a band too.
export const BIOMES: Biome[] = [
  {
    name: 'Caves',
    sub: [
      {
        name: 'Hollow Caverns',
        fillProb: 0.44,
        smoothSteps: 5,
        ledgeMul: 1,
        pitMul: 0.8,
        waterMul: 0.8,
        lights: ['brazier'],
        palette: { floor: 0x6b6b73, wall: 0x3b3b46, ledge: 0x9091a0, pit: 0x0c0c12, water: 0x2f5f80, stairsDown: 0xc9922f, stairsUp: 0x35866a, rock: 0x241f1b, bg: 0x06070a },
      },
      {
        name: 'Dripstone Grotto',
        fillProb: 0.47,
        smoothSteps: 6,
        ledgeMul: 0.7,
        pitMul: 0.7,
        waterMul: 1.6,
        lights: ['brazier', 'lantern'],
        palette: { floor: 0x5f6a68, wall: 0x33403e, ledge: 0x86968f, pit: 0x0a1010, water: 0x2f6f80, stairsDown: 0xc9922f, stairsUp: 0x35866a, rock: 0x1d2422, bg: 0x05080a },
      },
    ],
  },
  {
    name: 'Ruins',
    sub: [
      {
        name: 'Sunken Ruins',
        fillProb: 0.46,
        smoothSteps: 5,
        ledgeMul: 1.1,
        pitMul: 0.9,
        waterMul: 1.5,
        lights: ['brazier', 'lantern'],
        palette: { floor: 0x6a6a56, wall: 0x39392c, ledge: 0x8c8c72, pit: 0x101008, water: 0x35604a, stairsDown: 0xd8b45a, stairsUp: 0x7ab080, rock: 0x232016, bg: 0x070805 },
      },
      {
        name: 'Collapsed Vaults',
        fillProb: 0.49,
        smoothSteps: 5,
        ledgeMul: 1.5,
        pitMul: 1.4,
        waterMul: 0.5,
        lights: ['brazier'],
        palette: { floor: 0x726a54, wall: 0x3e382a, ledge: 0x968a6a, pit: 0x120e06, water: 0x40604a, stairsDown: 0xd8b45a, stairsUp: 0x7ab080, rock: 0x282214, bg: 0x080704 },
      },
    ],
  },
  {
    name: 'Lava Zone',
    sub: [
      {
        name: 'Cinder Warrens',
        fillProb: 0.47,
        smoothSteps: 5,
        ledgeMul: 1,
        pitMul: 1.6,
        waterMul: 0.3,
        lights: ['brazier', 'campfire'],
        palette: { floor: 0x6a4638, wall: 0x3a231c, ledge: 0x8a5a44, pit: 0x1a0805, water: 0x7a3520, stairsDown: 0xffcf5a, stairsUp: 0xff8a3a, rock: 0x2a1512, bg: 0x0a0605 },
      },
      {
        name: 'Magma Fissures',
        fillProb: 0.5,
        smoothSteps: 5,
        ledgeMul: 0.8,
        pitMul: 2.4,
        waterMul: 0.2,
        lights: ['brazier', 'campfire'],
        palette: { floor: 0x5a3830, wall: 0x2f1c16, ledge: 0x7a4636, pit: 0x2a0a04, water: 0x8a3a1a, stairsDown: 0xffcf5a, stairsUp: 0xff8a3a, rock: 0x260f0c, bg: 0x0b0503 },
      },
    ],
  },
  {
    name: 'Ancient City',
    sub: [
      {
        name: 'Gilded Boulevard',
        fillProb: 0.43,
        smoothSteps: 4,
        ledgeMul: 1.7,
        pitMul: 0.7,
        waterMul: 0.9,
        lights: ['lantern', 'crystal'],
        palette: { floor: 0xb0a074, wall: 0x6a5c3a, ledge: 0xd2c290, pit: 0x1a1508, water: 0x3a80a0, stairsDown: 0xffd070, stairsUp: 0xffe0a0, rock: 0x4a4030, bg: 0x0c0a06 },
      },
      {
        name: 'Forgotten Plaza',
        fillProb: 0.4,
        smoothSteps: 4,
        ledgeMul: 1.2,
        pitMul: 0.9,
        waterMul: 1.4,
        lights: ['lantern'],
        palette: { floor: 0xa89868, wall: 0x605234, ledge: 0xcab884, pit: 0x181206, water: 0x3a86a8, stairsDown: 0xffd070, stairsUp: 0xffe0a0, rock: 0x443a2a, bg: 0x0b0905 },
      },
    ],
  },
  {
    name: 'Corrupted Halls',
    sub: [
      {
        name: 'Voidstone',
        fillProb: 0.46,
        smoothSteps: 5,
        ledgeMul: 1.1,
        pitMul: 1.4,
        waterMul: 0.6,
        lights: ['crystal', 'magical'],
        palette: { floor: 0x4a4060, wall: 0x241d36, ledge: 0x6a5c8c, pit: 0x0a0616, water: 0x3a2f6a, stairsDown: 0xc4b5fd, stairsUp: 0x9a7fff, rock: 0x181026, bg: 0x05040a },
      },
      {
        name: 'Blightways',
        fillProb: 0.49,
        smoothSteps: 6,
        ledgeMul: 0.9,
        pitMul: 1.1,
        waterMul: 1.3,
        lights: ['crystal', 'magical'],
        palette: { floor: 0x40503e, wall: 0x1e2a1c, ledge: 0x5c7454, pit: 0x08120a, water: 0x2a5a3a, stairsDown: 0xb6ff8a, stairsUp: 0x8affc0, rock: 0x14200f, bg: 0x040803 },
      },
    ],
  },
];

/** Floors per biome band (5 biomes over 26 floors; the last band runs long). */
export const FLOORS_PER_BIOME = 5;

/** The biome for a given depth (clamped to the last biome past the bottom). */
export function biomeForDepth(depth: number): Biome {
  return BIOMES[Math.min(BIOMES.length - 1, Math.floor(depth / FLOORS_PER_BIOME))];
}

/** Deterministically pick this floor's sub-biome from seed + depth. */
export function subBiomeForDepth(seed: string, depth: number): SubBiome {
  const b = biomeForDepth(depth);
  const rng = makeRng(`${seed}:biome:${depth}`);
  return rng.pick(b.sub);
}
