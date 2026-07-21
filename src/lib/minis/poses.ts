// Pose system: each pose family is a static table of FK joint rotations
// (radians) applied to the rig. A pose IS the sculpt at build time; the same
// tables also resolve to pure, lerpable `PoseTargets` snapshots so a live
// figure can tween between poses (see poseAnimation.ts).
//
// CONVENTIONS (match rig.ts):
// - Limbs hang along local -Y in neutral.
// - shoulder.x negative = raise arm forward (+Z); positive = swing back.
// - shoulder.z: positive moves the hand toward +X (figure's left side is -X,
//   so "splay outward" is z<0 for the LEFT arm, z>0 for the RIGHT).
// - elbow.x negative = bend forearm forward.
// - hip.x negative = thigh forward; knee.x positive = shin back.
// - Ankles auto-counter (poseRig) so soles stay flat on the base.
// - MAIN hand = RIGHT (primary weapon), OFF hand = LEFT.
//
// Every pose keeps the centre of mass over the stance (balanced on base) and
// keeps limbs low-cantilever (print safety). `poseIntensity` scales angles
// through `poseScale`: a 45% floor so intensity 0 still reads as posed (never
// mannequin) up to a 120% overdrive ceiling so intensity 1 pushes PAST the
// authored angles for deliberately exaggerated, action-figure silhouettes.
//
// HOW TO ADD A POSE: add the id to POSE_FAMILIES in recipe.ts, then a spec
// here. Start from a similar pose, keep |shoulder.x| ≤ ~2.4 and elbows ≥ -2.4,
// and check the silhouette in the /minis viewer from 3/4 view.
import type { PoseFamily } from './recipe.ts';
import type { Rig } from './rig.ts';

export interface JointRot { x?: number; y?: number; z?: number }
export interface ArmPose extends JointRot { elbow?: number; wrist?: JointRot }
export interface LegPose { x?: number; z?: number; knee?: number }

export interface PoseSpec {
  /** Lower the hips by this fraction of hip height (crouch/kneel). */
  drop?: number;
  /** Whole-figure lean: rotate hips group (x fwd/back, y twist, z side). */
  hips?: JointRot;
  chest?: JointRot;
  neck?: JointRot;
  armL?: ArmPose;
  armR?: ArmPose;
  legL?: LegPose;
  legR?: LegPose;
  /** Slide hips forward/back (mm at human scale) for lunges. */
  shift?: number;
  /** Swap which hand counts as "main" for gear placement. Poses that extend
   *  the RIGHT hand dramatically (spell casts) set this so the staff/weapon
   *  lands in the planted LEFT hand instead of the display hand. */
  swapHands?: boolean;
}

const D = Math.PI / 180;

