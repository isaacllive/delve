// Procedural 3D furniture builders. Each builder works in UNIT space (~1 cell
// wide/deep, base on y=0, front facing +Z) and returns a THREE.Group assembled
// from the shared ModelKit helpers. Never import 'three' here — the kit closes
// over the live THREE instance so this file stays server-safe.
import type { ModelDef } from './types.ts';
import { C } from './kit.ts';

export const MODELS: ModelDef[] = [
  {
    id: 'table-round', label: 'Round Table', icon: '🛎', color: '#6f4f30', category: 'Furniture',
    build: (k) => k.group(
      k.cyl(0.42, 0.42, 0.06, C.PLANK, 0, 0.5, 0),     // round top
      k.cyl(0.08, 0.1, 0.46, C.WOOD, 0, 0.25, 0),       // pedestal
      k.cyl(0.26, 0.26, 0.05, C.DARKWOOD, 0, 0.03, 0),  // foot disc
    ),
  },
  {
    id: 'table-long', label: 'Long Table', icon: '🍽', color: '#8a6a3e', category: 'Furniture', size: 2,
    build: (k) => k.group(
      k.box(1.7, 0.07, 0.7, C.PLANK, 0, 0.5, 0),        // long top
      k.box(0.08, 0.46, 0.08, C.WOOD, -0.75, 0.25, -0.28),
      k.box(0.08, 0.46, 0.08, C.WOOD, 0.75, 0.25, -0.28),
      k.box(0.08, 0.46, 0.08, C.WOOD, -0.75, 0.25, 0.28),
      k.box(0.08, 0.46, 0.08, C.WOOD, 0.75, 0.25, 0.28),
      k.box(1.5, 0.05, 0.1, C.DARKWOOD, 0, 0.4, 0),     // stretcher
    ),
  },
  {
    id: 'chair', label: 'Chair', icon: '🪑', color: '#6f4f30', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.34, 0.05, 0.34, C.PLANK, 0, 0.42, 0),     // seat
      k.box(0.34, 0.4, 0.05, C.WOOD, 0, 0.62, -0.15),   // back
      k.box(0.05, 0.42, 0.05, C.WOOD, -0.14, 0.21, -0.14),
      k.box(0.05, 0.42, 0.05, C.WOOD, 0.14, 0.21, -0.14),
      k.box(0.05, 0.42, 0.05, C.WOOD, -0.14, 0.21, 0.14),
      k.box(0.05, 0.42, 0.05, C.WOOD, 0.14, 0.21, 0.14),
    ),
  },
  {
    id: 'stool', label: 'Stool', icon: '🪑', color: '#6f4f30', category: 'Furniture',
    build: (k) => k.group(
      k.cyl(0.2, 0.2, 0.05, C.PLANK, 0, 0.45, 0),       // round seat
      k.rot(k.cyl(0.03, 0.03, 0.46, C.WOOD, 0, 0.22, 0.15), -0.25, 0, 0),
      k.rot(k.cyl(0.03, 0.03, 0.46, C.WOOD, 0.13, 0.22, -0.08), -0.25, 0, 2.1),
      k.rot(k.cyl(0.03, 0.03, 0.46, C.WOOD, -0.13, 0.22, -0.08), -0.25, 0, -2.1),
    ),
  },
  {
    id: 'bench', label: 'Bench', icon: '🪑', color: '#8a6a3e', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.95, 0.06, 0.3, C.PLANK, 0, 0.32, 0),      // long low seat
      k.box(0.06, 0.3, 0.26, C.DARKWOOD, -0.42, 0.15, 0),
      k.box(0.06, 0.3, 0.26, C.DARKWOOD, 0.42, 0.15, 0),
      k.box(0.85, 0.04, 0.06, C.WOOD, 0, 0.1, 0),       // stretcher
    ),
  },
  {
    id: 'bed', label: 'Bed', icon: '🛏', color: '#8a6f4a', category: 'Furniture', size: 2,
    build: (k) => k.group(
      k.box(0.8, 0.12, 1.6, C.DARKWOOD, 0, 0.18, 0),    // frame
      k.box(0.7, 0.12, 1.5, C.CLOTH, 0, 0.3, 0),        // mattress
      k.box(0.6, 0.5, 0.06, C.WOOD, 0, 0.4, -0.78),     // headboard
      k.box(0.6, 0.2, 0.06, C.WOOD, 0, 0.25, 0.78),     // footboard
      k.box(0.5, 0.1, 0.28, 0xeee6d2, 0, 0.4, -0.55),   // pillow
      k.box(0.68, 0.06, 1.0, C.RED, 0, 0.37, 0.15),     // blanket
    ),
  },
  {
    id: 'desk', label: 'Desk', icon: '🛎', color: '#6f4f30', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.9, 0.06, 0.5, C.PLANK, 0, 0.5, 0),        // top
      k.box(0.3, 0.42, 0.46, C.WOOD, 0.27, 0.25, 0),    // drawer block
      k.box(0.26, 0.1, 0.02, C.DARKWOOD, 0.27, 0.36, 0.24),
      k.box(0.26, 0.1, 0.02, C.DARKWOOD, 0.27, 0.22, 0.24),
      k.box(0.06, 0.46, 0.46, C.WOOD, -0.4, 0.25, 0),   // side leg panel
    ),
  },
  {
    id: 'cabinet', label: 'Cabinet', icon: '🚪', color: '#4a3220', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.6, 0.9, 0.4, C.DARKWOOD, 0, 0.45, 0),     // tall box
      k.box(0.27, 0.84, 0.02, C.WOOD, -0.15, 0.46, 0.2),
      k.box(0.27, 0.84, 0.02, C.WOOD, 0.15, 0.46, 0.2), // two doors
      k.sph(0.03, C.GOLD, -0.04, 0.46, 0.23),
      k.sph(0.03, C.GOLD, 0.04, 0.46, 0.23),            // knobs
    ),
  },
  {
    id: 'wardrobe', label: 'Wardrobe', icon: '🚪', color: '#4a3220', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.7, 1.3, 0.45, C.DARKWOOD, 0, 0.65, 0),    // taller box
      k.box(0.32, 1.2, 0.02, C.WOOD, -0.17, 0.66, 0.23),
      k.box(0.32, 1.2, 0.02, C.WOOD, 0.17, 0.66, 0.23),
      k.box(0.7, 0.08, 0.45, C.WOOD, 0, 1.32, 0),       // cornice
      k.cyl(0.02, 0.02, 0.18, C.GOLD, -0.04, 0.66, 0.25),
      k.cyl(0.02, 0.02, 0.18, C.GOLD, 0.04, 0.66, 0.25),
    ),
  },
  {
    id: 'shelf', label: 'Shelf', icon: '🗄', color: '#6f4f30', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.06, 0.95, 0.32, C.DARKWOOD, -0.37, 0.48, 0),
      k.box(0.06, 0.95, 0.32, C.DARKWOOD, 0.37, 0.48, 0), // sides
      k.box(0.74, 0.04, 0.32, C.PLANK, 0, 0.12, 0),
      k.box(0.74, 0.04, 0.32, C.PLANK, 0, 0.44, 0),
      k.box(0.74, 0.04, 0.32, C.PLANK, 0, 0.76, 0),       // open shelves
      k.box(0.8, 0.04, 0.32, C.PLANK, 0, 0.96, 0),        // top
    ),
  },
  {
    id: 'bar-counter', label: 'Bar Counter', icon: '🍺', color: '#4a3220', category: 'Furniture', size: 2,
    build: (k) => k.group(
      k.box(1.7, 0.07, 0.6, C.PLANK, 0, 0.62, 0),       // long counter top
      k.box(1.7, 0.55, 0.5, C.DARKWOOD, 0, 0.3, -0.02),  // body
      k.box(1.72, 0.5, 0.04, C.WOOD, 0, 0.3, 0.26),      // front panel
      k.box(1.6, 0.06, 0.04, C.GOLD, 0, 0.45, 0.28),     // brass rail
      k.box(1.6, 0.06, 0.04, C.GOLD, 0, 0.12, 0.28),
    ),
  },
  {
    id: 'shop-counter', label: 'Shop Counter', icon: '🏪', color: '#8a6a3e', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.9, 0.06, 0.45, C.PLANK, 0, 0.5, 0),       // counter
      k.box(0.9, 0.46, 0.4, C.WOOD, 0, 0.25, -0.02),
      k.box(0.85, 0.06, 0.4, C.DARKWOOD, 0, 0.18, 0),   // lower shelf
      k.box(0.4, 0.12, 0.25, C.GLASS, -0.2, 0.59, 0),   // glass display
      k.box(0.2, 0.1, 0.2, C.RED, 0.28, 0.58, 0),       // goods crate
    ),
  },
  {
    id: 'throne', label: 'Throne', icon: '👑', color: '#b23b3b', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.55, 0.1, 0.5, C.STONE, 0, 0.4, 0),        // big seat base
      k.box(0.5, 0.08, 0.45, C.RED, 0, 0.47, 0),        // cushion
      k.box(0.55, 1.1, 0.08, C.DARKSTONE, 0, 0.9, -0.21), // tall back
      k.box(0.08, 0.7, 0.5, C.STONE, -0.27, 0.7, 0),    // armrests
      k.box(0.08, 0.7, 0.5, C.STONE, 0.27, 0.7, 0),
      k.box(0.6, 0.1, 0.1, C.GOLD, 0, 1.42, -0.2),      // gold crest
      k.cone(0.07, 0.16, C.GOLD, -0.24, 1.5, -0.2),     // gold finials
      k.cone(0.07, 0.16, C.GOLD, 0.24, 1.5, -0.2),
      k.box(0.5, 0.04, 0.04, C.GOLD, 0, 0.55, -0.16),   // gold trim
    ),
  },
  {
    id: 'lectern', label: 'Lectern', icon: '🪧', color: '#6f4f30', category: 'Furniture',
    build: (k) => k.group(
      k.cyl(0.06, 0.1, 0.85, C.WOOD, 0, 0.42, 0),       // post
      k.cyl(0.22, 0.22, 0.04, C.DARKWOOD, 0, 0.02, 0),  // base
      k.rot(k.box(0.4, 0.04, 0.32, C.PLANK, 0, 0.9, 0.04), -0.5, 0, 0), // angled top
      k.rot(k.box(0.4, 0.03, 0.05, C.DARKWOOD, 0, 0.82, 0.16), -0.5, 0, 0), // lip
      k.rot(k.box(0.28, 0.02, 0.2, C.PARCH, 0, 0.93, 0.04), -0.5, 0, 0), // page
    ),
  },
  {
    id: 'fireplace', label: 'Fireplace', icon: '🔥', color: '#9a948a', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.9, 0.85, 0.3, C.STONE, 0, 0.42, -0.1),    // surround block
      k.box(0.5, 0.55, 0.32, C.DARKSTONE, 0, 0.3, 0),   // firebox void
      k.box(0.95, 0.12, 0.36, C.STONE, 0, 0.9, -0.08),  // mantel
      k.cyl(0.04, 0.04, 0.4, C.WOOD, -0.1, 0.18, 0.05), // logs
      k.rot(k.cyl(0.04, 0.04, 0.4, C.WOOD, 0.1, 0.18, 0.05), 0, 0.6, 0),
      k.cone(0.16, 0.4, k.emit(C.FIRE), 0, 0.32, 0.05), // flame
      k.cone(0.09, 0.26, k.emit(C.EMBER), 0, 0.28, 0.07),
    ),
  },
  {
    id: 'rug', label: 'Rug', icon: '🟫', color: '#b23b3b', category: 'Furniture',
    build: (k) => k.group(
      k.tile(0.9, 0.6, C.RED, 0.012),                   // base
      k.tile(0.72, 0.44, 0xc9a24a, 0.014),              // border band
      k.tile(0.5, 0.28, C.RED, 0.016),                  // inner field
      k.tile(0.18, 0.18, C.GOLD, 0.018),                // center medallion
    ),
  },
  {
    id: 'mirror', label: 'Mirror', icon: '🪞', color: '#d4af37', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.5, 1.0, 0.06, C.GOLD, 0, 0.5, 0),         // frame
      k.box(0.4, 0.9, 0.02, k.mat(C.GLASS, { metal: 1, rough: 0.05 }), 0, 0.5, 0.035), // panel
      k.box(0.3, 0.05, 0.05, C.GOLD, 0, 1.02, 0),       // crest
      k.cyl(0.22, 0.22, 0.04, C.DARKWOOD, 0, 0.02, 0),  // base
    ),
  },
  {
    id: 'weapon-rack', label: 'Weapon Rack', icon: '⚔', color: '#6e4a2c', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.7, 0.06, 0.2, C.DARKWOOD, 0, 0.02, 0),    // base
      k.box(0.7, 0.06, 0.2, C.DARKWOOD, 0, 0.9, 0),     // top rail
      k.box(0.05, 0.9, 0.05, C.WOOD, -0.32, 0.45, 0),
      k.box(0.05, 0.9, 0.05, C.WOOD, 0.32, 0.45, 0),    // posts
      k.cyl(0.02, 0.02, 0.8, C.WOOD, -0.12, 0.4, 0.06), // spear shaft
      k.cone(0.04, 0.16, C.STEEL, -0.12, 0.88, 0.06),   // spear head
      k.box(0.07, 0.55, 0.02, C.STEEL, 0.12, 0.42, 0.06), // sword blade
      k.box(0.18, 0.04, 0.03, C.GOLD, 0.12, 0.16, 0.06),  // sword guard
    ),
  },
  {
    id: 'armor-stand', label: 'Armor Stand', icon: '🛡', color: '#9aa3ad', category: 'Furniture',
    build: (k) => k.group(
      k.cyl(0.2, 0.22, 0.05, C.DARKWOOD, 0, 0.02, 0),   // base
      k.cyl(0.04, 0.04, 0.9, C.WOOD, 0, 0.45, 0),       // pole
      k.box(0.4, 0.4, 0.22, C.STEEL, 0, 0.78, 0),       // torso form
      k.sph(0.12, C.IRON, 0, 1.05, 0),                  // helm
      k.box(0.36, 0.1, 0.24, C.IRON, 0, 0.96, 0),       // pauldrons
      k.cyl(0.18, 0.18, 0.03, C.METAL, 0, 0.78, 0.16, 6), // round shield
      k.cyl(0.05, 0.05, 0.04, C.GOLD, 0, 0.78, 0.18, 6),  // shield boss
    ),
  },
  {
    id: 'wine-rack', label: 'Wine Rack', icon: '🍷', color: '#4a3220', category: 'Furniture',
    build: (k) => k.group(
      k.box(0.6, 0.7, 0.35, C.DARKWOOD, 0, 0.35, 0),    // outer frame
      k.box(0.56, 0.04, 0.33, C.WOOD, 0, 0.35, 0),      // shelf
      k.rot(k.box(0.66, 0.04, 0.33, C.WOOD, 0, 0.35, 0), 0, 0, 0.78), // lattice X
      k.rot(k.box(0.66, 0.04, 0.33, C.WOOD, 0, 0.35, 0), 0, 0, -0.78),
      k.rot(k.cyl(0.05, 0.05, 0.3, C.GREEN, -0.12, 0.5, 0.1), Math.PI / 2, 0, 0), // bottle
      k.rot(k.cyl(0.05, 0.05, 0.3, C.RED, 0.12, 0.5, 0.1), Math.PI / 2, 0, 0),
      k.rot(k.cyl(0.05, 0.05, 0.3, C.GREEN, 0, 0.2, 0.1), Math.PI / 2, 0, 0),
    ),
  },
  {
    id: 'chandelier', label: 'Chandelier', icon: '🕯', color: '#d4af37', category: 'Furniture',
    build: (k) => k.group(
      k.cyl(0.01, 0.01, 0.3, C.IRON, 0, 0.85, 0),       // chain to ceiling
      k.torus(0.3, 0.03, C.GOLD, 0, 0.7, 0),            // hanging ring
      k.cyl(0.05, 0.07, 0.1, C.IRON, 0, 0.72, 0),       // hub
      k.cyl(0.025, 0.025, 0.1, C.BONE, 0.3, 0.74, 0),   // candles around ring
      k.cyl(0.025, 0.025, 0.1, C.BONE, -0.3, 0.74, 0),
      k.cyl(0.025, 0.025, 0.1, C.BONE, 0, 0.74, 0.3),
      k.cyl(0.025, 0.025, 0.1, C.BONE, 0, 0.74, -0.3),
      k.cone(0.025, 0.07, k.emit(C.FIRE), 0.3, 0.82, 0), // flames
      k.cone(0.025, 0.07, k.emit(C.FIRE), -0.3, 0.82, 0),
      k.cone(0.025, 0.07, k.emit(C.FIRE), 0, 0.82, 0.3),
      k.cone(0.025, 0.07, k.emit(C.FIRE), 0, 0.82, -0.3),
    ),
  },
];
