// Quadruped beast generator — the non-biped companion to the humanoid engine.
//
// The humanoid rig (rig.ts) can't express an animal, so beasts get their own
// compact recipe + builder here. It reuses everything ELSE from the miniature
// line: the MiniKit toon materials + inverted-hull outlines (kit.ts), the named
// material presets (materials.ts) and the mm scale. A beast is described
// semantically — species + stance + palette — and this module owns the
// anatomy (horizontal spine, four legs, neck + head, tail, ears/snout), so any
// valid recipe comes out looking like part of the same product line as the
// heroes standing next to it on the table.
//
// Units are MILLIMETRES, base on y=0, facing +Z (nose forward). The scene-map
// adapter (models3d/miniRecipe.ts → fromBeastRecipe) scales mm→cell units.
//
// HOW TO EXTEND: add an id to BEAST_IDS, then a BeastSpec below. New anatomy
// (a frill, a shell) is a new spec flag + a branch in buildBeast.
import type * as THREE_NS from 'three';
import { z } from 'zod';
import { makeMiniKit, type MiniKit } from './kit.ts';
import { resolvePalette } from './materials.ts';
import { MATERIAL_ROLES } from './recipe.ts';

export const BEAST_IDS = [
  'wolf', 'dire_wolf', 'bear', 'boar', 'big_cat', 'giant_rat', 'crocodile',
  // winged reptiles — same rig + wings/horns/raised neck
  'drake', 'wyvern', 'great_dragon',
] as const;
export type BeastId = (typeof BEAST_IDS)[number];

export const BeastRecipeSchema = z.object({
  name: z.string().min(1).max(80),
  beast: z.enum(BEAST_IDS),
  stance: z.enum(['stand', 'prowl']).default('stand'),
  materials: z.partialRecord(z.enum(MATERIAL_ROLES), z.string().max(30)).default({}),
});
export type BeastRecipe = z.infer<typeof BeastRecipeSchema>;
export type BeastRecipeInput = z.input<typeof BeastRecipeSchema>;

export function parseBeastRecipe(raw: unknown): BeastRecipe {
  return BeastRecipeSchema.parse(raw);
}

interface BeastSpec {
  legLen: number;      // mm, ground → body underside (drives stance height)
  bodyLen: number;     // mm, nose-to-tail core length (along Z)
  bodyR: number;       // torso radius
  bodyFlat: number;    // vertical squash of the torso (1 = round, <1 = flatter back)
  neckLen: number;
  headR: number;
  snout: number;       // snout length forward
  legR: number;
  bulk: number;
  ear: 'pointed' | 'round' | 'tiny' | 'none';
  tail: 'bushy' | 'long' | 'thin' | 'stub' | 'thick';
  gait: 'upright' | 'sprawl';
  frontHeavy?: boolean;
  hump?: boolean;
  tusks?: boolean;
  scutes?: boolean;
  bristle?: boolean;
  mat?: 'fur' | 'scale';  // primary body material role (default fur)
  eye?: number;           // glowing eye colour
  // --- winged reptiles ----------------------------------------------------
  legs?: 2 | 4;           // wyverns stand on 2 (wings are the forelimbs)
  wings?: 'folded' | 'spread';
  headHorns?: boolean;    // back-swept cranial horns
  frill?: boolean;        // neck frill of spikes
  neckRaise?: number;     // 0 = head forward/low, 1 = reared up tall
  stinger?: boolean;      // barbed tail tip (wyvern)
}

