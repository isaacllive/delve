// Construct / plant generator — the humanoid-FORM monsters whose charm is a
// non-flesh silhouette: stone golems, a bark treant, an empty animated-armour
// suit, a straw scarecrow and a mushroom myconid. They're static (no combat
// pose), so instead of branching the posed biped rig they get their own compact
// builder here, sharing the MiniKit toon materials + inverted-hull outlines and
// mm scale so they still read as part of the same product line.
//
// Units are MILLIMETRES, base on y=0, facing +Z. The scene-map adapter
// (models3d/miniRecipe.ts → fromConstructRecipe) scales mm→cell units.
//
// HOW TO EXTEND: add an id to CONSTRUCT_IDS, then a `case` in buildConstruct.
import type * as THREE_NS from 'three';
import { z } from 'zod';
import { makeMiniKit, type MiniKit } from './kit.ts';
import { resolvePalette } from './materials.ts';
import { MATERIAL_ROLES } from './recipe.ts';

export const CONSTRUCT_IDS = [
  'golem', 'earth_elemental', 'treant', 'animated_armor', 'scarecrow', 'myconid',
] as const;
export type ConstructId = (typeof CONSTRUCT_IDS)[number];

export const ConstructRecipeSchema = z.object({
  name: z.string().min(1).max(80),
  construct: z.enum(CONSTRUCT_IDS),
  materials: z.partialRecord(z.enum(MATERIAL_ROLES), z.string().max(30)).default({}),
});
export type ConstructRecipe = z.infer<typeof ConstructRecipeSchema>;
export type ConstructRecipeInput = z.input<typeof ConstructRecipeSchema>;

export function parseConstructRecipe(raw: unknown): ConstructRecipe {
  return ConstructRecipeSchema.parse(raw);
}

export interface BuiltConstruct {
  group: THREE_NS.Group;
  heightMm: number;
}

