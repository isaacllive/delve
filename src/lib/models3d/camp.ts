// Procedural low-poly builders for storage containers, camp gear, and travel
// props. Each `build(kit, color)` returns a THREE.Group in UNIT space (~1 cell,
// base on y=0, front +Z). These are DISTINCT from the generic crate/barrel/
// chest/campfire/torch/anvil that live elsewhere in the library.
import type { ModelDef } from './types.ts';
import { C } from './kit.ts';

export const MODELS: ModelDef[] = [
  // ── Containers ─────────────────────────────────────────────────────────
  {
    id: 'keg', label: 'Keg', icon: '🛢', color: '#7c5230', category: 'Containers',
    // Small barrel lying on its side, two iron hoops, bung on top.
    build: (kit) => {
      const body = kit.rot(kit.cyl(0.2, 0.2, 0.5, C.WOOD, 0, 0.22, 0), 0, 0, Math.PI / 2);
      const h1 = kit.rot(kit.cyl(0.205, 0.205, 0.05, C.IRON, -0.14, 0.22, 0), 0, 0, Math.PI / 2);
      const h2 = kit.rot(kit.cyl(0.205, 0.205, 0.05, C.IRON, 0.14, 0.22, 0), 0, 0, Math.PI / 2);
      const bung = kit.cyl(0.04, 0.04, 0.06, C.DARKWOOD, 0, 0.42, 0);
      return kit.group(body, h1, h2, bung);
    },
  },
  {
    id: 'sack', label: 'Sack', icon: '🧺', color: '#8a6f4a', category: 'Containers',
    // Lumpy cloth bag bulging at the base, cinched neck tied at top.
    build: (kit) => {
      const belly = kit.sph(0.26, C.CLOTH, 0, 0.26, 0);
      kit.at(belly, 0, 0.24, 0); belly.scale.set(1, 1.15, 1);
      const lump = kit.sph(0.14, C.CLOTH, 0.12, 0.18, 0.1);
      const neck = kit.cyl(0.09, 0.14, 0.14, C.CLOTH, 0, 0.5, 0);
      const tie = kit.torus(0.09, 0.025, C.LEATHER, 0, 0.5, 0);
      const top = kit.sph(0.1, C.CLOTH, 0, 0.6, 0);
      return kit.group(belly, lump, neck, tie, top);
    },
  },
  {
    id: 'basket', label: 'Basket', icon: '🧺', color: '#b07a4e', category: 'Containers',
    // Woven tapered basket, open top with a rim ring.
    build: (kit) => {
      const body = kit.cyl(0.26, 0.18, 0.34, C.CLAY, 0, 0.17, 0, 12);
      const inside = kit.cyl(0.22, 0.16, 0.3, C.DARKWOOD, 0, 0.19, 0, 12);
      const rim = kit.torus(0.25, 0.03, C.WOOD, 0, 0.34, 0, 12);
      const band = kit.cyl(0.245, 0.21, 0.04, C.WOOD, 0, 0.22, 0, 12);
      return kit.group(body, inside, rim, band);
    },
  },
  {
    id: 'lockbox', label: 'Lockbox', icon: '🔒', color: '#55585e', category: 'Containers',
    // Small reinforced strongbox with iron banding and a hanging lock.
    build: (kit) => {
      const body = kit.box(0.4, 0.26, 0.3, C.DARKWOOD, 0, 0.13, 0);
      const band1 = kit.box(0.42, 0.05, 0.32, C.IRON, -0.12, 0.13, 0);
      const band2 = kit.box(0.42, 0.05, 0.32, C.IRON, 0.12, 0.13, 0);
      const lid = kit.box(0.42, 0.05, 0.32, C.IRON, 0, 0.26, 0);
      const plate = kit.box(0.1, 0.12, 0.03, C.STEEL, 0, 0.14, 0.16);
      const lock = kit.box(0.08, 0.08, 0.04, C.METAL, 0, 0.08, 0.17);
      const shackle = kit.torus(0.04, 0.012, C.STEEL, 0, 0.13, 0.17, 10);
      return kit.group(body, band1, band2, lid, plate, lock, shackle);
    },
  },

  // ── Camp ───────────────────────────────────────────────────────────────
  {
    id: 'tent', label: 'Tent', icon: '⛺', color: '#8a6f4a', category: 'Camp',
    // Triangular-prism cloth tent with an open entrance flap.
    build: (kit) => {
      const roof = kit.rot(kit.cone(0.42, 0.55, C.CLOTH, 0, 0.275, 0, 4), 0, Math.PI / 4, 0);
      const flapL = kit.rot(kit.box(0.18, 0.42, 0.01, C.LEATHER, -0.1, 0.21, 0.28), 0, 0.4, 0);
      const flapR = kit.rot(kit.box(0.18, 0.42, 0.01, C.LEATHER, 0.1, 0.21, 0.28), 0, -0.4, 0);
      const pole = kit.cyl(0.02, 0.02, 0.62, C.DARKWOOD, 0, 0.31, -0.28);
      const peg = kit.cyl(0.015, 0.015, 0.12, C.WOOD, 0.34, 0.06, 0.1);
      return kit.group(roof, flapL, flapR, pole, peg);
    },
  },
  {
    id: 'bedroll', label: 'Bedroll', icon: '🛏', color: '#6e4a2c', category: 'Camp',
    // A tightly rolled cloth bundle lashed with two leather straps.
    build: (kit) => {
      const roll = kit.rot(kit.cyl(0.13, 0.13, 0.62, C.CLOTH, 0, 0.13, 0), Math.PI / 2, 0, 0);
      const end = kit.rot(kit.cyl(0.12, 0.05, 0.06, C.LEATHER, 0, 0.13, 0.31), Math.PI / 2, 0, 0);
      const strapA = kit.rot(kit.torus(0.135, 0.02, C.LEATHER, 0, 0.13, -0.16), Math.PI / 2, 0, 0);
      const strapB = kit.rot(kit.torus(0.135, 0.02, C.LEATHER, 0, 0.13, 0.16), Math.PI / 2, 0, 0);
      return kit.group(roll, end, strapA, strapB);
    },
  },
  {
    id: 'fire-pit', label: 'Fire Pit', icon: '🔥', color: '#ff7a2a', category: 'Camp',
    // Ring of stones around crossed logs and a glowing ember bed.
    build: (kit) => {
      const meshes = [];
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        meshes.push(kit.sph(0.08, C.STONE, Math.cos(a) * 0.28, 0.06, Math.sin(a) * 0.28));
      }
      const logA = kit.rot(kit.cyl(0.04, 0.04, 0.4, C.DARKWOOD, 0, 0.06, 0), 0, 0.4, Math.PI / 2);
      const logB = kit.rot(kit.cyl(0.04, 0.04, 0.4, C.DARKWOOD, 0, 0.06, 0), 0, -0.4, Math.PI / 2);
      const embers = kit.disc(0.2, kit.emit(C.EMBER), 0.04);
      const coal = kit.sph(0.06, kit.emit(C.FIRE), 0, 0.07, 0);
      return kit.group(...meshes, logA, logB, embers, coal);
    },
  },
  {
    id: 'cooking-pot', label: 'Cooking Pot', icon: '🍲', color: '#55585e', category: 'Camp',
    // Round iron pot slung from a three-legged tripod.
    build: (kit) => {
      const pot = kit.sph(0.18, C.IRON, 0, 0.2, 0);
      pot.scale.set(1, 0.85, 1);
      const lip = kit.torus(0.15, 0.02, C.IRON, 0, 0.3, 0, 12);
      const legs = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return kit.rot(kit.cyl(0.012, 0.012, 0.6, C.DARKWOOD, Math.cos(a) * 0.18, 0.3, Math.sin(a) * 0.18), Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      });
      const apex = kit.cyl(0.02, 0.02, 0.04, C.IRON, 0, 0.56, 0);
      return kit.group(pot, lip, ...legs, apex);
    },
  },
  {
    id: 'cauldron', label: 'Cauldron', icon: '🪄', color: '#3a3d42', category: 'Camp',
    // Big-bellied cauldron on three feet, glowing brew at the brim.
    build: (kit) => {
      const body = kit.sph(0.3, C.IRON, 0, 0.28, 0);
      body.scale.set(1, 0.9, 1);
      const rim = kit.torus(0.26, 0.03, C.DARKSTONE, 0, 0.42, 0, 16);
      const brew = kit.disc(0.24, kit.emit(C.ACID), 0.42);
      const feet = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        return kit.cyl(0.04, 0.05, 0.1, C.IRON, Math.cos(a) * 0.18, 0.05, Math.sin(a) * 0.18);
      });
      return kit.group(...feet, body, rim, brew);
    },
  },
  {
    id: 'wagon', label: 'Wagon', icon: '🛒', color: '#6f4f30', category: 'Camp', size: 2,
    // Four-wheeled flatbed wagon with raised sideboards.
    build: (kit) => {
      const bed = kit.box(0.9, 0.1, 0.55, C.PLANK, 0, 0.34, 0);
      const sideL = kit.box(0.9, 0.18, 0.04, C.WOOD, 0, 0.45, -0.27);
      const sideR = kit.box(0.9, 0.18, 0.04, C.WOOD, 0, 0.45, 0.27);
      const frontB = kit.box(0.04, 0.18, 0.55, C.WOOD, -0.45, 0.45, 0);
      const wheels = [[-0.34, -0.32], [0.34, -0.32], [-0.34, 0.32], [0.34, 0.32]].map(([x, z]) =>
        kit.rot(kit.cyl(0.18, 0.18, 0.06, C.DARKWOOD, x, 0.18, z), Math.PI / 2, 0, 0));
      const axle = kit.box(0.04, 0.04, 0.66, C.IRON, 0, 0.18, 0);
      return kit.group(bed, sideL, sideR, frontB, ...wheels, axle);
    },
  },
  {
    id: 'cart', label: 'Handcart', icon: '🛒', color: '#8a6a3e', category: 'Camp',
    // Two-wheel handcart with a tilted bed and a pair of pull handles.
    build: (kit) => {
      const bed = kit.box(0.5, 0.08, 0.5, C.PLANK, 0, 0.3, 0);
      const back = kit.box(0.5, 0.18, 0.04, C.WOOD, 0, 0.39, -0.23);
      const handleL = kit.rot(kit.cyl(0.02, 0.02, 0.5, C.WOOD, -0.18, 0.32, 0.34), 1.0, 0, 0);
      const handleR = kit.rot(kit.cyl(0.02, 0.02, 0.5, C.WOOD, 0.18, 0.32, 0.34), 1.0, 0, 0);
      const wheels = [-0.27, 0.27].map((x) =>
        kit.rot(kit.cyl(0.2, 0.2, 0.05, C.DARKWOOD, x, 0.2, 0), Math.PI / 2, 0, 0));
      const axle = kit.box(0.03, 0.03, 0.56, C.IRON, 0, 0.2, 0);
      return kit.group(bed, back, handleL, handleR, ...wheels, axle);
    },
  },
  {
    id: 'bucket', label: 'Bucket', icon: '🪣', color: '#8a6a3e', category: 'Camp',
    // Tapered wooden bucket with iron hoops and an arched handle.
    build: (kit) => {
      const body = kit.cyl(0.18, 0.14, 0.3, C.WOOD, 0, 0.15, 0, 14);
      const inside = kit.cyl(0.15, 0.12, 0.26, C.DARKWOOD, 0, 0.17, 0, 14);
      const hoopT = kit.torus(0.18, 0.015, C.IRON, 0, 0.28, 0, 14);
      const hoopB = kit.torus(0.15, 0.015, C.IRON, 0, 0.04, 0, 14);
      const handle = kit.rot(kit.torus(0.18, 0.012, C.METAL, 0, 0.3, 0, 14), 0, 0, 0);
      handle.scale.set(1, 1.4, 0.1);
      return kit.group(body, inside, hoopT, hoopB, handle);
    },
  },
  {
    id: 'lantern', label: 'Lantern', icon: '🏮', color: '#d4af37', category: 'Camp',
    // Caged metal lantern with a warm glowing core and a carry ring.
    build: (kit) => {
      const base = kit.cyl(0.1, 0.12, 0.05, C.IRON, 0, 0.025, 0, 10);
      const cage = kit.cyl(0.09, 0.09, 0.22, kit.mat(C.METAL, { opacity: 0.35 }), 0, 0.16, 0, 8);
      const core = kit.sph(0.06, kit.emit(C.EMBER), 0, 0.16, 0);
      const cap = kit.cone(0.12, 0.1, C.IRON, 0, 0.32, 0, 8);
      const ring = kit.torus(0.04, 0.012, C.METAL, 0, 0.4, 0, 10);
      const postA = kit.cyl(0.012, 0.012, 0.22, C.IRON, 0.08, 0.16, 0);
      const postB = kit.cyl(0.012, 0.012, 0.22, C.IRON, -0.08, 0.16, 0);
      return kit.group(base, cage, core, cap, ring, postA, postB);
    },
  },
  {
    id: 'hay-bale', label: 'Hay Bale', icon: '🌾', color: '#cabf94', category: 'Camp',
    // Round straw bale lying on its side with two binding cords.
    build: (kit) => {
      const bale = kit.rot(kit.cyl(0.28, 0.28, 0.5, C.PARCH, 0, 0.28, 0), 0, 0, Math.PI / 2);
      const cordA = kit.cyl(0.29, 0.29, 0.02, C.CLOTH, -0.12, 0.28, 0);
      const cordB = kit.cyl(0.29, 0.29, 0.02, C.CLOTH, 0.12, 0.28, 0);
      const swirl = kit.rot(kit.torus(0.16, 0.04, C.CLAY, 0.26, 0.28, 0, 12), 0, Math.PI / 2, 0);
      return kit.group(bale, cordA, cordB, swirl);
    },
  },
  {
    id: 'scarecrow', label: 'Scarecrow', icon: '🌾', color: '#8a6f4a', category: 'Camp',
    // Cross-post frame draped in straw cloth with a stuffed sack head.
    build: (kit) => {
      const post = kit.cyl(0.03, 0.03, 0.9, C.DARKWOOD, 0, 0.45, 0);
      const arms = kit.rot(kit.cyl(0.025, 0.025, 0.6, C.DARKWOOD, 0, 0.62, 0), 0, 0, Math.PI / 2);
      const body = kit.cone(0.18, 0.4, C.CLOTH, 0, 0.5, 0, 8);
      const head = kit.sph(0.12, C.PARCH, 0, 0.78, 0);
      const hat = kit.cone(0.16, 0.14, C.DARKWOOD, 0, 0.9, 0, 8);
      const strawL = kit.cone(0.04, 0.16, C.PARCH, -0.28, 0.62, 0, 6);
      const strawR = kit.cone(0.04, 0.16, C.PARCH, 0.28, 0.62, 0, 6);
      return kit.group(post, arms, body, head, hat, strawL, strawR);
    },
  },
  {
    id: 'market-stall', label: 'Market Stall', icon: '🏪', color: '#b23b3b', category: 'Camp', size: 2,
    // Wooden counter under four posts and a striped peaked awning.
    build: (kit) => {
      const counter = kit.box(0.9, 0.1, 0.4, C.PLANK, 0, 0.42, 0.2);
      const front = kit.box(0.9, 0.42, 0.04, C.WOOD, 0, 0.21, 0.39);
      const posts = [[-0.42, -0.2], [0.42, -0.2], [-0.42, 0.38], [0.42, 0.38]].map(([x, z]) =>
        kit.cyl(0.025, 0.025, 0.85, C.WOOD, x, 0.42, z));
      const awnRed = kit.rot(kit.box(0.95, 0.02, 0.7, C.RED, 0, 0.86, 0.05), 0.25, 0, 0);
      const awnW1 = kit.rot(kit.box(0.18, 0.02, 0.72, C.BONE, -0.3, 0.875, 0.05), 0.25, 0, 0);
      const awnW2 = kit.rot(kit.box(0.18, 0.02, 0.72, C.BONE, 0.18, 0.875, 0.05), 0.25, 0, 0);
      return kit.group(counter, front, ...posts, awnRed, awnW1, awnW2);
    },
  },
  {
    id: 'oil-barrel', label: 'Oil Barrel', icon: '🛢', color: '#4a3220', category: 'Containers',
    // Upright sealed barrel with iron hoops and a tap bung near the base.
    build: (kit) => {
      const body = kit.cyl(0.22, 0.22, 0.5, C.DARKWOOD, 0, 0.25, 0, 16);
      const belly = kit.cyl(0.25, 0.25, 0.24, C.DARKWOOD, 0, 0.25, 0, 16);
      const hoopT = kit.torus(0.23, 0.02, C.IRON, 0, 0.42, 0, 16);
      const hoopB = kit.torus(0.23, 0.02, C.IRON, 0, 0.08, 0, 16);
      const lid = kit.cyl(0.22, 0.22, 0.03, C.WOOD, 0, 0.5, 0, 16);
      const bung = kit.rot(kit.cyl(0.03, 0.03, 0.1, C.METAL, 0, 0.12, 0.25), Math.PI / 2, 0, 0);
      const drop = kit.sph(0.025, kit.emit(C.LAVA), 0, 0.06, 0.28);
      return kit.group(body, belly, hoopT, hoopB, lid, bung, drop);
    },
  },
  {
    id: 'sled', label: 'Sled', icon: '🛷', color: '#6f4f30', category: 'Camp',
    // Two curved runners under a planked bed for hauling over snow.
    build: (kit) => {
      const bed = kit.box(0.5, 0.06, 0.7, C.PLANK, 0, 0.16, 0);
      const slatA = kit.box(0.52, 0.02, 0.08, C.WOOD, 0, 0.2, -0.2);
      const slatB = kit.box(0.52, 0.02, 0.08, C.WOOD, 0, 0.2, 0.2);
      const runnerL = kit.box(0.06, 0.1, 0.74, C.DARKWOOD, -0.22, 0.07, 0);
      const runnerR = kit.box(0.06, 0.1, 0.74, C.DARKWOOD, 0.22, 0.07, 0);
      const tipL = kit.rot(kit.cyl(0.05, 0.05, 0.06, C.DARKWOOD, -0.22, 0.13, 0.36), 0, 0, Math.PI / 2);
      const tipR = kit.rot(kit.cyl(0.05, 0.05, 0.06, C.DARKWOOD, 0.22, 0.13, 0.36), 0, 0, Math.PI / 2);
      return kit.group(bed, slatA, slatB, runnerL, runnerR, tipL, tipR);
    },
  },
  {
    id: 'supply-crate', label: 'Supply Crate', icon: '📦', color: '#8a6a3e', category: 'Containers',
    // Wooden crate bound with crossed rope ties.
    build: (kit) => {
      const body = kit.box(0.46, 0.42, 0.46, C.PLANK, 0, 0.21, 0);
      const edgeT = kit.box(0.48, 0.04, 0.48, C.WOOD, 0, 0.42, 0);
      const ropeA = kit.box(0.5, 0.03, 0.04, C.LEATHER, 0, 0.21, 0);
      const ropeB = kit.box(0.04, 0.03, 0.5, C.LEATHER, 0, 0.21, 0);
      const ropeV1 = kit.box(0.04, 0.44, 0.5, C.LEATHER, 0, 0.21, 0);
      const knot = kit.sph(0.05, C.LEATHER, 0, 0.43, 0);
      return kit.group(body, edgeT, ropeA, ropeB, ropeV1, knot);
    },
  },
  {
    id: 'pack-saddle', label: 'Pack Saddle', icon: '🎒', color: '#6e4a2c', category: 'Camp',
    // Leather saddle with a pair of bulging packs slung either side.
    build: (kit) => {
      const seat = kit.sph(0.22, C.LEATHER, 0, 0.3, 0);
      seat.scale.set(1, 0.5, 1.2);
      const horn = kit.cyl(0.03, 0.04, 0.1, C.DARKWOOD, 0, 0.36, 0.18);
      const bagL = kit.box(0.12, 0.26, 0.3, C.CLOTH, -0.22, 0.16, 0);
      const bagR = kit.box(0.12, 0.26, 0.3, C.CLOTH, 0.22, 0.16, 0);
      const strap = kit.box(0.5, 0.04, 0.1, C.LEATHER, 0, 0.28, 0);
      const buckle = kit.box(0.05, 0.05, 0.02, C.METAL, -0.22, 0.28, 0.16);
      return kit.group(seat, horn, bagL, bagR, strap, buckle);
    },
  },
  {
    id: 'drying-rack', label: 'Drying Rack', icon: '🪢', color: '#6f4f30', category: 'Camp',
    // Two posts with a crossbar and hanging strips of cured meat or cloth.
    build: (kit) => {
      const postL = kit.cyl(0.025, 0.03, 0.7, C.DARKWOOD, -0.32, 0.35, 0);
      const postR = kit.cyl(0.025, 0.03, 0.7, C.DARKWOOD, 0.32, 0.35, 0);
      const bar = kit.rot(kit.cyl(0.02, 0.02, 0.72, C.WOOD, 0, 0.66, 0), 0, 0, Math.PI / 2);
      const strips = [-0.2, -0.05, 0.1, 0.25].map((x, i) =>
        kit.box(0.07, 0.3 - (i % 2) * 0.06, 0.02, i % 2 ? C.RED : C.LEATHER, x, 0.5, 0));
      return kit.group(postL, postR, bar, ...strips);
    },
  },
  {
    id: 'brazier-coals', label: 'Coal Brazier', icon: '🔥', color: '#ff7a2a', category: 'Camp',
    // Low metal bowl on stubby legs holding a bed of glowing coals.
    build: (kit) => {
      const bowl = kit.cyl(0.24, 0.16, 0.14, C.IRON, 0, 0.16, 0, 14);
      const rim = kit.torus(0.23, 0.02, C.DARKSTONE, 0, 0.23, 0, 14);
      const coals = kit.disc(0.2, kit.emit(C.EMBER), 0.21);
      const ember1 = kit.sph(0.05, kit.emit(C.FIRE), 0.06, 0.24, 0.04);
      const ember2 = kit.sph(0.04, kit.emit(C.LAVA), -0.05, 0.24, -0.05);
      const legs = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        return kit.cyl(0.02, 0.02, 0.16, C.IRON, Math.cos(a) * 0.16, 0.08, Math.sin(a) * 0.16);
      });
      return kit.group(...legs, bowl, rim, coals, ember1, ember2);
    },
  },
];
