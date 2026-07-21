// Humanoid rig: a small FK skeleton of THREE.Group pivots with chunky body
// masses attached. Units are millimetres; the figure stands on y=0 facing +Z.
//
// The rig is the ONE shared body every mini is built on — species tables
// scale it (dwarf = short+broad, elf = tall+slender), outfit layers dress it,
// the pose system rotates its joints. That single shared skeleton is what
// keeps the whole line consistent in proportion and style.
//
// Heroic-scale styling choices (deliberate, don't "fix" toward realism):
// - ~4.7 heads tall, oversized head/hands/feet, thick limbs.
// - Organic parts overlap generously (capsule shoulders sink into the chest,
//   thighs into the pelvis) so smooth shading reads as one sculpted mass.
// - Every limb ends in a mass (hand sphere / boot block) — no thin tapers.
import type * as THREE_NS from 'three';
import type { MiniKit } from './kit.ts';

type Group = THREE_NS.Group;

/** All linear values in mm, for a "standard human heroic" — species multiply. */
export interface RigDims {
  /** Ground → top of skull. */
  height: number;
  headR: number;
  /** Ground → hip pivot. */
  hipY: number;
  /** Hip pivot → shoulder line. */
  torsoLen: number;
  shoulderHalf: number;
  hipHalf: number;
  upperArm: number;
  foreArm: number;
  /** Limb/torso thickness multiplier. */
  bulk: number;
  neckLen: number;
}

export const HUMAN_DIMS: RigDims = {
  height: 30, headR: 3.3, hipY: 12.5, torsoLen: 9.5,
  shoulderHalf: 4.4, hipHalf: 2.5, upperArm: 5.2, foreArm: 4.8,
  bulk: 1, neckLen: 1.2,
};

/** Colours for the base body layer (under any armor/robe the outfit adds). */
export interface BodyStyle {
  skin: number;
  torso: number;   // shirt / tunic / bare chest colour
  arms: number;    // sleeves (or skin for bare arms)
  hands: number;   // usually skin; gauntlet metal for heavy armor
  legs: number;    // trousers / greaves
  boots: number;
  bareChest?: boolean; // barbarian/monk: sculpt pec+ab masses instead of tunic
  /** Undead skeleton: bone rods + ribcage + skull instead of fleshed masses.
   *  `bone` is the colour for every bone; the joint structure is unchanged so
   *  poses, gear and armor overlays still work. */
  skeletal?: boolean;
  bone?: number;
}

export interface Rig {
  root: Group;
  /** Whole figure above the feet — poses may drop it (crouch) or tilt it. */
  hips: Group;
  chest: Group;
  neck: Group;
  head: Group;
  shoulderL: Group; shoulderR: Group;
  elbowL: Group; elbowR: Group;
  /** Wrist sockets — hand mesh lives here; held gear attaches here. */
  handL: Group; handR: Group;
  hipL: Group; hipR: Group;
  kneeL: Group; kneeR: Group;
  /** Ankle pivots (used to keep soles flat under leg bends). */
  footL: Group; footR: Group;
  /** Attachment points for outfit/marker builders. */
  sockets: {
    headTop: Group;   // hair, hoods, horns
    face: Group;      // beards, tusks, snouts (front of head)
    chestFront: Group;
    back: Group;      // cloaks, backpacks, quivers
    belt: Group;      // pouches, belts (hip level, front-centred)
    hipRear: Group;   // tails
  };
  dims: RigDims;
}

/** Build the skeleton + base body masses. The returned rig is in the neutral
 *  A-ish pose (arms slightly out); poses.ts rotates the joints afterwards. */
