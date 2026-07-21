// Gear library: every buildable weapon / focus / worn item, keyed by GearId.
// Hand-held gear is built GRIP-AT-ORIGIN with its long axis along +Y ("blade
// up"), so the builder can drop it into a hand socket and apply the item's
// `held` orientation. Worn gear knows its slot (back, belt, neck…) and is
// placed on the matching rig socket.
//
// Print-safety is enforced HERE, not in recipes: no dimension under ~1.2mm,
// handles thicker than realistic, blades chunky, straps fused, no dangling
// bits. Hard-surface pieces use bevelBox / flat-shaded cylinders so edges
// stay crisp against the smooth organic body.
//
// HOW TO ADD GEAR: add the id to GEAR_IDS in recipe.ts, then an entry in
// GEAR below. Pick the slot ('main' right hand, 'off' left hand, 'both'
// two-handed in the right, 'shield' left forearm, or a worn socket). Keep the
// grip at y∈[-1.5,1.5] so the fist covers it.
import type * as THREE_NS from 'three';
import type { MiniKit } from './kit.ts';
import type { Palette } from './materials.ts';
import type { GearId } from './recipe.ts';

export type GearSlot =
  | 'main' | 'off' | 'both' | 'dual'      // held
  | 'shield'                              // strapped to left forearm
  | 'back' | 'belt' | 'neck' | 'head' | 'body' | 'hands'; // worn

export interface GearDef {
  slot: GearSlot;
  /** Held-item orientation relative to the hand socket (euler radians).
   *  Default [π/2,0,0] points the +Y axis forward out of the fist. */
  held?: [number, number, number];
  /** Weapon whose long axis (+Y) should threaten toward the figure's facing:
   *  the builder yaw-corrects it in world space after posing (reaimWeapons)
   *  so the point/edge leads at the enemy instead of drifting wherever the
   *  arm chain left it. Only meaningful for one-handed held items — a
   *  two-hander re-aimed under one fist would tear out of the off hand. */
  aim?: boolean;
  build: (kit: MiniKit, pal: Palette) => THREE_NS.Group;
}

const H = Math.PI / 2;

// --- small shared pieces ----------------------------------------------------

/** Wrapped grip + pommel — shared by every one-handed weapon. */
function hilt(kit: MiniKit, pal: Palette, gripLen = 3.6, r = 0.85) {
  return kit.group(
    kit.cyl(r, r, gripLen, kit.mat(pal.leather), 0, 0, 0, 12),
    kit.sph(r * 1.15, kit.mat(pal.metal2, { flat: true }), 0, -gripLen / 2 - 0.4, 0),
  );
}

/** Custom extruded blade/plate from a 2D outline (crisp, beveled). */
function plate(kit: MiniKit, pts: [number, number][], depth: number, color: number) {
  const { THREE } = kit;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(depth - 0.5, 0.6), bevelEnabled: true,
    bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1, steps: 1,
  });
  geo.translate(0, 0, -Math.max(depth - 0.5, 0.6) / 2);
  return new THREE.Mesh(geo, kit.mat(color, { flat: true }));
}

function sword(kit: MiniKit, pal: Palette, bladeLen: number, bladeW: number) {
  // Tapered blade with a visible tip facet; thick enough to print (≥1.2mm).
  const blade = plate(kit, [
    [-bladeW / 2, 0], [bladeW / 2, 0],
    [bladeW * 0.36, bladeLen * 0.82], [0, bladeLen], [-bladeW * 0.36, bladeLen * 0.82],
  ], 1.3, pal.metal);
  blade.position.y = 2.2;
  return kit.group(
    blade,
    kit.bevelBox(bladeW * 2.4, 1.1, 1.8, kit.mat(pal.metal2, { flat: true }), 0, 2.0, 0), // crossguard
    hilt(kit, pal),
  );
}

function staffShaft(kit: MiniKit, pal: Palette, len: number, r = 0.9) {
  return kit.cyl(r * 0.92, r, len, kit.mat(pal.wood), 0, len * 0.28, 0, 12);
}

