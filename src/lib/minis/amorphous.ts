// Amorphous / formless generator — the monsters with NO skeleton at all:
// elementals (rising emissive columns), oozes (translucent blobs), a plant
// heap, a drifting ghost and a lone animated blade. They share the MiniKit toon
// materials + inverted-hull outlines and mm scale so they read as part of the
// same product line as the posed heroes and quadruped beasts, but each is its
// own compact primitive build — there's no rig to pose.
//
// Units are MILLIMETRES, base on y=0, facing +Z. The scene-map adapter
// (models3d/miniRecipe.ts → fromAmorphousRecipe) scales mm→cell units.
//
// HOW TO EXTEND: add an id to AMORPHOUS_IDS, then a `case` in buildAmorphous.
import type * as THREE_NS from 'three';
import { z } from 'zod';
import { makeMiniKit, type MiniKit } from './kit.ts';
import { resolvePalette } from './materials.ts';
import { MATERIAL_ROLES } from './recipe.ts';

export const AMORPHOUS_IDS = [
  'fire_elemental', 'water_elemental', 'air_elemental',
  'gelatinous_cube', 'black_pudding', 'shambling_mound',
  'ghost', 'flying_sword',
] as const;
export type AmorphousId = (typeof AMORPHOUS_IDS)[number];

export const AmorphousRecipeSchema = z.object({
  name: z.string().min(1).max(80),
  amorphous: z.enum(AMORPHOUS_IDS),
  materials: z.partialRecord(z.enum(MATERIAL_ROLES), z.string().max(30)).default({}),
});
export type AmorphousRecipe = z.infer<typeof AmorphousRecipeSchema>;
export type AmorphousRecipeInput = z.input<typeof AmorphousRecipeSchema>;

export function parseAmorphousRecipe(raw: unknown): AmorphousRecipe {
  return AmorphousRecipeSchema.parse(raw);
}

export interface BuiltAmorphous {
  group: THREE_NS.Group;
  heightMm: number;
}

