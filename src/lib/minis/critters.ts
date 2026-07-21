// Critter generator — the small non-quadruped animals (arthropods, a serpent,
// an amphibian, a flyer, swarms) that the biped and quadruped rigs can't
// express. Like beast.ts it reuses the shared MiniKit toon materials +
// inverted-hull outlines and mm scale, so a giant spider reads as part of the
// same product line as the hero next to it.
//
// The workhorse is `segment(a, b, r)` — a capsule laid between two 3D points —
// which builds every leg, claw, tail, antenna and serpent body-link, so each
// critter is a handful of points rather than bespoke trig.
//
// Units are MILLIMETRES, base on y=0, facing +Z. The scene-map adapter
// (models3d/miniRecipe.ts → fromCritterRecipe) scales mm→cell units.
//
// HOW TO EXTEND: add an id to CRITTER_IDS, then a `case` in buildCritter.
import type * as THREE_NS from 'three';
import { z } from 'zod';
import { makeMiniKit, type MiniKit } from './kit.ts';
import { resolvePalette } from './materials.ts';
import { MATERIAL_ROLES } from './recipe.ts';

export const CRITTER_IDS = [
  'spider', 'scorpion', 'crab', 'centipede', 'snake', 'frog', 'bat',
  'rat_swarm', 'insect_swarm',
] as const;
export type CritterId = (typeof CRITTER_IDS)[number];

export const CritterRecipeSchema = z.object({
  name: z.string().min(1).max(80),
  critter: z.enum(CRITTER_IDS),
  materials: z.partialRecord(z.enum(MATERIAL_ROLES), z.string().max(30)).default({}),
});
export type CritterRecipe = z.infer<typeof CritterRecipeSchema>;
export type CritterRecipeInput = z.input<typeof CritterRecipeSchema>;

export function parseCritterRecipe(raw: unknown): CritterRecipe {
  return CritterRecipeSchema.parse(raw);
}

export interface BuiltCritter {
  group: THREE_NS.Group;
  heightMm: number;
}

type V3 = [number, number, number];

