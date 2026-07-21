// Species / ancestry system: per-species PROPORTIONS (scaling the shared rig)
// and MARKER builders (ears, beards, horns, tails, snouts…) attached to rig
// sockets. Proportions carry species readability at silhouette level; markers
// carry it at feature level. Both are deliberately exaggerated — a dwarf is
// SHORT and BROAD, not "a bit stocky".
//
// HOW TO ADD A SPECIES
// 1. Add its id to SPECIES_IDS in recipe.ts.
// 2. Add a SpeciesSpec here: proportion multipliers + default markers.
// 3. If it needs new anatomy, add a marker to SPECIES_MARKERS (recipe.ts) and
//    a case in buildSpeciesFeatures below. Markers attach to rig sockets
//    (headTop / face / hipRear), never to raw mesh positions, so they follow
//    every pose for free.
import type { MiniKit } from './kit.ts';
import type { Rig, RigDims } from './rig.ts';
import { HUMAN_DIMS } from './rig.ts';
import type { SpeciesId, SpeciesMarker, MaterialRole } from './recipe.ts';
import type { Palette } from './materials.ts';

export interface SpeciesSpec {
  /** Multipliers on HUMAN_DIMS. */
  height: number;   // overall stature
  bulk: number;     // limb/torso thickness
  head: number;     // head radius (small folk get BIGGER relative heads)
  legs: number;     // hip height share (dwarves: short legs, low centre)
  shoulders: number;
  arms: number;
  /** Default feature set — recipe speciesMarkers ADD to this; a recipe that
   *  wants "no beard" simply lists markers without beard entries and sets
   *  replaceMarkers below. */
  markers: SpeciesMarker[];
  /** Chest-forward lean in radians (dragonborn pride, halfling eagerness). */
  lean?: number;
  /** Palette roles this species pins unless the recipe overrides them —
   *  goblin-green skin, skeleton bone. Sits between the class palette and
   *  the recipe's own materials in the merge order. */
  palette?: Partial<Record<MaterialRole, string>>;
}