export const POSES: Record<PoseFamily, PoseSpec> = {
  // Weapon low and ready, feet apart, slight crouch — the classic fighter.
  ready_stance: {
    drop: 0.06, chest: { x: 6 * D, y: 8 * D },
    armR: { x: -35 * D, z: 14 * D, elbow: -55 * D },
    armL: { x: -20 * D, z: -18 * D, elbow: -45 * D },
    legL: { x: -14 * D, z: 7 * D }, legR: { x: 10 * D, z: -7 * D, knee: 14 * D },
  },
  // Shield raised square to the enemy, weapon cocked at the hip.
  shield_forward: {
    drop: 0.08, chest: { y: 14 * D },
    armL: { x: -55 * D, z: -6 * D, elbow: -70 * D },
    armR: { x: 25 * D, z: 12 * D, elbow: -95 * D },
    legL: { x: -22 * D, z: 6 * D }, legR: { x: 14 * D, z: -8 * D, knee: 20 * D },
  },
  // Two hands, weapon high overhead mid-swing.
  overhead_strike: {
    drop: 0.05, chest: { x: -10 * D, y: -6 * D },
    armR: { x: -150 * D, z: 20 * D, elbow: -30 * D },
    armL: { x: -140 * D, z: -25 * D, elbow: -40 * D },
    legL: { x: -18 * D, z: 6 * D }, legR: { x: 12 * D, z: -6 * D, knee: 16 * D },
    neck: { x: -8 * D },
  },
  // Greatweapon held across the body, braced.
  two_handed_weapon_pose: {
    drop: 0.07, chest: { y: 18 * D, x: 5 * D },
    armR: { x: -50 * D, z: 10 * D, elbow: -50 * D },
    armL: { x: -70 * D, z: -30 * D, elbow: -60 * D },
    legL: { x: -20 * D, z: 8 * D }, legR: { x: 12 * D, z: -8 * D, knee: 18 * D },
  },
  // Staff planted/raised in main hand, off hand gesturing.
  casting_staff: {
    chest: { x: -4 * D, y: -8 * D },
    armR: { x: -45 * D, z: 18 * D, elbow: -25 * D },
    armL: { x: -60 * D, z: -35 * D, elbow: -50 * D, wrist: { x: -30 * D } },
    legL: { x: -10 * D, z: 6 * D }, legR: { x: 6 * D, z: -6 * D },
    neck: { x: -6 * D },
  },
  // One hand thrust out, palm blazing; staff planted in the other.
  spell_hand_extended: {
    chest: { x: -3 * D, y: -14 * D },
    armR: { x: -85 * D, z: 8 * D, elbow: -10 * D, wrist: { x: 40 * D } },
    armL: { x: 20 * D, z: -14 * D, elbow: -60 * D },
    legL: { x: -16 * D, z: 7 * D }, legR: { x: 10 * D, z: -7 * D, knee: 12 * D },
    neck: { y: 6 * D },
    swapHands: true,
  },
  // Book open in off hand, main hand tracing a glyph.
  reading_spellbook: {
    chest: { x: 6 * D },
    armL: { x: -70 * D, z: -12 * D, elbow: -45 * D, wrist: { x: -25 * D } },
    armR: { x: -55 * D, z: 25 * D, elbow: -70 * D, wrist: { x: -20 * D } },
    legL: { x: -6 * D, z: 5 * D }, legR: { x: 4 * D, z: -5 * D },
    neck: { x: 14 * D },
  },
  // Deep crouch, blades low — thief in the shadows.
  crouching_sneak: {
    drop: 0.32, chest: { x: 22 * D, y: 10 * D },
    armR: { x: 15 * D, z: 20 * D, elbow: -80 * D },
    armL: { x: -30 * D, z: -25 * D, elbow: -70 * D },
    legL: { x: -55 * D, z: 8 * D, knee: 70 * D }, legR: { x: -20 * D, z: -10 * D, knee: 55 * D },
    neck: { x: -14 * D },
  },
  // Forward lunge, dagger leading.
  dagger_lunge: {
    drop: 0.18, shift: 2.5, chest: { x: 18 * D, y: -12 * D },
    armR: { x: -80 * D, z: 6 * D, elbow: -15 * D },
    armL: { x: 30 * D, z: -20 * D, elbow: -50 * D },
    legL: { x: -48 * D, z: 5 * D, knee: 55 * D }, legR: { x: 28 * D, z: -6 * D, knee: 18 * D },
  },
  // Bow at the ready — quarter-turned (not fully side-on) so the bow presents
  // to the viewer instead of edge-on, drawing hand back at the cheek.
  bow_drawn: {
    hips: { y: 22 * D }, chest: { y: 14 * D },
    armL: { x: -80 * D, z: -8 * D, elbow: -8 * D, wrist: { z: 90 * D } },
    armR: { x: -70 * D, z: 35 * D, elbow: -115 * D },
    legL: { x: -14 * D, z: 8 * D }, legR: { x: 8 * D, z: -8 * D },
    neck: { y: -18 * D },
  },
  // Low, alert, hand shading the eyes.
  scouting_pose: {
    drop: 0.14, chest: { x: 10 * D, y: -6 * D },
    armR: { x: -125 * D, z: 15 * D, elbow: -95 * D },
    armL: { x: 15 * D, z: -12 * D, elbow: -30 * D },
    legL: { x: -35 * D, z: 6 * D, knee: 45 * D }, legR: { x: -5 * D, z: -8 * D, knee: 25 * D },
    neck: { x: -8 * D },
  },
  // Palm raised in benediction, weapon resting low.
  blessing_gesture: {
    chest: { x: -4 * D },
    armL: { x: -52 * D, z: -18 * D, elbow: -28 * D, wrist: { x: -30 * D } },
    armR: { x: 12 * D, z: 10 * D, elbow: -40 * D },
    legL: { x: -6 * D, z: 6 * D }, legR: { x: 4 * D, z: -6 * D },
    neck: { x: -6 * D },
  },
  // Holy symbol thrust high against the dark.
  holy_symbol_extended: {
    chest: { x: -8 * D, y: -8 * D },
    armL: { x: -130 * D, z: -15 * D, elbow: -15 * D },
    armR: { x: 20 * D, z: 12 * D, elbow: -70 * D },
    legL: { x: -14 * D, z: 7 * D }, legR: { x: 10 * D, z: -7 * D, knee: 10 * D },
    neck: { x: -12 * D },
  },
  // Upright, shield planted, sword at guard — the wall that holds.
  heroic_guard: {
    chest: { x: -3 * D },
    armL: { x: -30 * D, z: -8 * D, elbow: -45 * D },
    armR: { x: -48 * D, z: 26 * D, elbow: -60 * D },
    legL: { x: -8 * D, z: 8 * D }, legR: { x: 6 * D, z: -8 * D },
    neck: { x: -4 * D },
  },
  // Mid-charge, weapon trailing, roaring forward.
  rage_charge: {
    drop: 0.12, shift: 2, chest: { x: 20 * D, y: -14 * D },
    armR: { x: 55 * D, z: 25 * D, elbow: -35 * D },
    armL: { x: -60 * D, z: -30 * D, elbow: -60 * D },
    legL: { x: -50 * D, z: 6 * D, knee: 60 * D }, legR: { x: 30 * D, z: -6 * D, knee: 25 * D },
    neck: { x: -18 * D },
  },
  // Axe raised wide, chest open, mid-roar.
  axe_roar: {
    drop: 0.06, chest: { x: -14 * D, y: 8 * D },
    armR: { x: -135 * D, z: 45 * D, elbow: -45 * D },
    armL: { x: -40 * D, z: -55 * D, elbow: -50 * D },
    legL: { x: -16 * D, z: 12 * D }, legR: { x: 10 * D, z: -12 * D, knee: 12 * D },
    neck: { x: -14 * D },
  },
  // Lute up, one boot forward on the stage lip.
  performance_pose: {
    chest: { x: -6 * D, y: 10 * D },
    armL: { x: -55 * D, z: -25 * D, elbow: -75 * D },
    armR: { x: -35 * D, z: 30 * D, elbow: -80 * D },
    legL: { x: -25 * D, z: 6 * D, knee: 20 * D }, legR: { x: 5 * D, z: -6 * D },
    neck: { x: -8 * D, y: 8 * D },
  },
  // En-garde flourish, blade high, free hand back.
  rapier_flourish: {
    drop: 0.08, chest: { y: -20 * D, x: 6 * D },
    armR: { x: -95 * D, z: 20 * D, elbow: -20 * D },
    armL: { x: 45 * D, z: -35 * D, elbow: -60 * D, wrist: { x: -40 * D } },
    legL: { x: -35 * D, z: 6 * D, knee: 40 * D }, legR: { x: 20 * D, z: -8 * D, knee: 10 * D },
    neck: { y: 10 * D },
  },
  // High knee, fists guarding — kick frozen at the chamber.
  martial_kick: {
    drop: 0.1, chest: { x: 6 * D, y: -10 * D },
    armR: { x: -50 * D, z: 15 * D, elbow: -100 * D },
    armL: { x: -35 * D, z: -20 * D, elbow: -90 * D },
    legL: { x: -95 * D, z: 4 * D, knee: 100 * D }, legR: { x: 4 * D, z: -4 * D, knee: 8 * D },
  },
  // Staff horizontal behind the shoulders? No — planted low guard, weight low.
  staff_monk_stance: {
    drop: 0.16, chest: { x: 8 * D, y: 16 * D },
    armR: { x: -65 * D, z: 12 * D, elbow: -35 * D },
    armL: { x: -25 * D, z: -30 * D, elbow: -55 * D },
    legL: { x: -40 * D, z: 14 * D, knee: 50 * D }, legR: { x: 15 * D, z: -14 * D, knee: 30 * D },
  },
  // Claw-hand raised, power crackling — asymmetric and sinister.
  eldritch_cast: {
    chest: { x: -6 * D, y: -16 * D },
    armR: { x: -110 * D, z: 25 * D, elbow: -45 * D, wrist: { x: 30 * D } },
    armL: { x: -35 * D, z: -18 * D, elbow: -55 * D, wrist: { x: -20 * D } },
    legL: { x: -12 * D, z: 7 * D }, legR: { x: 8 * D, z: -7 * D, knee: 8 * D },
    neck: { x: -8 * D, y: -6 * D },
  },
  // Relaxed idle — townsfolk standing at ease, weight on one hip, arms down.
  // Deliberately gentle: a civilian shouldn't read as mid-combat.
  standing: {
    chest: { y: 4 * D },
    armR: { x: -6 * D, z: 8 * D, elbow: -14 * D },
    armL: { x: -4 * D, z: -6 * D, elbow: -12 * D },
    legL: { x: -4 * D, z: 6 * D }, legR: { x: 3 * D, z: -5 * D, knee: 5 * D },
    neck: { y: 5 * D },
  },
  // Shambling undead: both arms hanging forward, head lolling, stiff legs.
  shambling: {
    chest: { x: 14 * D, y: 4 * D },
    armR: { x: -62 * D, z: 10 * D, elbow: -22 * D },
    armL: { x: -58 * D, z: -12 * D, elbow: -18 * D },
    legL: { x: -10 * D, z: 5 * D }, legR: { x: 8 * D, z: -5 * D, knee: 10 * D },
    neck: { x: 16 * D, y: -10 * D },
  },
  // Low, wide, weapon out — a brute stalking forward.
  menacing_advance: {
    drop: 0.12, shift: 1.2, chest: { x: 10 * D, y: 12 * D },
    armR: { x: -30 * D, z: 20 * D, elbow: -60 * D },
    armL: { x: -18 * D, z: -24 * D, elbow: -50 * D },
    legL: { x: -30 * D, z: 10 * D, knee: 30 * D }, legR: { x: 18 * D, z: -10 * D, knee: 22 * D },
    neck: { x: -6 * D },
  },
  // Both arms rising, dragging something up from below.
  summoning_pose: {
    drop: 0.05, chest: { x: -10 * D },
    armR: { x: -75 * D, z: 30 * D, elbow: -40 * D, wrist: { x: 30 * D } },
    armL: { x: -75 * D, z: -30 * D, elbow: -40 * D, wrist: { x: 30 * D } },
    legL: { x: -10 * D, z: 9 * D }, legR: { x: -10 * D, z: -9 * D, knee: 12 * D },
    neck: { x: -10 * D },
  },

  // === Dynamic action set ==================================================
  // Deep forward lunge, sword thrust out level in the main hand, shield braced
  // across — the fighter committing to a strike. Front (left) leg bent, rear
  // leg driving. shift throws the weight onto the lead foot.
  sword_lunge: {
    drop: 0.14, shift: 3, chest: { x: 12 * D, y: -16 * D },
    armR: { x: -80 * D, z: 8 * D, elbow: -12 * D },
    armL: { x: -46 * D, z: -20 * D, elbow: -62 * D },
    legL: { x: -52 * D, z: 6 * D, knee: 52 * D }, legR: { x: 26 * D, z: -6 * D, knee: 14 * D },
    neck: { y: -10 * D },
  },
  // Shield punched forward square to the foe, sword cocked back high over the
  // shoulder ready to fall — a paladin mid shield-bash.
  shield_bash: {
    drop: 0.1, shift: 1.5, chest: { x: 8 * D, y: 18 * D },
    armL: { x: -72 * D, z: -6 * D, elbow: -38 * D },
    armR: { x: -122 * D, z: 32 * D, elbow: -48 * D },
    legL: { x: -30 * D, z: 6 * D, knee: 30 * D }, legR: { x: 18 * D, z: -8 * D, knee: 20 * D },
    neck: { x: -4 * D },
  },
  // Whole body torqued into a hurled spell: the main hand (staff, or a blazing
  // sorcerer palm) whipped forward, off hand braced back, weight driving onto
  // the lead foot. No swap — the channelling hand leads, so a wizard casts
  // THROUGH the staff instead of shoving the spellbook out front.
  spell_hurl: {
    drop: 0.06, shift: 1.5, chest: { x: -6 * D, y: -20 * D },
    armR: { x: -96 * D, z: 6 * D, elbow: -8 * D, wrist: { x: 45 * D } },
    armL: { x: -28 * D, z: -30 * D, elbow: -52 * D },
    legL: { x: -22 * D, z: 6 * D, knee: 18 * D }, legR: { x: 12 * D, z: -6 * D, knee: 10 * D },
    neck: { y: 8 * D },
  },
  // Warhammer/mace swung high overhead for a radiant smite, shield up-forward,
  // chest opened to the sky. Cousin of overhead_strike but one-handed + shield.
  smite_strike: {
    drop: 0.05, chest: { x: -12 * D, y: -10 * D },
    armR: { x: -142 * D, z: 24 * D, elbow: -28 * D },
    armL: { x: -50 * D, z: -14 * D, elbow: -55 * D },
    legL: { x: -18 * D, z: 6 * D, knee: 16 * D }, legR: { x: 12 * D, z: -6 * D, knee: 14 * D },
    neck: { x: -10 * D },
  },
  // Low, committed lunging stab — lead dagger punched forward, trailing dagger
  // reversed behind, deep drop. More aggressive than crouching_sneak.
  assassin_lunge: {
    drop: 0.2, shift: 3, chest: { x: 20 * D, y: -18 * D },
    armR: { x: -72 * D, z: 8 * D, elbow: -18 * D },
    armL: { x: 22 * D, z: -24 * D, elbow: -55 * D },
    legL: { x: -50 * D, z: 5 * D, knee: 55 * D }, legR: { x: 30 * D, z: -6 * D, knee: 18 * D },
    neck: { x: -6 * D, y: -8 * D },
  },
  // Staff driven forward-down in a committed strike, hips rotated into it, free
  // hand thrown back for counterbalance, weight sunk into a wide stance.
  staff_sweep: {
    drop: 0.14, shift: 1, chest: { x: 10 * D, y: 22 * D },
    armR: { x: -56 * D, z: 12 * D, elbow: -8 * D },
    armL: { x: 34 * D, z: -30 * D, elbow: -55 * D },
    legL: { x: -44 * D, z: 12 * D, knee: 50 * D }, legR: { x: 18 * D, z: -12 * D, knee: 26 * D },
    neck: { x: -6 * D, y: 14 * D },
  },
  // Nature power surging up: free hand sweeping high and forward trailing motes,
  // staff braced, torso leaning into the cast.
  wild_surge: {
    drop: 0.08, chest: { x: -8 * D, y: 14 * D },
    armR: { x: -104 * D, z: 22 * D, elbow: -30 * D, wrist: { x: 25 * D } },
    armL: { x: -54 * D, z: -30 * D, elbow: -46 * D },
    legL: { x: -22 * D, z: 8 * D, knee: 22 * D }, legR: { x: 14 * D, z: -8 * D, knee: 12 * D },
    neck: { x: -8 * D, y: 8 * D },
    swapHands: true,
  },
  // Feral leaping pounce: deep coiled launch, both arms/claws reaching forward,
  // chest low over the lead foot — for beasts and savage humanoids.
  pounce: {
    drop: 0.22, shift: 2.5, chest: { x: 24 * D, y: 6 * D },
    armR: { x: -88 * D, z: 26 * D, elbow: -40 * D, wrist: { x: 20 * D } },
    armL: { x: -88 * D, z: -26 * D, elbow: -40 * D, wrist: { x: 20 * D } },
    legL: { x: -48 * D, z: 8 * D, knee: 58 * D }, legR: { x: 20 * D, z: -8 * D, knee: 26 * D },
    neck: { x: -20 * D },
  },
};