export function buildCritter(THREE: typeof THREE_NS, recipe: CritterRecipe, kit?: MiniKit): BuiltCritter {
  const k = kit ?? makeMiniKit(THREE);
  const pal = resolvePalette(recipe.materials);
  const g = k.group();

  // Capsule between two points — the universal limb/segment primitive.
  const segment = (a: V3, b: V3, r: number, color: number) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    const cap = k.cap(r, Math.max(len - r * 2, 0.01), color, mid.x, mid.y, mid.z);
    cap.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
    return cap;
  };
  const glowEyes = (at: V3[], r: number, color: number) => at.forEach(([x, y, z]) => g.add(k.noOutline(k.sph(r, k.glow(color, 0.95), x, y, z))));

  switch (recipe.critter) {
    case 'spider': {
      const c = pal.scale, cl = darken(c, 0.7);
      const abdomen = k.sph(5.2, c, 0, 4.2, -4); abdomen.scale.set(1, 0.9, 1.15); g.add(abdomen);
      g.add(k.sph(3.0, c, 0, 3.6, 2)); // cephalothorax
      g.add(k.sph(1.2, cl, 0, 5.6, -4)); // dorsal marking
      // 8 legs, 4 per side, arching out from the cephalothorax to feet on y=0.
      for (const sd of [-1, 1] as const) {
        const zs = [3.2, 1.2, -0.8, -2.8];
        zs.forEach((z, i) => {
          const reach = 6.5 + (1 - Math.abs(i - 1.5) / 2) * 2.5;
          const knee: V3 = [sd * (2.4 + reach * 0.5), 5.5, z + 1.5];
          g.add(segment([sd * 2, 3.4, z], knee, 0.55, c));
          g.add(segment(knee, [sd * (2.4 + reach), 0, z + 2.5], 0.42, c));
        });
      }
      g.add(segment([-1, 3, 3.6], [-1, 2, 5.4], 0.5, cl)); // chelicerae/fangs
      g.add(segment([1, 3, 3.6], [1, 2, 5.4], 0.5, cl));
      glowEyes([[-0.8, 4.2, 4.2], [0.8, 4.2, 4.2], [-1.6, 3.9, 3.9], [1.6, 3.9, 3.9]], 0.5, 0xff4040);
      break;
    }
    case 'scorpion': {
      const c = pal.scale, cl = darken(c, 0.72);
      // segmented body along -Z
      for (let i = 0; i < 4; i++) {
        const s = k.sph(3.4 - i * 0.4, c, 0, 3, 2 - i * 2.4); s.scale.set(1.1, 0.8, 1.1); g.add(s);
      }
      // 8 short walking legs
      for (const sd of [-1, 1] as const) [1.5, -0.5, -2.5].forEach((z) => {
        g.add(segment([sd * 2.4, 2.6, z], [sd * 4.8, 0, z + 0.5], 0.4, c));
      });
      // two front pincer arms
      for (const sd of [-1, 1] as const) {
        const wrist: V3 = [sd * 4.5, 2.6, 6];
        g.add(segment([sd * 2.6, 3, 4], wrist, 0.7, c));
        g.add(segment(wrist, [sd * 5.2, 2.6, 8.5], 0.55, c)); // claw upper
        g.add(segment(wrist, [sd * 3.6, 2.4, 8.5], 0.42, cl)); // claw lower
      }
      // tail curling up and over the back, ending in a stinger
      const tail: V3[] = [[0, 3, -7], [0, 6, -8], [0, 9, -6.5], [0, 10.5, -3.5], [0, 10, -0.5]];
      for (let i = 0; i < tail.length - 1; i++) g.add(segment(tail[i], tail[i + 1], 1.2 - i * 0.15, c));
      g.add(k.cone(1.1, 3, pal.bone, 0, 9, 1.5, 6).rotateX(1.3)); // stinger
      glowEyes([[-1, 3.6, 3.4], [1, 3.6, 3.4]], 0.4, 0xffd24a);
      break;
    }
    case 'crab': {
      const c = pal.scale, cl = darken(c, 0.72);
      const shell = k.sph(7, c, 0, 3.2, 0); shell.scale.set(1.5, 0.55, 1.1); g.add(shell);
      // eyestalks
      for (const sd of [-1, 1] as const) {
        g.add(segment([sd * 2, 3.6, 3], [sd * 2.2, 6, 4], 0.4, c));
        g.add(k.noOutline(k.sph(0.7, k.mat(0x101010, { rim: 0 }), sd * 2.2, 6.3, 4.2)));
      }
      // two big front claws
      for (const sd of [-1, 1] as const) {
        const wrist: V3 = [sd * 8, 2.4, 3.5];
        g.add(segment([sd * 5, 3, 2], wrist, 1.0, c));
        g.add(segment(wrist, [sd * 9.5, 2.4, 6.5], 0.9, c));
        g.add(segment(wrist, [sd * 7, 1.8, 6.5], 0.7, cl));
      }
      // 6 walking legs
      for (const sd of [-1, 1] as const) [1, -1.5, -4].forEach((z) => {
        g.add(segment([sd * 6, 2.6, z], [sd * 10, 0, z - 1], 0.5, c));
      });
      break;
    }
    case 'centipede': {
      const c = pal.scale, cl = darken(c, 0.7);
      const n = 9;
      const pts: V3[] = [];
      for (let i = 0; i < n; i++) pts.push([Math.sin(i * 0.6) * 3, 3, 10 - i * 2.6]);
      pts.forEach((p, i) => { const s = k.sph(i === 0 ? 3 : 2.6, i === 0 ? cl : c, ...p); s.scale.set(1, 0.85, 1); g.add(s); });
      for (let i = 1; i < n; i++) for (const sd of [-1, 1] as const) {
        g.add(segment([pts[i][0] + sd * 1.5, 2.6, pts[i][2]], [pts[i][0] + sd * 4, 0, pts[i][2]], 0.32, c));
      }
      // head: antennae + mandibles
      g.add(segment([-0.8, 3.4, 10.5], [-2, 5, 13], 0.3, c));
      g.add(segment([0.8, 3.4, 10.5], [2, 5, 13], 0.3, c));
      g.add(segment([-1, 2.6, 11], [-1.4, 2, 13], 0.35, cl));
      g.add(segment([1, 2.6, 11], [1.4, 2, 13], 0.35, cl));
      glowEyes([[-1.1, 3.6, 12], [1.1, 3.6, 12]], 0.4, 0xff5a3a);
      break;
    }
    case 'snake': {
      const c = pal.scale, belly = darken(c, 1.15);
      // a tight low coil at the back, then a tall S-neck rearing into a
      // striking head up front.
      const body: V3[] = [
        [-2, 1.6, -8], [3, 1.6, -6.5], [3.5, 1.6, -2.5], [-0.5, 1.6, -1], [-3, 2, 2],
        [-2, 5, 5], [1, 9, 8], [2, 12.5, 11],
      ];
      for (let i = 0; i < body.length - 1; i++) g.add(segment(body[i], body[i + 1], 2.6 - i * 0.18, c));
      g.add(k.sph(2.0, belly, 0, 1.0, -3)); // coil belly hint
      // head at the raised tip
      const head = k.group(); head.position.set(2, 12.5, 11);
      head.add(k.sph(2.4, c, 0, 0, 0));
      const snout = k.cap(1.4, 2, c, 0, -0.4, 2); snout.rotation.x = Math.PI / 2; head.add(snout);
      head.add(segment([0, -1, 3], [-0.6, -1.6, 5], 0.25, 0xd23a3a)); // forked tongue
      head.add(segment([0, -1, 3], [0.6, -1.6, 5], 0.25, 0xd23a3a));
      head.add(k.noOutline(k.sph(0.5, k.glow(0xffd24a, 0.95), -1, 0.6, 1.4)));
      head.add(k.noOutline(k.sph(0.5, k.glow(0xffd24a, 0.95), 1, 0.6, 1.4)));
      g.add(head);
      break;
    }
    case 'frog': {
      const c = pal.skin, cl = darken(c, 0.78);
      const body = k.sph(6, c, 0, 4.2, 0); body.scale.set(1.25, 0.78, 1.15); g.add(body);
      g.add(k.box(7, 0.6, 0.6, cl, 0, 3.2, 5)); // wide mouth line
      // bulging eyes on top
      for (const sd of [-1, 1] as const) {
        g.add(k.sph(1.8, c, sd * 2.4, 7.2, 2.6));
        g.add(k.sph(1.0, k.glow(0xf2d23a, 0.9), sd * 2.4, 7.7, 3.4));
        g.add(k.noOutline(k.sph(0.5, k.mat(0x101010, { rim: 0 }), sd * 2.4, 7.7, 4.0)));
      }
      // folded hind haunches + front feet
      for (const sd of [-1, 1] as const) {
        const h = k.sph(3.2, c, sd * 5, 3, -3); h.scale.set(0.8, 1, 1.2); g.add(h);
        g.add(segment([sd * 5, 1.4, -3], [sd * 5.5, 0, 3], 1.0, cl));
        g.add(k.box(2.4, 0.8, 2, cl, sd * 3.2, 0.4, 5)); // webbed front foot
      }
      break;
    }
    case 'bat': {
      const c = pal.fur, mem = darken(c, 0.85);
      g.add(k.cap(1.8, 3, c, 0, 8, 0)); // body
      g.add(k.sph(1.9, c, 0, 11, 0.4)); // head
      for (const sd of [-1, 1] as const) {
        g.add(k.cone(0.9, 2.6, c, sd * 1, 13, 0, 6).rotateZ(sd * -0.2)); // big ears
        g.add(k.noOutline(k.sph(0.4, k.glow(0xff5a3a, 0.95), sd * 0.7, 11.2, 1.6)));
        // spread membrane wing
        w(sd);
        // little clawed feet
        g.add(segment([sd * 0.8, 6.6, 0], [sd * 1.4, 4.5, -0.4], 0.35, c));
      }
      function w(sd: 1 | -1) {
        const span = 11, rise = 5;
        const top: [number, number][] = [[0, 0], [0.4 * span, 0.7 * rise], [0.75 * span, 0.85 * rise], [span, 0.5 * rise]];
        const outline: [number, number][] = [
          ...top.map(([x, y]) => [sd * x, y] as [number, number]),
          [sd * 0.8 * span, 0.15 * rise], [sd * 0.55 * span, 0.3 * rise], [sd * 0.3 * span, 0.02 * rise], [0, -0.05 * rise],
        ];
        const shape = new THREE.Shape();
        shape.moveTo(outline[0][0], outline[0][1]);
        outline.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
        geo.translate(0, 0, -0.25);
        const wing = new THREE.Mesh(geo, k.mat(mem));
        wing.position.set(sd * 1.5, 8.5, 0);
        wing.rotation.y = sd * -0.2;
        g.add(wing);
        g.add(k.chain(top.map(([x, y]) => [sd * (1.5 + x), 8.5 + y, 0] as V3), 0.4, 0.18, c, 10));
      }
      break;
    }
    case 'rat_swarm': {
      const c = pal.fur, tail = 0xd0a0a0;
      const spots: [number, number][] = [[-6, 4], [5, -3], [1, 7], [-3, -6], [7, 3], [-7, -2], [2, -8]];
      spots.forEach(([x, z], i) => {
        const b = k.sph(2 + (i % 2) * 0.4, c, x, 2, z); b.scale.set(1.3, 0.85, 1.6); g.add(b);
        g.add(k.sph(1.2, c, x + 0.4, 2.3, z + 2.4)); // head
        g.add(segment([x, 1.6, z - 2], [x + (i % 2 ? 2 : -2), 0.8, z - 5], 0.3, tail));
      });
      break;
    }
    case 'insect_swarm': {
      const c = darken(pal.fur, 0.5);
      const spots: V3[] = [[-6, 6, 3], [5, 9, -3], [1, 12, 5], [-3, 7, -6], [7, 10, 2], [-7, 13, -2], [2, 8, -8], [4, 14, 6], [-5, 11, 7], [0, 6, -3], [6, 7, -6], [-2, 15, 1]];
      spots.forEach(([x, y, z], i) => {
        g.add(k.sph(0.9 + (i % 3) * 0.2, c, x, y, z));
        for (const sd of [-1, 1] as const) { const wing = k.sph(0.6, k.mat(0xbfc4c8, { opacity: 0.5, rim: 0 }), x + sd * 1, y + 0.4, z); wing.scale.set(1.4, 0.4, 0.7); g.add(k.noOutline(wing)); }
      });
      break;
    }
  }

  k.addOutline(g);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g);
  if (Number.isFinite(bb.min.y)) g.position.y -= bb.min.y;
  const heightMm = Number.isFinite(bb.max.y) ? bb.max.y - bb.min.y : 8;
  return { group: g, heightMm };
}

function darken(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 0xff) * f)), gg = Math.min(255, Math.round(((c >> 8) & 0xff) * f)), b = Math.min(255, Math.round((c & 0xff) * f));
  return (r << 16) | (gg << 8) | b;
}