export function buildAmorphous(THREE: typeof THREE_NS, recipe: AmorphousRecipe, kit?: MiniKit): BuiltAmorphous {
  const k = kit ?? makeMiniKit(THREE);
  const pal = resolvePalette(recipe.materials);
  const g = k.group();
  // Emissive, rim-free "energy" blob — self-lit against the dark.
  const emit = (color: number, r: number, x: number, y: number, z: number, intensity = 0.9) =>
    k.noOutline(k.sph(r, k.mat(color, { emissive: color, emissiveIntensity: intensity, rim: 0 }), x, y, z));
  const emitCone = (color: number, rad: number, h: number, x: number, y: number, z: number, intensity = 0.9) =>
    k.noOutline(k.cone(rad, h, k.mat(color, { emissive: color, emissiveIntensity: intensity, rim: 0 }), x, y, z, 8));

  switch (recipe.amorphous) {
    case 'fire_elemental': {
      const lava = 0xff5a18, fire = 0xff8a3a, ember = 0xffc24a;
      // A twisting tower of flame tapering to a point near the ground.
      g.add(emitCone(lava, 3, 8, 0, 4, 0, 1.1));
      g.add(k.noOutline(k.cone(7, 15, k.mat(fire, { emissive: fire, emissiveIntensity: 1, rim: 0 }), 0, 12, 0, 9).rotateY(0.4)));
      g.add(k.noOutline(k.cone(5.5, 16, k.mat(ember, { emissive: ember, emissiveIntensity: 0.9, rim: 0 }), 1.5, 20, 0, 9).rotateY(-0.6)));
      g.add(k.noOutline(k.cone(4, 15, k.mat(fire, { emissive: fire, emissiveIntensity: 1, rim: 0 }), -1.5, 28, 0, 9).rotateY(0.8)));
      g.add(emitCone(ember, 2.4, 11, 0.8, 36, 0));
      g.add(emitCone(lava, 1.4, 7, -0.8, 42, 0, 1.1));
      // side tongues + floating sparks
      g.add(k.noOutline(k.cone(2, 9, k.mat(fire, { emissive: fire, emissiveIntensity: 1, rim: 0 }), -5.5, 17, 1.5, 7).rotateZ(0.8)));
      g.add(k.noOutline(k.cone(2, 9, k.mat(ember, { emissive: ember, emissiveIntensity: 0.9, rim: 0 }), 5.5, 22, -1.5, 7).rotateZ(-0.8)));
      g.add(emit(ember, 1.2, 3.5, 30, 2)); g.add(emit(fire, 1, -3.5, 24, -2));
      break;
    }
    case 'water_elemental': {
      const water = 0x3b6ea5, light = 0x6fb0e0, ice = 0xbfe0f5;
      const w = (c: number, opacity: number) => k.mat(c, { opacity, rim: 0.4 });
      // Churning translucent column with a cresting top + rolling rings.
      g.add(k.cyl(7, 4, 28, w(water, 0.6), 0, 15, 0, 14));
      const crest = k.sph(8, w(water, 0.6), 0, 29, 0.5); crest.scale.set(1, 0.9, 1); g.add(crest);
      for (const [ry, rr] of [[9, 6.4], [17, 5.8], [25, 5]] as const) {
        g.add(k.torus(rr, 1.3, w(light, 0.55), 0, ry, 0, 16).rotateX(Math.PI / 2 + (ry % 3) * 0.05));
      }
      // flung droplets + an ice glint
      g.add(k.sph(1.8, w(light, 0.6), 5.5, 21, 3)); g.add(k.sph(1.5, w(light, 0.6), -5, 26, -2));
      g.add(k.sph(1.6, w(light, 0.6), 3, 33, 1.5));
      g.add(k.noOutline(k.sph(1.2, k.mat(ice, { opacity: 0.7, rim: 0.6 }), -2.5, 34, 2)));
      break;
    }
    case 'air_elemental': {
      const fog = 0xcfd6dd, pale = 0xeef3f8;
      const f = (o: number) => k.mat(fog, { emissive: fog, emissiveIntensity: 0.35, opacity: o, rim: 0 });
      // A faint rising spiral of pale wind — barely-there twisted rings + wisps.
      for (let i = 0; i < 6; i++) {
        const ry = 6 + i * 6, rr = 7.5 - i * 0.9;
        g.add(k.noOutline(k.torus(rr, 1.4, f(0.4), (i % 2 ? 1 : -1) * 1.2, ry, 0, 18).rotateX(Math.PI / 2).rotateZ((i % 2 ? 1 : -1) * 0.45)));
      }
      g.add(k.noOutline(k.sph(1.6, f(0.4), 3.5, 16, 1.5))); g.add(k.noOutline(k.sph(1.3, f(0.4), -3, 24, -1.5)));
      g.add(k.noOutline(k.sph(1.4, k.mat(pale, { emissive: pale, emissiveIntensity: 0.4, opacity: 0.45, rim: 0 }), 1.5, 36, 0)));
      break;
    }
    case 'gelatinous_cube': {
      const acid = 0x7bd23a, green = 0x4a9a2a, bone = pal.bone;
      // A near-clear acid cube with a few bones + a coin suspended inside.
      g.add(k.box(26, 26, 26, k.mat(acid, { opacity: 0.32, rim: 0.5 }), 0, 13.5, 0));
      g.add(k.noOutline(k.box(24, 24, 24, k.mat(green, { opacity: 0.16, rim: 0 }), 0, 13.5, 0))); // inner tint
      g.add(k.cap(0.8, 5, bone, -4, 15, 2).rotateZ(0.6).rotateY(0.4)); // femur
      g.add(k.cap(0.6, 3.2, bone, 5, 10, -2).rotateZ(0.3)); // bone bit
      g.add(k.sph(1.4, bone, 2, 19, 3)); // skull chip
      g.add(k.noOutline(k.cyl(1.4, 1.4, 0.5, k.mat(0xd4a03a, { rim: 0.4 }), -3, 8, -3, 12))); // coin
      break;
    }
    case 'black_pudding': {
      const o = (c: number) => k.mat(c, { opacity: 0.9, rim: 0.5 });
      const dark = 0x2a2a2e, lob = 0x3a3a40;
      // A low, melted, glistening blob of dark ooze — amorphous lobes.
      const base = k.sph(11, o(dark), 0, 7, 0); base.scale.set(1, 0.66, 1); g.add(base);
      g.add(k.sph(7, o(lob), 6, 6, 3)); g.add(k.sph(6.5, o(dark), -6.5, 5.5, -2));
      g.add(k.sph(5.5, o(lob), 1, 11, 4)); g.add(k.sph(4.5, o(dark), -2, 12, -4));
      g.add(k.sph(3, o(lob), 5, 13, -3)); // a rising bubble
      g.add(k.noOutline(k.sph(1.2, k.mat(0x55555c, { rim: 0.8 }), 2, 14, 5))); // wet glint
      break;
    }
    case 'shambling_mound': {
      const dirt = pal.leather, leaf = 0x5f8a45, leaf2 = 0x486e34, green = 0x6ea63a;
      // A hunched heap of rotting vines, leaves and muck — no clear head.
      const mud = k.sph(11, dirt, 0, 8, -1); mud.scale.set(1.1, 0.8, 1); g.add(mud);
      g.add(k.sph(9, leaf2, 0, 16, -1.5)); g.add(k.sph(7, leaf, -5, 14, 2.5));
      g.add(k.sph(6.5, green, 6, 13, 2)); g.add(k.sph(6, leaf2, 1, 22, 0.5)); // looming top
      for (const [vx, vy, vz, c] of [[-6, 17, 4, leaf], [6, 17, -2, leaf2], [2, 23, 5, green]] as const) {
        g.add(k.cone(1.6, 10, c, vx, vy, vz, 6).rotateX(0.3 * (vz > 0 ? 1 : -1))); // draping vines
      }
      for (const sd of [-1, 1] as const) g.add(k.cap(1, 6, dirt, sd * 8, 10, 3).rotateZ(sd * 0.5).rotateX(0.4)); // dangling roots
      break;
    }
    case 'ghost': {
      const pale = 0xbfe6ff, dim = 0x8fbfe0;
      const gm = (c: number, o: number) => k.mat(c, { emissive: c, emissiveIntensity: 0.35, opacity: o, rim: 0.3 });
      // A translucent upper body trailing into a wispy tail — no legs.
      const tail = k.cone(6, 20, gm(dim, 0.35), 0, 12, 0, 12); g.add(k.noOutline(tail));
      const torso = k.sph(6, gm(pale, 0.42), 0, 24, 0); torso.scale.set(1, 1.1, 0.85); g.add(k.noOutline(torso));
      g.add(k.noOutline(k.sph(4.2, gm(pale, 0.5), 0, 32, 0.5))); // head
      // hollow eyes + gaping mouth
      g.add(k.noOutline(k.sph(0.9, k.mat(0x0a1420, { rim: 0 }), -1.4, 33, 3.4)));
      g.add(k.noOutline(k.sph(0.9, k.mat(0x0a1420, { rim: 0 }), 1.4, 33, 3.4)));
      g.add(k.noOutline(k.sph(1, k.mat(0x0a1420, { rim: 0 }), 0, 30.5, 3.6)));
      // trailing arm wisps reaching forward
      for (const sd of [-1, 1] as const) g.add(k.noOutline(k.cap(1.6, 8, gm(pale, 0.38), sd * 6, 26, 2).rotateZ(sd * 0.7).rotateX(-0.5)));
      break;
    }
    case 'flying_sword': {
      const steel = pal.metal, gold = pal.metal2, arc = pal.magic;
      // A lone blade hovering point-down, wreathed in a faint arcane glimmer.
      g.add(k.box(2.4, 26, 0.7, k.mat(steel, { flat: true }), 0, 22, 0)); // blade
      g.add(k.cone(1.2, 4, k.mat(steel, { flat: true }), 0, 7, 0, 4)); // point
      g.add(k.box(9, 1.6, 1.6, k.mat(gold, { flat: true }), 0, 35, 0)); // crossguard
      g.add(k.cyl(0.9, 0.9, 5, k.mat(pal.leather), 0, 38.5, 0, 10)); // grip
      g.add(k.sph(1.4, k.mat(gold, { flat: true }), 0, 42, 0)); // pommel
      g.add(emit(arc, 2.4, 0, 35, 0, 0.4)); // glimmer at the hilt
      g.add(emit(arc, 1.4, 0, 10, 0, 0.35));
      break;
    }
  }

  k.addOutline(g);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g);
  if (Number.isFinite(bb.min.y)) g.position.y -= bb.min.y;
  const heightMm = Number.isFinite(bb.max.y) ? bb.max.y - bb.min.y : 34;
  return { group: g, heightMm };
}