const BEASTS: Record<BeastId, BeastSpec> = {
  wolf:      { legLen: 11, bodyLen: 26, bodyR: 4.4, bodyFlat: 0.92, neckLen: 6, headR: 4.0, snout: 5.0, legR: 1.5, bulk: 1.0, ear: 'pointed', tail: 'bushy', gait: 'upright', eye: 0xffd24a },
  dire_wolf: { legLen: 13, bodyLen: 32, bodyR: 6.0, bodyFlat: 0.92, neckLen: 7, headR: 5.0, snout: 6.0, legR: 2.0, bulk: 1.3, ear: 'pointed', tail: 'bushy', gait: 'upright', hump: true, eye: 0xff5a3a },
  bear:      { legLen: 12, bodyLen: 30, bodyR: 7.5, bodyFlat: 0.95, neckLen: 4, headR: 5.5, snout: 4.0, legR: 2.5, bulk: 1.5, ear: 'round', tail: 'stub', gait: 'upright', frontHeavy: true, hump: true },
  boar:      { legLen: 9,  bodyLen: 26, bodyR: 6.0, bodyFlat: 0.88, neckLen: 3, headR: 4.4, snout: 5.5, legR: 1.7, bulk: 1.2, ear: 'tiny', tail: 'thin', gait: 'upright', frontHeavy: true, tusks: true, bristle: true },
  big_cat:   { legLen: 12, bodyLen: 33, bodyR: 4.4, bodyFlat: 0.88, neckLen: 6, headR: 4.0, snout: 3.6, legR: 1.6, bulk: 1.0, ear: 'round', tail: 'long', gait: 'upright' },
  giant_rat: { legLen: 5,  bodyLen: 18, bodyR: 3.3, bodyFlat: 0.85, neckLen: 3, headR: 3.0, snout: 4.2, legR: 1.1, bulk: 0.8, ear: 'round', tail: 'thin', gait: 'upright' },
  crocodile: { legLen: 3,  bodyLen: 40, bodyR: 4.5, bodyFlat: 0.5,  neckLen: 2, headR: 3.6, snout: 10,  legR: 1.5, bulk: 1.2, ear: 'none', tail: 'thick', gait: 'sprawl', scutes: true, mat: 'scale', eye: 0xd2c24a },
  // --- winged reptiles -----------------------------------------------------
  drake:        { legLen: 5,  bodyLen: 28, bodyR: 4.2, bodyFlat: 0.78, neckLen: 9,  headR: 3.4, snout: 4.5, legR: 1.6, bulk: 1.2, ear: 'none', tail: 'long',  gait: 'upright', mat: 'scale', scutes: true, headHorns: true, wings: 'folded', neckRaise: 0.4, eye: 0xffd24a },
  wyvern:       { legLen: 12, bodyLen: 26, bodyR: 4.4, bodyFlat: 0.8,  neckLen: 10, headR: 3.8, snout: 5.0, legR: 2.3, bulk: 1.3, ear: 'none', tail: 'long',  gait: 'upright', mat: 'scale', headHorns: true, wings: 'spread', legs: 2, neckRaise: 0.62, stinger: true, eye: 0xff7a3a },
  great_dragon: { legLen: 10, bodyLen: 46, bodyR: 6.8, bodyFlat: 0.72, neckLen: 17, headR: 5.4, snout: 7.0, legR: 3.0, bulk: 1.6, ear: 'none', tail: 'thick', gait: 'upright', mat: 'scale', scutes: true, headHorns: true, frill: true, wings: 'spread', neckRaise: 1.0, eye: 0xffcf3a },
};

export interface BuiltBeast {
  group: THREE_NS.Group;
  heightMm: number;
}