export const SPECIES: Record<SpeciesId, SpeciesSpec> = {
  human:      { height: 1.0,  bulk: 1.0,  head: 1.0,  legs: 1.0,  shoulders: 1.0,  arms: 1.0,  markers: ['short_hair'] },
  elf:        { height: 1.08, bulk: 0.88, head: 0.95, legs: 1.06, shoulders: 0.92, arms: 1.04, markers: ['pointed_ears', 'long_hair', 'slender_build'] },
  dwarf:      { height: 0.78, bulk: 1.38, head: 1.12, legs: 0.78, shoulders: 1.22, arms: 0.95, markers: ['braided_beard', 'broad_nose', 'short_stout_body'] },
  halfling:   { height: 0.62, bulk: 1.0,  head: 1.28, legs: 0.88, shoulders: 0.95, arms: 0.95, markers: ['small_and_nimble', 'short_hair'] },
  gnome:      { height: 0.58, bulk: 0.95, head: 1.38, legs: 0.85, shoulders: 0.92, arms: 0.95, markers: ['small_and_nimble', 'topknot'] },
  half_orc:   { height: 1.1,  bulk: 1.28, head: 1.05, legs: 0.96, shoulders: 1.2,  arms: 1.06, markers: ['tusks', 'heavy_jaw', 'topknot'] },
  tiefling:   { height: 1.02, bulk: 0.96, head: 1.0,  legs: 1.02, shoulders: 0.96, arms: 1.0,  markers: ['horns', 'tail', 'long_hair'] },
  dragonborn: { height: 1.12, bulk: 1.3,  head: 1.08, legs: 0.94, shoulders: 1.18, arms: 1.04, markers: ['draconic_head', 'scaled_hide', 'tail'], lean: 0.06 },
  // --- monster humanoids ---------------------------------------------------
  // goblin/orc pin their skin (and goblin hair) palette so enemy tokens read
  // green/grey-green across the table before their label does.
  goblin:     { height: 0.66, bulk: 0.92, head: 1.24, legs: 0.86, shoulders: 0.9,  arms: 1.02, markers: ['pointed_ears', 'snout', 'small_and_nimble'], lean: 0.06,
                palette: { skin: 'green_skin', hair: 'black_hair' } },
  orc:        { height: 1.16, bulk: 1.42, head: 1.0,  legs: 0.98, shoulders: 1.3,  arms: 1.12, markers: ['tusks', 'heavy_jaw', 'topknot'],
                palette: { skin: 'grey_green_skin' } },
  kobold:     { height: 0.58, bulk: 0.84, head: 1.2,  legs: 0.82, shoulders: 0.84, arms: 0.96, markers: ['horns', 'tail', 'snout', 'scaled_hide', 'small_and_nimble'], lean: 0.1 },
  hobgoblin:  { height: 1.06, bulk: 1.16, head: 1.0,  legs: 1.0,  shoulders: 1.14, arms: 1.02, markers: ['pointed_ears', 'heavy_jaw', 'short_hair'] },
  bugbear:    { height: 1.28, bulk: 1.44, head: 1.06, legs: 0.94, shoulders: 1.32, arms: 1.18, markers: ['pointed_ears', 'snout', 'mane'], lean: 0.08 },
  gnoll:      { height: 1.18, bulk: 1.08, head: 1.0,  legs: 1.06, shoulders: 1.06, arms: 1.1,  markers: ['snout', 'pointed_ears', 'mane'], lean: 0.1 },
  lizardfolk: { height: 1.06, bulk: 1.16, head: 1.0,  legs: 0.98, shoulders: 1.12, arms: 1.06, markers: ['draconic_head', 'scaled_hide', 'tail'], lean: 0.05 },
  // --- large bipedal monsters (ModelDef sets size:2; the extra stature +
  // heavy bulk make them tower over a size-1 human once the map scales both) --
  ogre:       { height: 1.3,  bulk: 1.75, head: 0.9,  legs: 0.92, shoulders: 1.5,  arms: 1.22, markers: ['heavy_jaw', 'broad_nose', 'bald'], lean: 0.06 },
  troll:      { height: 1.32, bulk: 1.42, head: 0.95, legs: 1.02, shoulders: 1.32, arms: 1.42, markers: ['snout', 'pointed_ears', 'bald'], lean: 0.16 },
  giant:      { height: 1.42, bulk: 1.62, head: 0.96, legs: 1.02, shoulders: 1.46, arms: 1.16, markers: ['full_beard', 'heavy_jaw'], lean: 0.04 },
  minotaur:   { height: 1.3,  bulk: 1.56, head: 1.02, legs: 0.96, shoulders: 1.42, arms: 1.2,  markers: ['horns', 'snout', 'mane'], lean: 0.1 },
  werewolf:   { height: 1.24, bulk: 1.36, head: 1.0,  legs: 0.94, shoulders: 1.32, arms: 1.32, markers: ['snout', 'pointed_ears', 'mane'], lean: 0.18 },
  // --- undead --------------------------------------------------------------
  // Skeleton pins the body-layer roles too (the rig dresses torso/limbs in
  // cloth colours) so the whole figure reads as bare bone, not a grey shirt;
  // leather stays leather so belts/straps read as gear remnants.
  skeleton:   { height: 1.0,  bulk: 0.6,  head: 1.0,  legs: 1.0,  shoulders: 0.88, arms: 1.0,  markers: ['bald', 'broad_nose', 'undead_bones'],
                palette: { skin: 'undead_bone', cloth: '#e8e0cc', cloth2: '#cfc6ae', hair: 'white_hair' } },
};

/** Apply species multipliers to the human baseline. */
export function speciesDims(id: SpeciesId): RigDims {
  const s = SPECIES[id];
  const h = HUMAN_DIMS;
  return {
    height: h.height * s.height,
    headR: h.headR * s.head * (0.7 + 0.3 * s.height), // small folk: big but not bobblehead
    hipY: h.hipY * s.height * s.legs,
    torsoLen: h.torsoLen * s.height * (2 - s.legs) * 0.92,
    shoulderHalf: h.shoulderHalf * s.shoulders * (0.6 + 0.4 * s.height),
    hipHalf: h.hipHalf * (0.55 + 0.45 * s.bulk) * (0.6 + 0.4 * s.height),
    upperArm: h.upperArm * s.height * s.arms,
    foreArm: h.foreArm * s.height * s.arms,
    bulk: h.bulk * s.bulk,
    neckLen: h.neckLen * s.height,
  };
}

/** Merge recipe markers over species defaults (recipe adds; duplicates ok). */
export function effectiveMarkers(id: SpeciesId, recipeMarkers: SpeciesMarker[]): Set<SpeciesMarker> {
  return new Set([...SPECIES[id].markers, ...recipeMarkers]);
}