export function buildRig(kit: MiniKit, dims: RigDims, style: BodyStyle): Rig {
  const { THREE } = kit;
  const d = dims;
  const bulk = d.bulk;
  const g = (x = 0, y = 0, z = 0): Group => {
    const gr = new THREE.Group();
    gr.position.set(x, y, z);
    return gr;
  };

  // hipHalf / shoulderHalf already encode species bulk — radial masses use
  // them directly; only LIMB radii take (damped) bulk, or a dwarf turns into
  // a sphere instead of a stout figure.
  const limbBulk = Math.sqrt(bulk);
  const sk = !!style.skeletal;
  const boneC = style.bone ?? 0xe8e0cc;

  const root = g();
  const hips = g(0, d.hipY, 0);
  root.add(hips);

  // --- pelvis + belly (in hips space, y=0 is the hip pivot)
  if (sk) {
    // Bony pelvic girdle + a vertebral column rod up to the shoulder line.
    const pel = kit.box(d.hipHalf * 2.3, d.hipHalf * 1.1, d.hipHalf * 1.5, boneC, 0, -0.3, 0);
    pel.scale.set(1, 1, 0.85);
    hips.add(pel);
    hips.add(kit.cyl(d.hipHalf * 0.42, d.hipHalf * 0.42, d.torsoLen, boneC, 0, d.torsoLen * 0.44, 0, 8));
  } else {
    const pelvis = kit.sph(d.hipHalf * 1.35, style.legs, 0, -0.4, 0);
    pelvis.scale.set(1.15, 0.85, 0.95);
    hips.add(pelvis);

    // --- torso: belly capsule (chest mass added below the chest pivot). A
    // torso lean bends at a believable spot; generous overlap fuses them.
    const belly = kit.cap(d.hipHalf * 1.18, d.torsoLen * 0.36, style.torso, 0, d.torsoLen * 0.42 * 0.52, 0);
    belly.scale.set(1.12, 1, 0.92);
    hips.add(belly);
  }

  const chestPivotY = d.torsoLen * 0.42;
  const chest = g(0, chestPivotY, 0);
  hips.add(chest);
  const chestTop = d.torsoLen - chestPivotY; // shoulder line in chest space

  if (sk) {
    // Ribcage: stacked flattened bone rings tapering up + a sternum + collarbones.
    for (let i = 0; i < 4; i++) {
      const ring = kit.torus(d.shoulderHalf * (0.66 - 0.06 * i), 0.5, boneC, 0, chestTop * (0.16 + 0.2 * i), 0, 14);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(1, 1, 0.82);
      chest.add(ring);
    }
    chest.add(kit.cap(0.55, chestTop * 0.5, boneC, 0, chestTop * 0.4, d.shoulderHalf * 0.42));
    for (const s of [-1, 1] as const) {
      chest.add(kit.cyl(0.4, 0.4, d.shoulderHalf, boneC, s * d.shoulderHalf * 0.4, chestTop * 0.86, 0, 6).rotateZ(Math.PI / 2));
    }
  } else if (style.bareChest) {
    // Sculpted muscle masses: broad upper-chest slab + pec spheres + ab block.
    const upper = kit.cap(d.shoulderHalf * 0.72, d.shoulderHalf * 0.72, style.torso, 0, chestTop * 0.68, 0);
    upper.rotation.z = Math.PI / 2;
    upper.scale.set(1, 1, 0.78);
    chest.add(upper);
    for (const s of [-1, 1]) {
      const pec = kit.sph(d.shoulderHalf * 0.46, style.torso, s * d.shoulderHalf * 0.42, chestTop * 0.5, d.hipHalf * 0.62);
      pec.scale.set(1, 0.82, 0.7);
      chest.add(pec);
    }
    const abs = kit.cap(d.hipHalf * 0.9, d.torsoLen * 0.3, style.torso, 0, chestTop * 0.1, d.hipHalf * 0.15);
    abs.scale.set(1.05, 1, 0.75);
    chest.add(abs);
  } else {
    // Clothed torso: tapered chest mass, broad at the shoulders.
    const chestMass = kit.cap(d.shoulderHalf * 0.76, d.shoulderHalf * 0.8, style.torso, 0, chestTop * 0.62, 0);
    chestMass.rotation.z = Math.PI / 2;
    chestMass.scale.set(1, 1, 0.8);
    chest.add(chestMass);
    const mid = kit.cap(d.hipHalf * 1.05, d.torsoLen * 0.32, style.torso, 0, chestTop * 0.16, 0);
    mid.scale.set(1.1, 1, 0.85);
    chest.add(mid);
  }

  // --- neck + head
  const neck = g(0, chestTop, 0);
  chest.add(neck);
  neck.add(kit.cyl(sk ? 0.5 : d.headR * 0.34 * limbBulk, sk ? 0.62 : d.headR * 0.42 * limbBulk, d.neckLen + d.headR * 0.5, sk ? boneC : style.skin, 0, d.neckLen * 0.3, 0));
  const head = g(0, d.neckLen + d.headR * 0.78, 0);
  neck.add(head);
  // Skull: sphere squashed slightly tall + a jaw mass (bone when skeletal).
  // Species builders reshape via sockets (snouts, beards) rather than
  // replacing the skull.
  const skull = kit.sph(d.headR, sk ? boneC : style.skin, 0, 0, 0);
  skull.scale.set(0.94, 1.04, 0.96);
  head.add(skull);
  const jaw = kit.sph(d.headR * 0.72, sk ? boneC : style.skin, 0, -d.headR * 0.42, d.headR * 0.14);
  jaw.scale.set(0.9, 0.72, 0.86);
  head.add(jaw);
  if (sk) {
    // Eye sockets (dark hollows) + a hint of teeth on the jaw.
    for (const s of [-1, 1] as const) {
      const socket = kit.sph(d.headR * 0.26, kit.mat(0x14100c, { rim: 0 }), s * d.headR * 0.36, d.headR * 0.04, d.headR * 0.74);
      head.add(kit.noOutline(socket));
    }
    const teeth = kit.box(d.headR * 0.7, d.headR * 0.18, d.headR * 0.14, boneC, 0, -d.headR * 0.3, d.headR * 0.72);
    head.add(teeth);
  }

  const sockets = {
    headTop: g(0, d.headR * 0.55, 0),
    face: g(0, -d.headR * 0.1, d.headR * 0.8),
    chestFront: g(0, chestTop * 0.55, d.hipHalf * 1.15),
    back: g(0, chestTop * 0.45, -d.hipHalf * 1.2),
    belt: g(0, 0.6, 0),
    hipRear: g(0, -0.5, -d.hipHalf * 1.1),
  };
  head.add(sockets.headTop, sockets.face);
  chest.add(sockets.chestFront, sockets.back);
  hips.add(sockets.belt, sockets.hipRear);

  // --- arms. Shoulder pivots sit at the shoulder line; upper-arm capsule
  // hangs along local -Y. Shoulder ball overlaps the chest so there's no gap.
  const armR = 1.35 * limbBulk; // limb radius
  const boneArmR = 0.62;
  const makeArm = (side: 1 | -1): { shoulder: Group; elbow: Group; hand: Group } => {
    const shoulder = g(side * d.shoulderHalf, chestTop * 0.86, 0);
    chest.add(shoulder);
    if (sk) {
      shoulder.add(kit.sph(boneArmR * 1.4, boneC, 0, 0, 0)); // shoulder ball
      shoulder.add(kit.cyl(boneArmR, boneArmR * 0.85, d.upperArm, boneC, 0, -d.upperArm * 0.5, 0, 8)); // humerus
    } else {
      shoulder.add(kit.sph(armR * 1.32, style.arms, 0, 0, 0)); // deltoid mass
      shoulder.add(kit.cap(armR, d.upperArm * 0.6, style.arms, 0, -d.upperArm * 0.5, 0));
    }
    const elbow = g(0, -d.upperArm, 0);
    shoulder.add(elbow);
    if (sk) {
      elbow.add(kit.sph(boneArmR * 1.05, boneC, 0, 0, 0)); // elbow knob
      elbow.add(kit.cyl(boneArmR * 0.85, boneArmR * 0.7, d.foreArm, boneC, 0, -d.foreArm * 0.5, 0, 8)); // forearm
    } else {
      elbow.add(kit.cap(armR * 0.9, d.foreArm * 0.55, style.arms, 0, -d.foreArm * 0.45, 0));
    }
    const hand = g(0, -d.foreArm - 0.6, 0);
    elbow.add(hand);
    if (sk) {
      hand.add(kit.sph(boneArmR * 1.25, boneC, 0, -0.3, 0)); // bony hand
    } else {
      // Oversized mitt — tabletop readability + print safety.
      const mitt = kit.sph(armR * 1.05, style.hands, 0, -0.3, 0);
      mitt.scale.set(0.92, 1.1, 1);
      hand.add(mitt);
    }
    return { shoulder, elbow, hand };
  };
  const armL = makeArm(-1);
  const armRt = makeArm(1);

  // --- legs. Hip pivots in hips space; thigh capsule along -Y; ankle pivot
  // keeps the boot flat when the leg bends.
  const thigh = d.hipY * 0.52, shin = d.hipY * 0.48;
  const legR = 1.5 * limbBulk;
  const boneLegR = 0.8;
  const makeLeg = (side: 1 | -1): { hip: Group; knee: Group; foot: Group } => {
    const hip = g(side * d.hipHalf * 0.78, -0.8, 0);
    hips.add(hip);
    if (sk) {
      hip.add(kit.sph(boneLegR * 1.2, boneC, 0, 0, 0)); // hip ball
      hip.add(kit.cyl(boneLegR, boneLegR * 0.85, thigh, boneC, 0, -thigh * 0.5, 0, 8)); // femur
    } else {
      hip.add(kit.sph(legR * 1.18, style.legs, 0, 0, 0)); // glute/hip mass
      hip.add(kit.cap(legR, thigh * 0.55, style.legs, 0, -thigh * 0.5, 0));
    }
    const knee = g(0, -thigh, 0);
    hip.add(knee);
    if (sk) {
      knee.add(kit.sph(boneLegR, boneC, 0, 0, 0)); // knee knob
      knee.add(kit.cyl(boneLegR * 0.85, boneLegR * 0.68, shin, boneC, 0, -shin * 0.5, 0, 8)); // shin
    } else {
      knee.add(kit.cap(legR * 0.85, shin * 0.5, style.legs, 0, -shin * 0.42, 0));
    }
    const foot = g(0, -shin + 0.4, 0);
    knee.add(foot);
    if (sk) {
      // Bony foot: a flat tarsal wedge forward from the ankle.
      const bone = kit.box(boneLegR * 1.7, boneLegR * 0.9, legR * 2.2, boneC, 0, -0.5, legR * 0.7);
      foot.add(bone);
    } else {
      // Boot: heel block + rounded toe, one fused chunky mass.
      const bootH = 2.0 * Math.min(bulk, 1.15);
      const heel = kit.sph(legR * 1.05, style.boots, 0, -0.6 + bootH * 0.4, -0.2);
      heel.scale.set(1, bootH / (legR * 1.05) / 2 + 0.45, 1.1);
      foot.add(heel);
      const toe = kit.sph(legR * 0.95, style.boots, 0, -0.6 + bootH * 0.32, legR * 1.35);
      toe.scale.set(1, 0.72, 1.25);
      foot.add(toe);
    }
    return { hip, knee, foot };
  };
  const legL = makeLeg(-1);
  const legRt = makeLeg(1);

  return {
    root, hips, chest, neck, head,
    shoulderL: armL.shoulder, shoulderR: armRt.shoulder,
    elbowL: armL.elbow, elbowR: armRt.elbow,
    handL: armL.hand, handR: armRt.hand,
    hipL: legL.hip, hipR: legRt.hip,
    kneeL: legL.knee, kneeR: legRt.knee,
    footL: legL.foot, footR: legRt.foot,
    sockets, dims,
  };
}