const lerp = (v: number | undefined, t: number) => (v ?? 0) * t;

/** Fraction of each pose's raw leg-z (sideways splay) actually applied. The
 *  pose tables were authored knock-kneed; damping keeps a natural planted
 *  stance without re-authoring all the poses. 0.5 gives a wide, grounded
 *  action stance while still short of the pigeon-toed raw values. */
const LEG_SPLAY = 0.5;

/** Map recipe `poseIntensity` (0..1) to the angle multiplier. Floor 0.45 so
 *  intensity 0 still reads as posed; ceiling 1.2 so intensity 1 OVERDRIVES the
 *  authored tables by 20% for exaggerated, tabletop-readable silhouettes.
 *  (The default 0.6 lands at 0.9 — near the authored angles.) */
export function poseScale(intensity: number): number {
  return 0.45 + 0.75 * Math.max(0, Math.min(1, intensity));
}

/** Every rig pivot a pose touches, in a fixed order so target snapshots are
 *  plain lerpable data (poseAnimation.ts tweens between two of them). */
export const POSE_JOINTS = [
  'hips', 'chest', 'neck',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'hipL', 'kneeL', 'footL', 'hipR', 'kneeR', 'footR',
] as const;
export type PoseJoint = (typeof POSE_JOINTS)[number];