/** Build a quadruped beast from a (validated) recipe. */
export function buildBeast(THREE: typeof THREE_NS, recipe: BeastRecipe, kit?: MiniKit): BuiltBeast {
  const k = kit ?? makeMiniKit(THREE);
  const s = BEASTS[recipe.beast];
  const pal = resolvePalette(recipe.materials);
  const bodyC = s.mat === 'scale' ? pal.scale : pal.fur;
  const bellyC = darken(bodyC, 0.8);
  const g = k.group();

  // Extruded flat membrane from a 2D outline (wing webs) — a real thin volume,
  // never a zero-thickness sheet.
  const membrane = (pts: [number, number][], depth: number, color: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    return new THREE.Mesh(geo, k.mat(color));
  };

  const prowl = recipe.stance === 'prowl';
  const legLen = s.legLen * (prowl ? 0.9 : 1);
  const H = legLen + s.bodyR * s.bodyFlat * 0.5; // body-core centre height
  const half = s.bodyLen * 0.45;

  // --- body: a horizontal spine capsule + shoulder / haunch masses, gathered
  // in a core group flattened vertically (scale.y) so the back reads like an
  // animal's rather than a fat tube.
  const core = k.group();
  core.position.set(0, H, 0);
  core.scale.y = s.bodyFlat;
  const body = k.cap(s.bodyR, s.bodyLen * 0.72, bodyC, 0, 0, 0);
  body.rotation.x = Math.PI / 2; // lay the capsule along Z
  core.add(body);
  const shoulderMass = k.sph(s.bodyR * (s.frontHeavy ? 1.3 : 1.05), bodyC, 0, s.hump ? s.bodyR * 0.4 : 0, half * 0.55);
  shoulderMass.scale.set(1, 1, 1.05);
  core.add(shoulderMass);
  core.add(k.sph(s.bodyR * 1.02, bodyC, 0, 0, -half * 0.6)); // haunch
  const belly = k.cap(s.bodyR * 0.8, s.bodyLen * 0.6, bellyC, 0, -s.bodyR * 0.45, 0); // pale underside
  belly.rotation.x = Math.PI / 2;
  core.add(belly);
  if (s.hump) {
    const hump = k.sph(s.bodyR * 0.95, bodyC, 0, s.bodyR * 0.6, half * 0.2);
    hump.scale.set(1, 0.9, 1.2);
    core.add(hump);
  }
  if (s.bristle) for (let i = 0; i < 6; i++) core.add(k.cone(0.5, 2.2, darken(bodyC, 0.7), 0, s.bodyR * 0.75, half * 0.4 - i * (s.bodyLen * 0.12), 5));
  if (s.scutes) for (let i = 0; i < 7; i++) core.add(k.cone(1.0, 1.4, darken(bodyC, 0.75), 0, s.bodyR * 0.6, half * 0.7 - i * (s.bodyLen * 0.2), 5));
  g.add(core);

  // --- legs: tapered capsules from the body underside to paws on y=0. Fronts
  // slightly ahead, rears slightly behind; sprawlers (croc) splay the legs wide
  // so the low body still clearly shows four feet.
  const spread = (s.gait === 'sprawl' ? s.bodyR * 1.3 : s.bodyR * 0.72);
  const legL = legLen + s.bodyR * s.bodyFlat * 0.5; // overlap up into the body
  const paw = (x: number, z: number) => {
    g.add(k.cap(s.legR, legL * 0.7, bodyC, x, legL * 0.5, z));
    g.add(k.sph(s.legR * 1.2, darken(bodyC, 0.72), x, s.legR * 0.5, z + 0.5)); // paw
  };
  if ((s.legs ?? 4) === 2) {
    // wyvern: one sturdy pair under the centre of mass (wings are the forelimbs)
    paw(spread * 1.15, half * 0.1);
    paw(-spread * 1.15, half * 0.1);
  } else {
    for (const z of [half * 0.6, -half * 0.62]) {
      paw(spread, z);
      paw(-spread, z);
    }
  }

  // --- wings (winged reptiles): an extruded membrane + a tapering leading-edge
  // bone, seated on the shoulders. Spread reptiles fan them out + back; a folded
  // drake tucks them along the flanks.
  if (s.wings) {
    const memC = darken(bodyC, 0.82);
    const isSpread = s.wings === 'spread';
    const span = s.bodyR * (isSpread ? 3.6 : 1.7);
    const rise = s.bodyR * (isSpread ? 2.4 : 2.2);
    // Wing web outline in local XY (x = span outward, y = up), with a scalloped
    // lower edge so it reads as a membrane between fingers.
    const top: [number, number][] = [[0, 0], [0.35 * span, 0.8 * rise], [0.72 * span, 0.92 * rise], [span, 0.62 * rise]];
    for (const sd of [-1, 1] as const) {
      const w = k.group();
      const outline: [number, number][] = [
        ...top.map(([x, y]) => [sd * x, y] as [number, number]),
        [sd * 0.82 * span, 0.2 * rise], [sd * 0.6 * span, 0.36 * rise], [sd * 0.34 * span, 0.06 * rise], [0, -0.02 * rise],
      ];
      w.add(membrane(outline, 0.7, memC));
      w.add(k.chain(top.map(([x, y]) => [sd * x, y, 0.15] as [number, number, number]), 0.55, 0.22, bodyC, 12));
      // finger struts from the leading edge down into the web
      for (const [fx, fy] of top.slice(1)) {
        w.add(k.chain([[sd * fx, fy, 0.1], [sd * fx * 0.8, fy * 0.3, 0.1]], 0.3, 0.18, bodyC, 6));
      }
      if (isSpread) {
        // fan out to the side + up, cocked slightly back
        w.position.set(sd * s.bodyR * 0.7, H + s.bodyR * 0.55, half * 0.15);
        w.rotation.set(0, sd * -0.32, sd * 0.18);
      } else {
        // folded: swept back along the flank, tips down
        w.position.set(sd * s.bodyR * 0.72, H + s.bodyR * 0.35, half * 0.05);
        w.rotation.set(-0.1, sd * 0.6, sd * -0.85);
      }
      g.add(w);
    }
  }

  // --- neck + head at the front (+Z). `neckRaise` rears the head up + back
  // (great dragon) instead of reaching forward (drake, beasts).
  const raise = s.neckRaise ?? 0;
  const neckBaseZ = half * 0.72;
  const headZ = neckBaseZ + s.neckLen * 0.7 * (1 - 0.5 * raise) + s.headR * 0.4;
  const headY = H + (prowl ? -s.bodyR * 0.3 : s.neckLen * 0.55) + (s.gait === 'sprawl' ? -s.bodyR * 0.4 : s.bodyR * 0.2) + s.neckLen * 1.15 * raise;
  const neck = k.cap(s.bodyR * 0.62, s.neckLen, bodyC, 0, (H + headY) / 2, (neckBaseZ + headZ) / 2 - s.headR * 0.3);
  // aim the neck from body toward the head
  neck.rotation.x = Math.PI / 2 - Math.atan2(headY - H, headZ - neckBaseZ);
  g.add(neck);

  const head = k.group();
  head.position.set(0, headY, headZ);
  head.add(k.sph(s.headR, bodyC, 0, 0, 0));
  // snout / muzzle forward
  const snout = k.cap(s.headR * 0.55, s.snout, s.mat === 'scale' ? bodyC : bellyC, 0, -s.headR * 0.15, s.headR * 0.5 + s.snout * 0.4);
  snout.rotation.x = Math.PI / 2;
  snout.scale.set(1, 1, s.mat === 'scale' ? 1 : 0.9);
  head.add(snout);
  head.add(k.sph(s.headR * 0.28, k.mat(0x1a120c, { rim: 0 }), 0, -s.headR * 0.05, s.headR * 0.5 + s.snout * 0.8)); // nose
  // eyes
  const eyeMat = s.eye !== undefined ? k.glow(s.eye, 0.95) : k.mat(0x14100c, { rim: 0 });
  for (const sd of [-1, 1] as const) {
    head.add(k.noOutline(k.sph(s.headR * 0.16, eyeMat, sd * s.headR * 0.4, s.headR * 0.12, s.headR * 0.55)));
  }
  // ears
  if (s.ear === 'pointed') {
    for (const sd of [-1, 1] as const) {
      const ear = k.cone(s.headR * 0.28, s.headR * 0.7, bodyC, sd * s.headR * 0.42, s.headR * 0.72, -s.headR * 0.1);
      ear.rotation.z = sd * -0.25;
      head.add(ear);
    }
  } else if (s.ear === 'round') {
    for (const sd of [-1, 1] as const) {
      const ear = k.sph(s.headR * 0.32, bodyC, sd * s.headR * 0.5, s.headR * 0.66, -s.headR * 0.05);
      ear.scale.set(1, 1, 0.5);
      head.add(ear);
    }
  } else if (s.ear === 'tiny') {
    for (const sd of [-1, 1] as const) head.add(k.sph(s.headR * 0.2, bodyC, sd * s.headR * 0.5, s.headR * 0.6, -s.headR * 0.05));
  }
  // teeth: tusks (boar) up-curved; croc gets a jaw tooth-row
  if (s.tusks) {
    for (const sd of [-1, 1] as const) {
      const tusk = k.cone(s.headR * 0.12, s.headR * 0.6, pal.bone, sd * s.headR * 0.3, -s.headR * 0.3, s.headR * 0.5 + s.snout * 0.7);
      tusk.rotation.x = -0.7;
      head.add(tusk);
    }
  }
  if (s.mat === 'scale') {
    // crocodile jaw line: a slim lower jaw slab under the snout
    const jaw = k.box(s.headR * 0.7, s.headR * 0.3, s.snout, bellyC, 0, -s.headR * 0.42, s.headR * 0.5 + s.snout * 0.4);
    head.add(jaw);
    for (let i = 0; i < 5; i++) head.add(k.cone(0.35, 0.9, pal.bone, s.headR * 0.28, -s.headR * 0.25, s.headR * 0.6 + i * (s.snout * 0.16), 4));
    for (let i = 0; i < 5; i++) head.add(k.cone(0.35, 0.9, pal.bone, -s.headR * 0.28, -s.headR * 0.25, s.headR * 0.6 + i * (s.snout * 0.16), 4));
  }
  // draconic cranial horns: back-swept curved pair
  if (s.headHorns) {
    for (const sd of [-1, 1] as const) {
      head.add(k.chain([
        [sd * s.headR * 0.5, s.headR * 0.5, -s.headR * 0.2],
        [sd * s.headR * 0.85, s.headR * 0.9, -s.headR * 0.85],
        [sd * s.headR * 0.78, s.headR * 0.6, -s.headR * 1.5],
      ], s.headR * 0.2, s.headR * 0.05, pal.bone, 10));
    }
  }
  // neck frill: a fan of spikes behind the skull
  if (s.frill) {
    for (let i = -2; i <= 2; i++) {
      const spike = k.cone(s.headR * 0.18, s.headR * (0.95 - Math.abs(i) * 0.13), darken(bodyC, 0.85), i * s.headR * 0.3, s.headR * 0.15, -s.headR * 0.95);
      spike.rotation.x = -0.9;
      head.add(spike);
    }
  }
  g.add(head);

  // --- tail off the rear (-Z), drooping and curling to stay support-safe. A
  // stinger tail (wyvern) instead arches UP + back and caps with a bone barb.
  const tailR = { bushy: 1.4, long: 1.0, thin: 0.55, stub: 1.2, thick: 2.2 }[s.tail] * (s.legR / 1.6);
  const tailLen = { bushy: 12, long: 18, thin: 14, stub: 5, thick: 22 }[s.tail];
  const tz = -half - 1;
  const tipY = s.stinger ? H + tailLen * 0.35 : (s.gait === 'sprawl' ? H * 0.5 : H - tailLen * 0.6);
  const tipZ = tz - tailLen;
  g.add(k.chain(
    [
      [0, H, tz],
      [0, s.stinger ? H + tailLen * 0.08 : H - tailLen * 0.15, tz - tailLen * 0.35],
      [0, s.stinger ? H + tailLen * 0.3 : H - tailLen * 0.4, tz - tailLen * 0.7],
      [0, tipY, tipZ],
    ],
    tailR, tailR * 0.3, bodyC, 18,
  ));
  if (s.stinger) {
    const barb = k.cone(tailR * 0.9, tailR * 3.2, pal.bone, 0, tipY + tailLen * 0.12, tipZ - tailR, 6);
    barb.rotation.x = -1.9;
    g.add(barb);
  }

  k.addOutline(g);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g);
  // ground the lowest point to y=0
  if (Number.isFinite(bb.min.y)) g.position.y -= bb.min.y;
  const heightMm = Number.isFinite(bb.max.y) ? bb.max.y - bb.min.y : H + s.headR;
  return { group: g, heightMm };
}

function darken(c: number, f: number): number {
  const r = Math.round(((c >> 16) & 0xff) * f), gg = Math.round(((c >> 8) & 0xff) * f), b = Math.round((c & 0xff) * f);
  return (r << 16) | (gg << 8) | b;
}