/** Sculpt species features onto the rig. Called after the rig exists, before
 *  posing (sockets follow joints, so order doesn't matter for correctness —
 *  building first keeps the code simpler to reason about). */
export function buildSpeciesFeatures(
  kit: MiniKit, rig: Rig, species: SpeciesId, markers: Set<SpeciesMarker>, pal: Palette,
): void {
  const d = rig.dims;
  const hr = d.headR;
  const skin = pal.skin;
  const { headTop, face, hipRear } = rig.sockets;

  // --- face: simplified but expressive — two bold eye dots + a nose bump.
  // Tiny features skip the outline pass (a hull would double their size).
  const draconic = markers.has('draconic_head');
  const eyeY = draconic ? hr * 0.3 : hr * 0.04;
  const eyeZ = draconic ? hr * 0.68 : hr * 0.82;
  for (const s of [-1, 1] as const) {
    rig.head.add(kit.noOutline(kit.sph(hr * 0.13, kit.mat(0x241c14, { rim: 0 }), s * hr * 0.34, eyeY, eyeZ)));
    // Brow line: gives the face a readable expression at arm's length.
    const brow = kit.noOutline(kit.sph(hr * 0.16, kit.mat(draconic ? pal.scale : skin), s * hr * 0.34, eyeY + hr * 0.22, eyeZ - hr * 0.02));
    brow.scale.set(1.5, 0.5, 0.6);
    rig.head.add(brow);
  }
  if (!draconic && !markers.has('broad_nose')) {
    rig.head.add(kit.noOutline(kit.sph(hr * 0.17, kit.mat(skin), 0, -hr * 0.14, hr * 0.9)));
  }

  // --- ears ---------------------------------------------------------------
  if (markers.has('pointed_ears')) {
    for (const s of [-1, 1] as const) {
      const ear = kit.cone(hr * 0.22, hr * 0.85, skin, s * hr * 0.92, hr * 0.1, -hr * 0.05);
      ear.rotation.z = s * -1.25; // sweep up + out
      ear.rotation.y = s * 0.35;
      rig.head.add(ear);
    }
  }

  // --- hair / beards. Sculpted as SOLID MASSES (print rule: no strands). ---
  // Hair caps sit high and pulled BACK so the face stays open — the front
  // edge must stop above the brow line.
  const hairC = pal.hair;
  // Fringe: a flattened wedge along the front hairline so the cut reads from
  // the front too (the cap alone only shows from behind).
  const fringe = () => {
    const f = kit.sph(hr * 0.72, hairC, 0, hr * 0.62, hr * 0.42);
    f.scale.set(1.15, 0.5, 0.85);
    rig.head.add(f);
  };
  if (markers.has('long_hair')) {
    const capMass = kit.sph(hr * 1.02, hairC, 0, hr * 0.3, -hr * 0.24);
    capMass.scale.set(0.98, 0.88, 1.0);
    rig.head.add(capMass);
    fringe();
    // Back fall: fused wedge down the neck.
    const fall = kit.cap(hr * 0.55, hr * 1.1, hairC, 0, -hr * 0.55, -hr * 0.78);
    fall.scale.set(1.25, 1, 0.65);
    rig.head.add(fall);
  } else if (markers.has('short_hair')) {
    const capMass = kit.sph(hr * 1.0, hairC, 0, hr * 0.32, -hr * 0.22);
    capMass.scale.set(0.96, 0.8, 0.98);
    rig.head.add(capMass);
    fringe();
  } else if (markers.has('topknot')) {
    const scalp = kit.sph(hr * 0.98, hairC, 0, hr * 0.38, -hr * 0.26);
    scalp.scale.set(0.94, 0.66, 0.94);
    rig.head.add(scalp);
    headTop.add(kit.sph(hr * 0.34, hairC, 0, hr * 0.55, -hr * 0.15));
    headTop.add(kit.cap(hr * 0.2, hr * 0.5, hairC, 0, hr * 0.28, -hr * 0.15));
  }
  // 'bald' and 'draconic_head': no hair mass.

  if (markers.has('braided_beard') || markers.has('full_beard')) {
    // One fused beard mass around the jaw — below the eye line, face open.
    const beard = kit.sph(hr * 0.78, hairC, 0, -hr * 0.62, hr * 0.38);
    beard.scale.set(1.0, 0.8, 0.72);
    rig.head.add(beard);
    const spade = kit.cap(hr * 0.34, hr * 0.6, hairC, 0, -hr * 1.15, hr * 0.42);
    spade.scale.set(1.25, 1, 0.7);
    rig.head.add(spade);
    // Moustache ridge over the beard top.
    const stache = kit.sph(hr * 0.3, hairC, 0, -hr * 0.34, hr * 0.82);
    stache.scale.set(1.6, 0.55, 0.6);
    rig.head.add(stache);
    if (markers.has('braided_beard')) {
      for (const s of [-1, 1] as const) {
        rig.head.add(kit.taperTube(
          [[s * hr * 0.38, -hr * 0.85, hr * 0.6], [s * hr * 0.46, -hr * 1.6, hr * 0.5], [s * hr * 0.42, -hr * 2.2, hr * 0.35]],
          hr * 0.22, hr * 0.13, hairC, 10,
        ));
      }
    }
  }

  // --- nose / jaw ----------------------------------------------------------
  if (markers.has('broad_nose')) {
    face.add(kit.sph(hr * 0.3, skin, 0, hr * 0.08, hr * 0.05));
  }
  if (markers.has('heavy_jaw')) {
    const jaw = kit.sph(hr * 0.62, skin, 0, -hr * 0.52, hr * 0.28);
    jaw.scale.set(1.15, 0.7, 0.9);
    rig.head.add(jaw);
  }
  if (markers.has('tusks')) {
    for (const s of [-1, 1] as const) {
      const tusk = kit.cone(hr * 0.14, hr * 0.5, pal.bone, s * hr * 0.34, -hr * 0.42, hr * 0.72);
      tusk.rotation.x = -0.25;
      rig.head.add(tusk);
    }
  }

  // --- undead: sunken eye sockets + a sculpted rib cage — the "skeleton"
  // read at table distance. Ribs are solid raised bands (print rule: no thin
  // free-floating loops), a shade darker than the bone skin so they read. ----
  if (markers.has('undead_bones')) {
    const boneShade = (() => {
      const c = typeof skin === 'number' ? skin : 0xe8e0cc;
      const r = Math.round(((c >> 16) & 0xff) * 0.78), g = Math.round(((c >> 8) & 0xff) * 0.78), b = Math.round((c & 0xff) * 0.72);
      return (r << 16) | (g << 8) | b;
    })();
    for (const s of [-1, 1] as const) {
      const socket = kit.noOutline(kit.sph(hr * 0.24, kit.mat(0x241c14, { rim: 0 }), s * hr * 0.34, hr * 0.06, hr * 0.72));
      socket.scale.set(1.15, 1.0, 0.55);
      rig.head.add(socket);
    }
    const chestTop = d.torsoLen * 0.58; // shoulder line in chest space
    for (let i = 0; i < 3; i++) {
      const rib = kit.cap(0.55, d.shoulderHalf * (0.95 - i * 0.16), boneShade, 0, chestTop * (0.55 - i * 0.22), d.shoulderHalf * 0.6);
      rib.rotation.z = Math.PI / 2;
      rig.chest.add(rib);
    }
  }

  // --- snout / muzzle (goblinoids, kobolds, gnolls): a protruding forward mass
  // + nose tip, scale-coloured on reptiles. Not drawn when draconic_head owns
  // the whole face already.
  if (markers.has('snout') && !markers.has('draconic_head')) {
    const snoutC = markers.has('scaled_hide') ? pal.scale : skin;
    const muzzle = kit.sph(hr * 0.5, kit.mat(snoutC), 0, -hr * 0.16, hr * 0.7);
    muzzle.scale.set(0.85, 0.68, 1.18);
    rig.head.add(muzzle);
    rig.head.add(kit.sph(hr * 0.18, kit.mat(snoutC), 0, -hr * 0.08, hr * 1.06));
    // nostril dots
    for (const s of [-1, 1] as const) {
      rig.head.add(kit.noOutline(kit.sph(hr * 0.06, kit.mat(0x241c14, { rim: 0 }), s * hr * 0.1, -hr * 0.02, hr * 1.12)));
    }
  }

  // --- mane / crest (gnoll, bugbear): a back-swept ruff of fur cones.
  if (markers.has('mane')) {
    const maneC = pal.fur;
    for (let i = 0; i < 5; i++) {
      const s = i - 2;
      const spike = kit.cone(hr * 0.2, hr * (0.65 + 0.12 * (2 - Math.abs(s))), kit.mat(maneC), s * hr * 0.3, hr * 0.28, -hr * 0.72);
      spike.rotation.x = -1.0;
      spike.rotation.z = -s * 0.18;
      rig.head.add(spike);
    }
  }

  // --- horns (tiefling: smooth ram-curl tubes rising CLEAR of any hair mass) -
  if (markers.has('horns') && !markers.has('draconic_head')) {
    for (const s of [-1, 1] as const) {
      rig.head.add(kit.taperTube(
        [
          [s * hr * 0.52, hr * 0.62, hr * 0.35],
          [s * hr * 0.88, hr * 1.3, 0],
          [s * hr * 1.05, hr * 1.05, -hr * 0.75],
          [s * hr * 0.95, hr * 0.5, -hr * 1.2],
        ],
        hr * 0.26, hr * 0.08, pal.bone, 20,
      ));
    }
  }

  // --- draconic head: snout, brow crest, head frill ------------------------
  if (markers.has('draconic_head')) {
    const sc = pal.scale;
    // Re-skin the skull area with a scale-coloured overlay mass.
    const crown = kit.sph(hr * 1.04, sc, 0, hr * 0.12, -hr * 0.08);
    crown.scale.set(0.98, 0.95, 1.02);
    rig.head.add(crown);
    const snout = kit.sph(hr * 0.62, sc, 0, -hr * 0.18, hr * 0.85);
    snout.scale.set(0.95, 0.72, 1.25);
    rig.head.add(snout);
    const jaw = kit.sph(hr * 0.5, sc, 0, -hr * 0.52, hr * 0.6);
    jaw.scale.set(0.9, 0.55, 1.1);
    rig.head.add(jaw);
    // Nostril ridge + brow plates: crisp beveled slabs on the organic mass.
    rig.head.add(kit.bevelBox(hr * 0.5, hr * 0.28, hr * 0.7, sc, 0, hr * 0.08, hr * 0.95));
    for (const s of [-1, 1] as const) {
      const brow = kit.bevelBox(hr * 0.5, hr * 0.2, hr * 0.4, sc, s * hr * 0.42, hr * 0.42, hr * 0.6);
      brow.rotation.z = s * 0.15;
      rig.head.add(brow);
    }
    // Swept horn-frill pair.
    for (const s of [-1, 1] as const) {
      rig.head.add(kit.taperTube(
        [[s * hr * 0.55, hr * 0.5, -hr * 0.2], [s * hr * 0.8, hr * 0.7, -hr * 0.95], [s * hr * 0.85, hr * 0.5, -hr * 1.5]],
        hr * 0.26, hr * 0.09, sc, 16,
      ));
    }
  }

  // --- scaled hide: chunky scale plates on shoulders/forearms --------------
  if (markers.has('scaled_hide')) {
    const sc = pal.scale;
    const lb = Math.sqrt(d.bulk);
    for (const [side, sh] of [[-1, rig.shoulderL], [1, rig.shoulderR]] as const) {
      const plate = kit.sph(lb * 1.9, sc, side * 0.2, 0.6, 0);
      plate.scale.set(1, 0.7, 1);
      sh.add(plate);
    }
    for (const el of [rig.elbowL, rig.elbowR]) {
      el.add(kit.sph(lb * 1.28, sc, 0, -d.foreArm * 0.45, 0));
    }
  }

  // --- tail: tapered chain off the hip-rear socket, curled near the base so
  // it stays fused/supported (print rule: no long cantilevers). -------------
  if (markers.has('tail')) {
    const tailC = markers.has('draconic_head') ? pal.scale : pal.skin;
    const thick = markers.has('draconic_head') ? 1.6 : 0.9;
    hipRear.add(kit.taperTube(
      [
        [0, 0, 0],
        [0, -d.hipY * 0.35, -d.hipHalf * 1.6],
        [d.hipHalf * 1.2, -d.hipY * 0.68, -d.hipHalf * 2.6],
        [d.hipHalf * 2.6, -d.hipY * 0.82, -d.hipHalf * 2.2],
        [d.hipHalf * 3.4, -d.hipY * 0.8, -d.hipHalf * 0.9],
      ],
      thick * 1.15, thick * 0.28, tailC, 28,
    ));
    if (!markers.has('draconic_head')) {
      // Tiefling spade tip.
      const tip = kit.cone(1.1, 1.9, tailC, d.hipHalf * 3.7, -d.hipY * 0.78, -d.hipHalf * 0.4);
      tip.rotation.z = -1.2;
      hipRear.add(tip);
    }
  }
}