/** Floating magic wisps (outline-skipped) — the "innate magic" accent. */
function wisps(kit: MiniKit, color: number, n: number, spread: number, y0: number) {
  const g = kit.group();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = spread * (0.7 + 0.3 * ((i * 37) % 10) / 10);
    g.add(kit.sph(0.55 + 0.35 * (((i * 53) % 10) / 10), kit.glow(color, 0.9),
      Math.cos(a) * r, y0 + Math.sin(a * 2) * spread * 0.45, Math.sin(a) * r));
  }
  return kit.noOutline(g);
}

// --- the library -------------------------------------------------------------

export const GEAR: Record<GearId, GearDef> = {
  // Intentionally-empty hands (townsfolk). Skipped by the placement loop; it
  // exists so a non-empty `gear: ['none']` bypasses the class-default fallback.
  none: { slot: 'belt', build: (k) => k.group() },
  // Slight outward blade cant so a raised guard never crosses the face.
  sword: { slot: 'main', held: [H, 0, -0.3], aim: true, build: (k, p) => sword(k, p, 14, 2.0) },
  greatsword: {
    slot: 'both',
    build: (k, p) => {
      const s = sword(k, p, 19, 2.6);
      s.add(k.cyl(0.85, 0.85, 3, k.mat(p.leather), 0, -3.4, 0, 12)); // long two-hand grip
      return s;
    },
  },
  dagger: { slot: 'main', aim: true, build: (k, p) => {
    const g = kitDagger(k, p);
    return g;
  } },
  dual_daggers: { slot: 'dual', aim: true, build: (k, p) => kitDagger(k, p) },
  warhammer: {
    slot: 'main', aim: true,
    build: (k, p) => k.group(
      staffShaft(k, p, 11, 0.8),
      k.bevelBox(4.2, 2.5, 2.5, k.mat(p.metal, { flat: true }), 0, 6.2, 0, 0.45),
      k.bevelBox(1.8, 3.0, 3.0, k.mat(p.metal2, { flat: true }), 1.6, 6.2, 0, 0.35), // striking face
      k.cone(0.95, 1.9, k.mat(p.metal2, { flat: true }), -2.7, 6.2, 0).rotateZ(H),
    ),
  },
  great_axe: {
    slot: 'both',
    build: (k, p) => {
      const g = k.group(k.cyl(0.85, 1.0, 18, k.mat(p.wood), 0, 4, 0, 12));
      // Twin crescent blades: bearded profile, edge flaring past the haft.
      for (const s of [-1, 1] as const) {
        const blade = plate(k, [
          [0, 2.4], [s * 2.2, 2.8], [s * 3.8, 1.6], [s * 4.3, -0.6], [s * 3.4, -2.6], [s * 1.4, -1.6], [0, -1.9],
        ], 1.3, p.metal);
        blade.position.set(0, 10.6, 0);
        g.add(blade);
      }
      g.add(k.cyl(1.15, 1.15, 2.4, k.mat(p.metal2, { flat: true }), 0, 10.6, 0, 10));
      g.add(k.sph(1.15, k.mat(p.metal2, { flat: true }), 0, 12.6, 0));
      return g;
    },
  },
  rapier: {
    slot: 'main', aim: true,
    build: (k, p) => {
      const bell = k.sph(1.7, k.mat(p.metal, { flat: true }), 0, 1.9, 0);
      bell.scale.set(1, 0.7, 1);
      return k.group(
        k.cyl(0.55, 0.8, 15, k.mat(p.metal), 0, 9.2, 0, 10), // thickened for print
        k.cone(0.55, 1.6, k.mat(p.metal), 0, 17.5, 0),
        bell,
        hilt(k, p, 3.0, 0.7),
      );
    },
  },
  quarterstaff: { slot: 'both', build: (k, p) => k.group(staffShaft(k, p, 24)) },
  monk_staff: {
    slot: 'both',
    build: (k, p) => k.group(
      staffShaft(k, p, 24),
      k.cyl(1.05, 1.05, 1.1, k.mat(p.metal2, { flat: true }), 0, 12.2, 0, 12),
      k.cyl(1.05, 1.05, 1.1, k.mat(p.metal2, { flat: true }), 0, -5.0, 0, 12),
    ),
  },
  wizard_staff: {
    slot: 'main',
    build: (k, p) => k.group(
      staffShaft(k, p, 26),
      k.torus(1.6, 0.5, k.mat(p.wood), 0, 15.3, 0, 14).rotateY(0),
      k.noOutline(k.sph(1.5, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 0.9 }), 0, 15.3, 0)),
    ),
  },
  nature_staff: {
    slot: 'main',
    build: (k, p) => {
      const g = k.group(
        // Gnarled: stacked offset spheres up the shaft read as knots.
        k.cyl(0.8, 1.05, 24, k.mat(p.wood), 0, 6, 0, 10),
        k.sph(1.15, k.mat(p.wood), 0.4, 10, 0.2),
        k.sph(1.0, k.mat(p.wood), -0.4, 3, -0.2),
        // Antler-fork crown cradling a seed-glow.
        k.taperTube([[0, 17.5, 0], [1.6, 19.5, 0.3], [2.0, 21.3, 0.2]], 0.7, 0.35, k.mat(p.wood), 12),
        k.taperTube([[0, 17.5, 0], [-1.5, 19.6, -0.3], [-1.8, 21.4, -0.1]], 0.7, 0.35, k.mat(p.wood), 12),
        k.noOutline(k.sph(1.1, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 0.8 }), 0, 19.6, 0)),
      );
      for (let i = 0; i < 4; i++) {
        const leaf = k.sph(0.7, k.mat(0x6a9a4a), Math.cos(i * 2.4) * 1.6, 15.6 + i * 1.1, Math.sin(i * 2.4) * 1.4);
        leaf.scale.set(1, 0.5, 1.4);
        g.add(leaf);
      }
      return g;
    },
  },
  bow: {
    slot: 'off',
    // Tuned for the bow_drawn pose's raised bow-arm: this quarter-turn about X
    // stands the bow vertical with its broad face to the viewer. (A static hold
    // can't be vertical in every pose — the hand frame rotates with the arm —
    // so the roster archer drives this; carried bows hang along the arm.)
    held: [H * 0.95, 0, 0],
    build: (k, p) => {
      // Smooth recurve limbs: squashed-tube ribbons (not sphere chains — those
      // read scalloped at this radius).
      const limb = (sy: 1 | -1) => k.ribbon(
        [[0, 0, 1.2], [0, sy * 6, 2.2], [0, sy * 10.5, 0.9], [0, sy * 12.5, -0.6]],
        0.85, k.mat(p.wood), 0.75, 24,
      );
      const g = k.group(
        limb(1), limb(-1),
        k.cap(1.05, 3.2, k.mat(p.leather), 0, 0, 1.1), // wrapped grip
        // String: bold cylinder (print rule — never a hairline).
        k.cyl(0.3, 0.3, 24.2, k.mat(p.bone), 0, 0, -0.6, 6),
      );
      return g;
    },
  },
  sickle: {
    slot: 'main', aim: true,
    build: (k, p) => k.group(
      hilt(k, p, 3.2, 0.75),
      k.taperTube([[0, 2.2, 0], [0, 4.8, 1.6], [0, 6.2, 3.6], [0, 6.4, 5.6]], 0.85, 0.4, k.mat(p.metal), 16),
    ),
  },

  // Twin arming swords — one per hand (mirrored by the builder).
  dual_swords: { slot: 'dual', held: [H, 0, -0.2], aim: true, build: (k, p) => sword(k, p, 12, 1.9) },
  // Twin hand-axes (orc berserker) — reuse the one-handed axe in each hand.
  dual_axes: { slot: 'dual', held: [H, 0, -0.12], aim: true, build: (k, p) => GEAR.battleaxe.build(k, p) },
  // Curved sabre: a single asymmetric plate belly-out toward the edge.
  scimitar: {
    slot: 'main', held: [H, 0, -0.28], aim: true,
    build: (k, p) => {
      const blade = plate(k, [
        [-1.0, 0], [1.0, 0], [1.7, 4.5], [1.3, 9], [-0.1, 12.5], [-1.1, 11.5], [-0.7, 5.5],
      ], 1.25, p.metal);
      blade.position.y = 2.2;
      return k.group(
        blade,
        k.bevelBox(3.4, 1.0, 1.7, k.mat(p.metal2, { flat: true }), 0, 1.9, 0, 0.3), // curved guard
        hilt(k, p, 3.2, 0.8),
      );
    },
  },
  // One-handed war axe: short haft, single bearded crescent near the head.
  battleaxe: {
    slot: 'main', held: [H, 0, -0.12], aim: true,
    build: (k, p) => {
      const g = k.group(staffShaft(k, p, 12, 0.85));
      const blade = plate(k, [
        [0, 2.6], [2.4, 3.0], [4.0, 1.6], [4.4, -0.8], [3.4, -2.8], [1.4, -1.7], [0, -2.0],
      ], 1.3, p.metal);
      blade.position.set(0.5, 8.2, 0);
      g.add(blade);
      g.add(k.cyl(1.1, 1.1, 2.2, k.mat(p.metal2, { flat: true }), 0, 8.2, 0, 10));
      return g;
    },
  },
  // Flanged mace: stout haft + faceted head with a ring of blades.
  mace: {
    slot: 'main', aim: true,
    build: (k, p) => {
      const g = k.group(
        k.cyl(0.8, 0.9, 10, k.mat(p.leather), 0, 1.6, 0, 10),
        k.sph(1.7, k.mat(p.metal, { flat: true }), 0, 7.4, 0),
        k.cone(0.75, 1.4, k.mat(p.metal, { flat: true }), 0, 9.3, 0, 8),
      );
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(k.bevelBox(1.4, 1.9, 0.9, k.mat(p.metal2, { flat: true }), Math.cos(a) * 1.5, 7.4, Math.sin(a) * 1.5, 0.2).rotateY(-a));
      }
      return g;
    },
  },
  // Spear: long haft, leaf blade up top, butt-cap — one-handed so it pairs
  // with a shield (kept vertical by the default hold).
  spear: {
    slot: 'main', held: [H, 0, -0.06], aim: true,
    build: (k, p) => k.group(
      k.cyl(0.62, 0.7, 22, k.mat(p.wood), 0, 5, 0, 12),
      plate(k, [[-1.1, 0], [1.1, 0], [0.9, 3.2], [0, 5.4], [-0.9, 3.2]], 1.3, p.metal).translateY(16.2),
      k.cyl(0.85, 0.85, 1.2, k.mat(p.metal2, { flat: true }), 0, 16.0, 0, 10),
      k.cone(0.7, 1.3, k.mat(p.metal2, { flat: true }), 0, -6.4, 0, 8), // butt-spike
    ),
  },
  // Halberd: long haft, axe head + top spike + rear hook (two-handed).
  halberd: {
    slot: 'both',
    build: (k, p) => {
      const g = k.group(staffShaft(k, p, 26, 0.85));
      g.add(k.cone(0.8, 4.6, k.mat(p.metal, { flat: true }), 0, 22.0, 0, 8)); // top spike
      const blade = plate(k, [
        [0, 3.0], [3.8, 2.4], [4.8, 0.2], [3.4, -2.6], [0, -1.8],
      ], 1.3, p.metal);
      blade.position.set(0.6, 17.6, 0);
      g.add(blade);
      g.add(k.cone(0.6, 2.6, k.mat(p.metal2, { flat: true }), -1.9, 18.4, 0, 8).rotateZ(-H * 0.55)); // rear hook
      g.add(k.cyl(1.05, 1.05, 2.0, k.mat(p.metal2, { flat: true }), 0, 17.6, 0, 10));
      return g;
    },
  },
  // Crossbow: tiller along +Y (the default hold aims it forward), horizontal
  // prod + string + a loaded bolt.
  crossbow: {
    slot: 'both',
    build: (k, p) => k.group(
      k.bevelBox(1.9, 13, 2.2, k.mat(p.wood, { flat: true }), 0, 3.2, 0, 0.5), // tiller
      k.cyl(0.5, 0.5, 15, k.mat(p.metal2, { flat: true }), 0, 9.6, 1.3, 8).rotateZ(H), // prod
      k.cyl(0.26, 0.26, 15, k.mat(p.bone), 0, 9.6, -0.5, 6).rotateZ(H),               // string
      k.cyl(0.36, 0.36, 11, k.mat(p.wood), 0, 12.8, 0.4, 8),                          // bolt shaft
      k.cone(0.55, 1.6, k.mat(p.metal, { flat: true }), 0, 18.8, 0.4, 8),             // bolt head
    ),
  },
  // Crude bludgeons for brutes.
  club: {
    slot: 'main', aim: true,
    build: (k, p) => k.group(
      k.cyl(0.9, 1.35, 13, k.mat(p.wood), 0, 4.5, 0, 10),
      k.sph(1.9, k.mat(p.wood), 0, 11, 0),
      k.sph(0.9, k.mat(p.wood), 1.3, 8.5, 0.3),
    ),
  },
  greatclub: {
    slot: 'both',
    build: (k, p) => {
      const g = k.group(k.cyl(1.15, 1.9, 22, k.mat(p.wood), 0, 6, 0, 10));
      g.add(k.sph(3.0, k.mat(p.wood), 0, 17.5, 0));
      for (let i = 0; i < 4; i++) {
        g.add(k.sph(1.1, k.mat(p.wood), Math.cos(i * 1.7) * 2.2, 15 + i, Math.sin(i * 1.7) * 2.0)); // knots
      }
      return g;
    },
  },
  morningstar: {
    slot: 'main', aim: true,
    build: (k, p) => {
      const g = k.group(
        k.cyl(0.75, 0.9, 11, k.mat(p.wood), 0, 2.0, 0, 10),
        k.sph(2.0, k.mat(p.metal, { flat: true }), 0, 8.4, 0),
      );
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.add(k.cone(0.55, 1.8, k.mat(p.metal2, { flat: true }), Math.cos(a) * 2.0, 8.4, Math.sin(a) * 2.0, 6)
          .rotateZ(-a - H).rotateX(0));
      }
      g.add(k.cone(0.55, 1.8, k.mat(p.metal2, { flat: true }), 0, 10.6, 0, 6));
      return g;
    },
  },

  round_shield: {
    slot: 'shield',
    build: (k, p) => {
      const face = k.cyl(6.2, 6.6, 1.2, k.mat(p.wood, { flat: true }), 0, 0, 0, 22);
      face.rotation.x = H;
      return k.group(
        face,
        k.torus(6.2, 0.65, k.mat(p.metal2, { flat: true }), 0, 0, 0.1, 24),
        k.sph(1.7, k.mat(p.metal, { flat: true }), 0, 0, 0.9),
      );
    },
  },
  heater_shield: {
    slot: 'shield',
    build: (k, p) => {
      const face = plate(k, [
        [-5.2, 5.2], [5.2, 5.2], [5.0, 0.4], [0, -6.8], [-5.0, 0.4],
      ], 1.5, p.metal);
      return k.group(
        face,
        k.bevelBox(8.2, 1.4, 1.0, k.mat(p.metal2, { flat: true }), 0, 4.6, 0.4, 0.3),
      );
    },
  },
  spellbook: {
    slot: 'off',
    held: [H, 0, 0],
    build: (k, p) => {
      // Open book: two angled beveled leaves + page blocks. Chunky spine.
      const g = k.group();
      for (const s of [-1, 1] as const) {
        const cover = k.bevelBox(4.4, 0.8, 5.6, k.mat(p.leather, { flat: true }), s * 2.1, 0, 0, 0.25);
        cover.rotation.z = s * -0.35;
        const pages = k.bevelBox(3.9, 0.7, 5.0, k.mat(p.bone, { flat: true }), s * 2.0, 0.65, 0, 0.2);
        pages.rotation.z = s * -0.35;
        g.add(cover, pages);
      }
      g.add(k.cyl(0.6, 0.6, 5.4, k.mat(p.leather), 0, -0.1, 0, 8).rotateX(H));
      return g;
    },
  },
  occult_tome: {
    slot: 'off',
    held: [H, 0, 0],
    build: (k, p) => k.group(
      k.bevelBox(4.6, 1.9, 6.0, k.mat(p.leather, { flat: true }), 0, 0, 0, 0.4),
      k.bevelBox(4.9, 0.5, 6.3, k.mat(p.metal2, { flat: true }), 0, -0.75, 0, 0.2),
      k.torus(1.1, 0.35, k.mat(p.metal2, { flat: true }), 0, 1.0, 0.4, 14).rotateX(H),
      k.noOutline(k.sph(0.85, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 0.9 }), 0, 1.0, 0.4)), // the unblinking eye
    ),
  },
  orb: {
    slot: 'off',
    held: [0, 0, 0],
    build: (k, p) => k.group(
      k.cyl(1.4, 1.1, 1.2, k.mat(p.metal2, { flat: true }), 0, 0.4, 0, 10),
      k.noOutline(k.sph(1.9, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 0.85 }), 0, 2.2, 0)),
    ),
  },
  wand: {
    slot: 'main', aim: true,
    build: (k, p) => k.group(
      k.cyl(0.5, 0.7, 7.5, k.mat(p.wood), 0, 2.2, 0, 10),
      k.noOutline(k.sph(0.8, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 0.9 }), 0, 6.4, 0)),
    ),
  },
  lute: {
    slot: 'off',
    held: [H * 0.9, 0.3, 0.2],
    build: (k, p) => {
      const body = k.sph(4.0, k.mat(p.wood), 0, -1.5, 0);
      body.scale.set(0.78, 1.05, 0.42);
      const top = k.sph(3.0, k.mat(0xc8a860), 0, -0.9, 0.75);
      top.scale.set(0.7, 0.95, 0.22);
      return k.group(
        body, top,
        k.sph(0.9, k.mat(p.leather), 0, -1.6, 1.2), // sound-hole rosette
        k.box(1.5, 7.0, 1.1, k.mat(p.wood), 0, 5.4, 0.2), // neck
        k.bevelBox(2.0, 2.4, 1.4, k.mat(p.wood, { flat: true }), 0, 9.2, 0.2, 0.3), // pegbox
      );
    },
  },
  eldritch_flame: {
    // Main-hand: the flame belongs in the RAISED display hand of the cast
    // pose; the tome then falls to the low off hand.
    slot: 'main',
    held: [0, 0, 0],
    build: (k, p) => k.group(
      k.noOutline(k.group(
        k.sph(1.6, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 1.0 }), 0, 1.6, 0),
        k.chain([[0, 2.4, 0], [0.7, 4.0, 0.2], [0.3, 5.4, -0.2]], 1.0, 0.25, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 1.0 }), 8),
        k.chain([[0, 2.2, 0], [-0.8, 3.6, 0.1]], 0.7, 0.25, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 1.0 }), 6),
      )),
      wisps(k, p.magic, 5, 2.6, 2.4),
    ),
  },
  magic_hands: {
    slot: 'hands',
    build: (k, p) => wisps(k, p.magic, 7, 2.4, 0),
  },
  holy_symbol_held: {
    slot: 'off',
    held: [H, 0, 0],
    build: (k, p) => k.group(
      k.cyl(0.5, 0.5, 2.6, k.mat(p.metal2, { flat: true }), 0, 0.4, 0, 8),
      k.noOutline(k.group(
        k.box(1.1, 4.6, 1.1, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 0.7 }), 0, 3.6, 0),
        k.box(3.2, 1.1, 1.1, k.mat(p.magic, { emissive: p.magic, emissiveIntensity: 0.7 }), 0, 4.4, 0),
      )),
    ),
  },

  // --- worn ------------------------------------------------------------------
  cloak: {
    slot: 'back',
    build: (k, p) => {
      // Open cape shell down the back (concave toward the body), plus a short
      // collar-mantle over the shoulders — a drape, not a lathe cocoon.
      // Gathered narrow at the neck (small top radius) so the shoulders stay
      // clear and the side edges don't poke out under the arms; flares below.
      const cape = k.drape({
        color: p.cloth2, length: 21, radii: [1.9, 4.8, 6.6], wrap: 2.5,
        yTop: 1.6, thickness: 0.9, folds: 5, foldDepth: 1.0, flare: 1.6, curl: 2.0,
      });
      const mantle = k.drape({
        color: p.cloth2, length: 6.2, radii: [2.3, 3.5, 3.1], wrap: 2.9,
        yTop: 2.3, standoff: 0.2, thickness: 0.8, folds: 4, foldDepth: 0.5, flare: 0.3, curl: 0.5,
      });
      return k.group(cape, mantle);
    },
  },
  hooded_cloak: {
    slot: 'back',
    build: (k, p) => {
      const c = GEAR.cloak.build(k, p);
      c.userData.wantsHood = true; // builder adds the hood on the HEAD socket
      return c;
    },
  },
  quiver: {
    slot: 'back',
    build: (k, p) => {
      const g = k.group(
        k.cyl(1.5, 1.3, 8.5, k.mat(p.leather), 0, 0, 0, 12),
        k.torus(1.5, 0.35, k.mat(p.leather), 0, 3.6, 0, 12).rotateX(H),
      );
      for (let i = 0; i < 3; i++) {
        g.add(k.cone(0.55, 1.4, k.mat(p.cloth), (i - 1) * 0.8, 5.2, (i % 2) * 0.7 - 0.3)); // fletchings
      }
      g.rotation.z = 0.5;
      g.position.set(2.2, 1.5, -1.4);
      return k.group(g);
    },
  },
  backpack: {
    slot: 'back',
    build: (k, p) => k.group(
      k.bevelBox(6.0, 7.0, 3.4, k.mat(p.leather, { flat: true }), 0, -1.5, -1.8, 0.8),
      k.bevelBox(6.2, 2.6, 3.8, k.mat(p.leather, { flat: true }), 0, 1.6, -1.8, 0.6),
      k.cyl(1.5, 1.5, 7.0, k.mat(p.cloth), 0, 3.4, -1.4, 12).rotateZ(H), // bedroll
    ),
  },
  belt_pouch: {
    slot: 'belt',
    build: (k, p) => {
      const pouch = k.sph(1.7, k.mat(p.leather), 3.2, -0.6, 2.6);
      pouch.scale.set(1, 1.1, 0.75);
      return k.group(pouch, k.sph(1.1, k.mat(p.leather), 3.4, 0.4, 2.7));
    },
  },
  utility_belt: {
    slot: 'belt',
    build: (k, p) => {
      const g = k.group(k.torus(4.3, 0.8, k.mat(p.leather), 0, 0.4, 0, 20).rotateX(H));
      for (const [x, z] of [[-3.4, 2.2], [0, 3.6], [3.4, 2.2]] as const) {
        const pouch = k.sph(1.25, k.mat(p.leather), x, -0.9, z);
        pouch.scale.set(1, 1.2, 0.8);
        g.add(pouch);
      }
      return g;
    },
  },
  holy_symbol_necklace: {
    slot: 'neck',
    build: (k, p) => k.group(
      k.torus(2.6, 0.4, k.mat(p.metal2), 0, 1.8, 0.6, 18).rotateX(H * 0.35),
      k.box(0.9, 2.8, 0.7, k.mat(p.metal, { flat: true }), 0, -1.2, 2.4),
      k.box(2.0, 0.9, 0.7, k.mat(p.metal, { flat: true }), 0, -0.8, 2.4),
    ),
  },
  hand_wraps: {
    slot: 'hands',
    build: (k, p) => k.group(
      // Placed per-hand by the builder; this is one forearm's wrap stack.
      k.cyl(1.55, 1.45, 1.0, k.mat(p.cloth), 0, 0.6, 0, 12),
      k.cyl(1.5, 1.4, 1.0, k.mat(p.cloth), 0, -0.4, 0, 12),
      k.cyl(1.45, 1.35, 0.9, k.mat(p.cloth), 0, -1.3, 0, 12),
    ),
  },
  tabard: {
    slot: 'body',
    build: (k, p) => {
      // Waist-hung front panel to mid-shin — an accent stripe, not a door.
      // (Placed on the HIPS by the builder; y=0 here is the waist line.)
      const front = k.bevelBox(4.4, 10, 1.3, k.mat(p.cloth2), 0, -4.6, 3.0, 0.55);
      front.rotation.x = 0.08;
      const hem = k.bevelBox(5.0, 2.2, 1.3, k.mat(p.cloth2), 0, -9.3, 3.5, 0.5);
      hem.rotation.x = 0.08;
      return k.group(front, hem);
    },
  },
  fur_mantle: {
    slot: 'neck',
    build: (k, p) => {
      const g = k.group();
      // Shaggy collar draped over the shoulders (mass, not strands): lumps
      // ride LOW, WIDE and BACK so the head and chest stay clear.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        const lump = k.sph(1.7 + (i % 3) * 0.28, k.mat(p.fur), Math.cos(a) * 5.2, -1.2 + (i % 2) * 0.5, Math.sin(a) * 3.0 - 1.9);
        lump.scale.set(1, 0.72, 1);
        g.add(lump);
      }
      // Pelt tail hanging down the back.
      const pelt = k.cap(1.6, 4.5, k.mat(p.fur), 0, -5.2, -3.4);
      pelt.scale.set(1.4, 1, 0.6);
      g.add(pelt);
      return g;
    },
  },
  sash: {
    slot: 'body',
    build: (k, p) => k.group(
      k.ribbon([[-4.2, 6.5, 1.8], [0, 2.0, 3.6], [4.2, -2.0, 2.0], [3.6, -4.5, -0.5]], 1.15, k.mat(p.cloth2), 0.5),
    ),
  },
  leaf_charms: {
    slot: 'neck',
    build: (k, p) => {
      const g = k.group(k.torus(2.7, 0.35, k.mat(p.leather), 0, 1.6, 0.6, 16).rotateX(H * 0.35));
      for (let i = 0; i < 3; i++) {
        const leaf = k.sph(0.85, k.mat(0x6a9a4a), (i - 1) * 1.6, -0.6 - Math.abs(i - 1) * -0.4, 2.6);
        leaf.scale.set(0.8, 1.3, 0.35);
        leaf.rotation.z = (i - 1) * 0.5;
        g.add(leaf);
      }
      g.add(k.sph(0.7, k.mat(p.bone), 0.8, -1.2, 2.7));
      return g;
    },
  },
  wings: {
    slot: 'back',
    build: (k, p) => {
      const g = k.group();
      for (const s of [-1, 1] as const) {
        // Leading arm-bone + a couple of finger struts.
        g.add(k.cyl(0.55, 0.35, 13, k.mat(p.leather), s * 6.5, 5, -1.2, 8).rotateZ(s * 0.95));
        // Membrane webbed between the struts (thin plate in the XY plane).
        const web = plate(k, [
          [0, 0], [s * 11, 4], [s * 13, -1.5], [s * 10, -6], [s * 5, -6.5], [s * 1.5, -3.5],
        ], 0.8, p.cloth2);
        web.position.set(0, 4, -1.6);
        g.add(web);
        for (let i = 0; i < 3; i++) {
          g.add(k.cyl(0.28, 0.2, 6 - i, k.mat(p.leather), s * (4 + i * 2.5), 3 - i * 1.5, -1.6, 6).rotateZ(s * (0.5 - i * 0.25)));
        }
      }
      return g;
    },
  },
  feather_cap: {
    slot: 'head',
    build: (k, p) => {
      const brim = k.sph(3.9, k.mat(p.cloth2), 0, 0.4, 0);
      brim.scale.set(1.02, 0.4, 1.02);
      const crown = k.sph(3.0, k.mat(p.cloth2), 0, 1.2, 0);
      crown.scale.set(0.95, 0.75, 0.95);
      const feather = k.taperTube([[2.6, 1.6, -0.6], [4.2, 3.4, -1.6], [5.0, 5.6, -2.6]], 0.55, 0.22, k.mat(p.bone), 16);
      return k.group(brim, crown, feather);
    },
  },
};

function kitDagger(k: MiniKit, p: Palette) {
  const blade = plate(k, [[-0.9, 0], [0.9, 0], [0.3, 5.2], [0, 6.4], [-0.3, 5.2]], 1.2, p.metal);
  blade.position.y = 1.6;
  return k.group(
    blade,
    k.bevelBox(2.6, 0.8, 1.4, k.mat(p.metal2, { flat: true }), 0, 1.4, 0, 0.25),
    hilt(k, p, 2.6, 0.7),
  );
}