export function buildConstruct(THREE: typeof THREE_NS, recipe: ConstructRecipe, kit?: MiniKit): BuiltConstruct {
  const k = kit ?? makeMiniKit(THREE);
  const pal = resolvePalette(recipe.materials);
  const g = k.group();
  const glow = (color: number, x: number, y: number, z: number, r = 0.6) => g.add(k.noOutline(k.sph(r, k.mat(color, { emissive: color, emissiveIntensity: 0.9, rim: 0 }), x, y, z)));

  switch (recipe.construct) {
    case 'golem':
    case 'earth_elemental': {
      const crag = recipe.construct === 'earth_elemental';
      const c = pal.stone, d = darken(c, 0.72), moss = 0x5a6b3a, rune = pal.magic;
      // legs: chunky stone pillars + boulder feet
      for (const sd of [-1, 1] as const) {
        g.add(k.bevelBox(6, 14, 6, c, sd * 4.5, 8, 0, 1.2));
        g.add(k.bevelBox(8, 4.5, 9, d, sd * 4.5, 2.2, 1, 1));
      }
      // pelvis + torso boulders
      g.add(k.bevelBox(15, 7, 10, c, 0, 15.5, 0, 1.5));
      const chest = k.bevelBox(18, 15, 12, c, 0, 25, 0, 2); chest.scale.set(1, 1, 0.9); g.add(chest);
      if (crag) { g.add(k.sph(6, c, -6, 30, 2)); g.add(k.sph(5, c, 7, 22, 2)); g.add(k.sph(3, moss, -7, 33, 3)); }
      // shoulders + hanging slab arms + boulder fists
      for (const sd of [-1, 1] as const) {
        g.add(k.sph(6.5, c, sd * 10, 31, 0));
        g.add(k.bevelBox(6, 15, 6, c, sd * 12, 22, 1, 1.2));
        g.add(k.bevelBox(8, 8, 8, d, sd * 12.5, 13, 2, 1.5)); // fist
      }
      // head: a blocky rock with glowing rune eyes
      g.add(k.bevelBox(10, 9, 10, c, 0, 37, 1, 1.5));
      glow(rune, -2.6, 38, 6, 1.1); glow(rune, 2.6, 38, 6, 1.1);
      // chest runes
      for (let i = 0; i < 3; i++) g.add(k.noOutline(k.box(1, 4, 1, k.mat(rune, { emissive: rune, emissiveIntensity: 0.8, rim: 0 }), (i - 1) * 3.5, 25, 6.4)));
      break;
    }
    case 'treant': {
      const bark = pal.wood, dk = darken(bark, 0.72), leaf = 0x5f8a45, leaf2 = 0x486e34, eye = pal.magic;
      // splayed roots
      for (const a of [0, 1, 2, 3, 4]) {
        const ang = (a / 5) * Math.PI * 2;
        g.add(k.cap(1.8, 8, dk, Math.cos(ang) * 5, 3, Math.sin(ang) * 4).rotateZ(Math.cos(ang) * 0.5).rotateX(-Math.sin(ang) * 0.4));
      }
      // trunk body (tapered), with knot bumps
      g.add(k.cyl(6, 8, 26, bark, 0, 18, 0, 10));
      g.add(k.sph(4, bark, 4, 20, 3)); g.add(k.sph(3.5, dk, -4, 14, 3));
      // carved face
      g.add(k.noOutline(k.sph(1.6, k.mat(0x120c08, { rim: 0 }), -3, 24, 6)));
      g.add(k.noOutline(k.sph(1.6, k.mat(0x120c08, { rim: 0 }), 3, 24, 6)));
      glow(eye, -3, 24, 6.4, 0.7); glow(eye, 3, 24, 6.4, 0.7);
      g.add(k.box(6, 1.4, 2, dk, 0, 19, 6)); // mouth hollow
      // branch arms reaching out + up
      for (const sd of [-1, 1] as const) {
        g.add(k.chain([[sd * 5, 28, 0], [sd * 12, 32, 1], [sd * 16, 30, 2]], 2.2, 0.9, bark, 10));
        g.add(k.chain([[sd * 12, 32, 1], [sd * 15, 38, -1]], 1.2, 0.5, bark, 8));
        // leaf clusters
        for (const [lx, ly, lz] of [[sd * 16, 31, 2], [sd * 15, 39, -1], [sd * 18, 34, 1]] as const) {
          const lf = k.sph(3.4, lz > 0 ? leaf : leaf2, lx, ly, lz); lf.scale.set(1, 0.8, 1); g.add(lf);
        }
      }
      // leafy crown
      for (const [cx, cy, cz, r] of [[0, 40, 0, 6], [-4, 43, 1, 4], [4, 42, -1, 4.5], [0, 45, 2, 3.5]] as const) {
        g.add(k.sph(r, cz >= 0 ? leaf : leaf2, cx, cy, cz));
      }
      break;
    }
    case 'animated_armor': {
      const m = pal.metal, m2 = darken(pal.metal, 0.72), ghost = pal.magic;
      // an EMPTY plate suit: pieces float in a humanoid arrangement over a void.
      for (const sd of [-1, 1] as const) {
        g.add(k.bevelBox(5, 12, 5, m, sd * 3.5, 8, 0, 0.6)); // greave
        g.add(k.bevelBox(6, 4, 8, m2, sd * 3.5, 2, 1.5, 0.6)); // sabaton
        g.add(k.sph(2.2, m, sd * 3.5, 14.5, 0)); // knee/thigh joint
      }
      // faulds + breastplate (curved) with a dark gap under it
      g.add(k.bevelBox(12, 4, 9, m2, 0, 17, 0, 0.8));
      const cuirass = k.sph(7.5, m, 0, 24, 0.5); cuirass.scale.set(1, 1.05, 0.65); g.add(cuirass);
      g.add(k.bevelBox(10, 2, 2, m2, 0, 20, 4.6, 0.4)); // belt line
      // pauldrons + empty gauntlet forearms
      for (const sd of [-1, 1] as const) {
        const p = k.sph(4.5, m, sd * 8, 30, 0); p.scale.set(1.1, 0.8, 1.1); g.add(p);
        g.add(k.bevelBox(4, 8, 4, m2, sd * 9, 20, 1.5, 0.5)); // gauntlet forearm
        g.add(k.sph(2.6, m, sd * 9.5, 15, 2)); // gauntlet fist
      }
      // floating helm with a dark visor + ghostly eyes; nothing between it and
      // the cuirass (the empty neck void sells "animated").
      const helm = k.bevelBox(7, 7, 7.5, m, 0, 34, 0.5, 1); g.add(helm);
      g.add(k.bevelBox(6, 2, 1, m2, 0, 33.5, 4, 0.3)); // visor slit
      g.add(k.cone(1.4, 5, m2, 0, 39, 0, 6)); // crest
      glow(ghost, -1.6, 34, 4, 0.7); glow(ghost, 1.6, 34, 4, 0.7);
      break;
    }
    case 'scarecrow': {
      const burlap = pal.cloth, straw = 0xd8b24a, wood = pal.wood, dk = darken(pal.cloth, 0.75);
      // cross-post: vertical stake + horizontal bar
      g.add(k.cyl(1.4, 1.6, 40, wood, 0, 20, -2, 8));
      g.add(k.cyl(1.1, 1.1, 30, wood, 0, 28, -2, 8).rotateZ(Math.PI / 2));
      // burlap sack body lashed to the stake
      const body = k.sph(8, burlap, 0, 22, 0); body.scale.set(1, 1.25, 0.9); g.add(body);
      g.add(k.cyl(6, 8, 3, dk, 0, 14, 0, 10)); // ragged hem
      g.add(k.box(11, 2, 2, dk, 0, 22, 6)); // stitched seam
      // straw-stuffed arms along the bar + tufts at the cuffs
      for (const sd of [-1, 1] as const) {
        g.add(k.cyl(2, 2.4, 13, burlap, sd * 8, 28, -2, 8).rotateZ(Math.PI / 2));
        for (let i = 0; i < 5; i++) g.add(k.cone(0.7, 4, straw, sd * 14, 28 + Math.cos(i) * 1.5, -2 + Math.sin(i) * 1.5, 5).rotateZ(sd * 1.2));
      }
      // straw at the waist + neck
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(k.cone(0.6, 3.5, straw, Math.cos(a) * 6, 15, Math.sin(a) * 4, 5).rotateX(1.2)); }
      // burlap head + stitched X eyes + floppy hat
      g.add(k.sph(5, burlap, 0, 35, 0.5));
      g.add(k.noOutline(k.box(2.4, 0.7, 0.7, k.mat(0x2a2018, { rim: 0 }), -2, 36, 4.6).rotateZ(0.6)));
      g.add(k.noOutline(k.box(2.4, 0.7, 0.7, k.mat(0x2a2018, { rim: 0 }), -2, 36, 4.6).rotateZ(-0.6)));
      g.add(k.noOutline(k.box(2.4, 0.7, 0.7, k.mat(0x2a2018, { rim: 0 }), 2, 36, 4.6).rotateZ(0.6)));
      g.add(k.noOutline(k.box(2.4, 0.7, 0.7, k.mat(0x2a2018, { rim: 0 }), 2, 36, 4.6).rotateZ(-0.6)));
      g.add(k.cyl(6, 6, 1, dk, 0, 39, 0.5, 12)); // hat brim
      g.add(k.cone(4, 6, dk, 0, 42, 0.5, 10)); // hat cone
      break;
    }
    case 'myconid': {
      const stalk = pal.bone, cap = 0xb0443a, spot = pal.bone, gill = darken(0xb0443a, 0.6);
      // stubby legs + stalk body
      for (const sd of [-1, 1] as const) g.add(k.cap(2.2, 4, stalk, sd * 3, 4, 0));
      g.add(k.cyl(4, 5.5, 16, stalk, 0, 12, 0, 12));
      // stubby arms
      for (const sd of [-1, 1] as const) g.add(k.cap(1.8, 5, stalk, sd * 5.5, 13, 0).rotateZ(sd * 0.5));
      // small face on the stalk
      g.add(k.noOutline(k.sph(0.9, k.mat(0x1a120c, { rim: 0 }), -1.6, 17, 4)));
      g.add(k.noOutline(k.sph(0.9, k.mat(0x1a120c, { rim: 0 }), 1.6, 17, 4)));
      // broad mushroom cap
      const dome = k.sph(10, cap, 0, 22, 0); dome.scale.set(1.1, 0.62, 1.1); g.add(dome);
      g.add(k.cyl(9, 6, 3, gill, 0, 20, 0, 16)); // gills underside
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; g.add(k.sph(1.4, spot, Math.cos(a) * 5, 24 + (i % 2), Math.sin(a) * 5)); }
      break;
    }
  }

  k.addOutline(g);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g);
  if (Number.isFinite(bb.min.y)) g.position.y -= bb.min.y;
  const heightMm = Number.isFinite(bb.max.y) ? bb.max.y - bb.min.y : 30;
  return { group: g, heightMm };
}

function darken(c: number, f: number): number {
  const r = Math.round(((c >> 16) & 0xff) * f), gg = Math.round(((c >> 8) & 0xff) * f), b = Math.round((c & 0xff) * f);
  return (r << 16) | (gg << 8) | b;
}