/** Euler rotation [x, y, z] in radians (the rig's default XYZ order). */
export type JointAngles = [number, number, number];

/** A pose resolved to concrete numbers for one rig: every joint rotation plus
 *  the hips translation (crouch drop / lunge shift). Pure data — two snapshots
 *  can be lerped component-wise and the flat-sole ankle counter still holds at
 *  every blend point (it's linear in the leg angles). */
export interface PoseTargets {
  hipsPosY: number;
  hipsPosZ: number;
  joints: Record<PoseJoint, JointAngles>;
}

/** Resolve a pose family × intensity to joint targets for a rig of the given
 *  proportions. Pure: same inputs, same numbers. `intensity` 0..1 maps through
 *  `poseScale` (45% floor → 120% overdrive ceiling). Ankles counter-rotate so
 *  boots stay flat on the base. */
export function poseTargets(
  dims: Pick<Rig['dims'], 'hipY' | 'height'>,
  family: PoseFamily,
  intensity: number,
): PoseTargets {
  const spec = POSES[family];
  const t = poseScale(intensity);

  const rot = (j?: JointRot): JointAngles => [lerp(j?.x, t), lerp(j?.y, t), lerp(j?.z, t)];
  const arm = (p?: ArmPose): [JointAngles, JointAngles, JointAngles] =>
    [rot(p), [lerp(p?.elbow, t), 0, 0], rot(p?.wrist)];
  const leg = (p?: LegPose): [JointAngles, JointAngles, JointAngles] => {
    // Damp the sideways splay: the raw pose z reads knock-kneed, so we only
    // keep a fraction of it — enough for a planted stance, not pigeon-toed.
    const x = lerp(p?.x, t), knee = lerp(p?.knee, t), z = lerp(p?.z, t) * LEG_SPLAY;
    // Keep the sole flat: cancel the leg chain's X bend + splay at the ankle.
    return [[x, 0, z], [knee, 0, 0], [-(x + knee), 0, -z]];
  };

  const [shL, elL, haL] = arm(spec.armL);
  const [shR, elR, haR] = arm(spec.armR);
  const [hiL, knL, foL] = leg(spec.legL);
  const [hiR, knR, foR] = leg(spec.legR);
  return {
    hipsPosY: dims.hipY * (1 - lerp(spec.drop, t)),
    hipsPosZ: lerp(spec.shift, t) * (dims.height / 30),
    joints: {
      hips: rot(spec.hips), chest: rot(spec.chest), neck: rot(spec.neck),
      shoulderL: shL, elbowL: elL, handL: haL,
      shoulderR: shR, elbowR: elR, handR: haR,
      hipL: hiL, kneeL: knL, footL: foL,
      hipR: hiR, kneeR: knR, footR: foR,
    },
  };
}

/** Write pose targets onto the rig's pivots. `chestLeanX` is the species
 *  posture lean the builder normally adds after posing (dragonborn, troll…) —
 *  targets are absolute, so re-appliers must fold it in here. */
export function applyPoseTargets(rig: Rig, targets: PoseTargets, chestLeanX = 0): void {
  rig.hips.position.y = targets.hipsPosY;
  rig.hips.position.z = targets.hipsPosZ;
  for (const name of POSE_JOINTS) {
    const [x, y, z] = targets.joints[name];
    rig[name].rotation.set(name === 'chest' ? x + chestLeanX : x, y, z);
  }
}

/** Apply a pose to a rig (the static build-time path). */
export function poseRig(rig: Rig, family: PoseFamily, intensity: number): void {
  applyPoseTargets(rig, poseTargets(rig.dims, family, intensity));
}
