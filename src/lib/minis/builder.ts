// AssetBuilder: recipe JSON → finished miniature (THREE.Group, mm units,
// base bottom on y=0, figure facing +Z). The assembly pipeline:
//
//   1. normalise   — fill pose/gear/base/armor/palette from the class table
//   2. palette     — resolve named material presets to colours
//   3. rig         — species-scaled skeleton + body masses (rig.ts)
//   4. species     — ears/beards/horns/tails/snouts on rig sockets (species.ts)
//   5. outfit      — armor weight + class-marker layers (robes, plate, hoods)
//   6. gear        — held items into hand sockets, worn items onto sockets
//   7. pose        — FK joint table + intensity (poses.ts)
//   8. base        — themed plinth; figure planted on top (bases.ts)
//   9. outline     — inverted hulls over everything (kit.ts)
//
// The builder is deliberately opinionated: recipes choose WHAT, this file
// (with the class/species tables) chooses HOW, so every output sits in the
// same product line.
import type * as THREE_NS from 'three';
import { makeMiniKit, type MiniKit } from './kit.ts';
import { resolvePalette, type Palette } from './materials.ts';
import { buildRig, type BodyStyle, type Rig } from './rig.ts';
import { SPECIES, speciesDims, effectiveMarkers, buildSpeciesFeatures } from './species.ts';
import { poseRig, POSES } from './poses.ts';
import { GEAR } from './gear.ts';
import { buildBase } from './bases.ts';
import { CLASSES } from './classes.ts';
import type { MiniRecipe, ClassMarker, GearId } from './recipe.ts';

export interface BuiltMini {
  group: THREE_NS.Group;
  recipe: MiniRecipe;
  /** Overall height (mm) including base — for camera framing. */
  heightMm: number;
  baseRadiusMm: number;
  /** The live skeleton inside `group` — poseAnimation.ts retargets its joints
   *  to tween the figure between poses without a rebuild. Clones made from
   *  `group` (scene-map templates) do NOT carry a rig; only the original built
   *  figure is animatable. */
  rig: Rig;
}

/** The pose a recipe actually builds in (recipe override or class default) —
 *  the starting point a pose transition animates away from. */
export function effectivePose(recipe: MiniRecipe): { family: NonNullable<MiniRecipe['poseFamily']>; intensity: number } {
  return { family: recipe.poseFamily ?? CLASSES[recipe.class].pose, intensity: recipe.poseIntensity };
}

/** Recipe with every class-level gap filled — what the builder actually runs. */
interface Normalized {
  recipe: MiniRecipe;
  pose: MiniRecipe['poseFamily'] & string;
  gear: GearId[];
  markers: Set<ClassMarker>;
  armor: 'none' | 'light' | 'medium' | 'heavy';
  base: NonNullable<MiniRecipe['baseTheme']>;
  pal: Palette;
}

function normalize(recipe: MiniRecipe): Normalized {
  const cls = CLASSES[recipe.class];
  const gear = recipe.gear.length ? recipe.gear : cls.gear;
  const markers = new Set<ClassMarker>([...cls.markers, ...recipe.classMarkers]);
  // Palette: class accents fill roles the recipe didn't pin; species pins
  // (goblin-green skin, skeleton bone) beat the class but lose to the recipe.
  const mats = { ...cls.palette, ...SPECIES[recipe.species].palette, ...recipe.materials };
  return {
    recipe,
    pose: recipe.poseFamily ?? cls.pose,
    gear,
    markers,
    armor: recipe.armorWeight ?? cls.armor,
    base: recipe.baseTheme ?? cls.base,
    pal: resolvePalette(mats),
  };
}

/** Darken a hex colour — cheap shading so boots/soles separate from same-
 *  material legs without growing the palette. */
function darken(c: number, f: number): number {
  const r = Math.round(((c >> 16) & 0xff) * f), g = Math.round(((c >> 8) & 0xff) * f), b = Math.round((c & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

/** Base body colours per armor weight (overlay plates come separately). */
function bodyStyle(n: Normalized): BodyStyle {
  const p = n.pal;
  const robed = n.markers.has('full_robe');
  if (n.markers.has('skeletal')) {
    // Bare bones — the rig draws a ribcage + bone rods; armor plates (for a
    // skeleton warrior) still overlay on top. `bone` colours every bone.
    return { skin: p.bone, torso: p.bone, arms: p.bone, hands: p.bone, legs: p.bone, boots: p.bone, skeletal: true, bone: p.bone };
  }
  switch (n.armor) {
    case 'heavy':
      return { skin: p.skin, torso: p.metal, arms: p.metal, hands: p.metal, legs: p.metal, boots: darken(p.metal, 0.62) };
    case 'medium':
      return { skin: p.skin, torso: p.leather, arms: p.cloth, hands: p.skin, legs: darken(p.leather, 0.85), boots: darken(p.leather, 0.55) };
    case 'light':
      return { skin: p.skin, torso: p.leather, arms: p.cloth, hands: p.skin, legs: p.cloth2, boots: darken(p.leather, 0.6) };
    default:
      if (n.markers.has('trophy_straps')) // barbarian: bare sculpted chest
        return { skin: p.skin, torso: p.skin, arms: p.skin, hands: p.skin, legs: p.leather, boots: darken(p.leather, 0.6), bareChest: true };
      if (n.markers.has('monk_wraps'))
        return { skin: p.skin, torso: p.cloth, arms: p.skin, hands: p.skin, legs: p.cloth, boots: darken(p.leather, 0.7) };
      return { skin: p.skin, torso: p.cloth, arms: p.cloth, hands: p.skin, legs: robed ? p.cloth : p.cloth2, boots: darken(p.leather, 0.65) };
  }
}

/** Armor + class-marker outfit layers over the base body. */
function buildOutfit(kit: MiniKit, rig: Rig, n: Normalized): void {
  const p = n.pal;
  const d = rig.dims;
  const chestTop = d.torsoLen - d.torsoLen * 0.42;

  // --- robes: solid flared skirt from the waist (never a thin sheet). ------
  if (n.markers.has('full_robe') || n.markers.has('half_robe') || n.markers.has('robe_and_armor_mix')) {
    const full = n.markers.has('full_robe');
    const len = full ? d.hipY * 0.94 : d.hipY * 0.6;
    // Profile runs bottom→top (lathe winding = outward normals; reversed
    // order renders the skirt inside-out and the outline hull swallows it).
    const skirt = kit.lathe(
      [[d.hipHalf * 1.6, 0], [d.hipHalf * 2.55, 0.4], [d.hipHalf * 2.3, len * 0.25], [d.hipHalf * 1.5, len * 0.8], [d.hipHalf * 1.05, len]],
      kit.mat(p.cloth), 0, -len + 1.2, 0, 22,
    );
    rig.hips.add(skirt);
    // Rope/waist band where skirt meets torso.
    rig.hips.add(kit.torus(d.hipHalf * 1.35, 0.55, kit.mat(p.cloth2), 0, 1.2, 0, 20).rotateX(Math.PI / 2));
    if (full) {
      // Draped sleeves: flared cuffs on the forearms.
      for (const el of [rig.elbowL, rig.elbowR]) {
        el.add(kit.cyl(d.bulk * 1.15, d.bulk * 1.9, d.foreArm * 0.75, kit.mat(p.cloth), 0, -d.foreArm * 0.4, 0, 14));
      }
    }
  } else if (!n.markers.has('skeletal')) {
    // Everyone else gets a simple belt so torso→legs reads intentionally.
    // (A skeleton has no waist to belt — bare bones stay bare.)
    rig.hips.add(kit.torus(d.hipHalf * 1.32, 0.6, kit.mat(p.leather), 0, 0.9, 0, 20).rotateX(Math.PI / 2));
    rig.hips.add(kit.bevelBox(1.8, 1.6, 0.9, kit.mat(p.metal2, { flat: true }), 0, 0.9, d.hipHalf * 1.35, 0.25));
  }

  // --- armor overlays -------------------------------------------------------
  const limbBulk = Math.sqrt(d.bulk);
  if (n.armor === 'medium' || n.armor === 'heavy' || n.markers.has('robe_and_armor_mix')) {
    // Cuirass: a curved plate hugging the chest (a flat slab either buries
    // itself in the torso mass or floats in front of it — a squashed sphere
    // wraps and fuses). Bevel trim underneath keeps a crisp armor line.
    const cuirass = kit.sph(d.shoulderHalf * 0.92, kit.mat(p.metal), 0, chestTop * 0.5, d.hipHalf * 0.35);
    cuirass.scale.set(1.02, 0.98, 0.6);
    rig.chest.add(cuirass);
    rig.chest.add(kit.bevelBox(d.shoulderHalf * 1.35, 1.6, d.hipHalf * 0.9, kit.mat(p.metal2, { flat: true }), 0, chestTop * 0.02, d.hipHalf * 0.62, 0.4));
    for (const [s, sh] of [[-1, rig.shoulderL], [1, rig.shoulderR]] as const) {
      const pauldron = kit.sph(limbBulk * (n.armor === 'heavy' ? 2.2 : 1.75), kit.mat(p.metal, { flat: true }), s * 0.3, 0.45, 0);
      pauldron.scale.set(1.05, 0.8, 1.05);
      sh.add(pauldron);
    }
  }
  if (n.armor === 'heavy') {
    // Gauntlet cuffs + knee cops — chunky, low-count.
    for (const el of [rig.elbowL, rig.elbowR]) {
      el.add(kit.cyl(limbBulk * 1.25, limbBulk * 1.45, d.foreArm * 0.5, kit.mat(p.metal, { flat: true }), 0, -d.foreArm * 0.65, 0, 10));
    }
    for (const kn of [rig.kneeL, rig.kneeR]) {
      kn.add(kit.sph(limbBulk * 1.3, kit.mat(p.metal2, { flat: true }), 0, 0, 0.4));
    }
  }
  if (n.armor === 'light') {
    // Leather chest strap + stitched jerkin edge.
    rig.chest.add(kit.ribbon(
      [[-d.shoulderHalf * 0.75, chestTop * 0.95, d.hipHalf * 0.9], [0, chestTop * 0.45, d.hipHalf * 1.35], [d.shoulderHalf * 0.8, chestTop * 0.05, d.hipHalf * 0.75]],
      0.75, kit.mat(p.leather), 0.5,
    ));
  }

  // --- class markers --------------------------------------------------------
  if (n.markers.has('hood_up')) {
    // Raised hood: an OPEN draped cowl over the crown/back/sides with the face
    // clear, a soft back peak, and fabric pooling into a shoulder cowl — not a
    // bald sphere. hoodShell leaves the front (+Z) open for the face.
    const hood = kit.hoodShell({
      color: p.cloth2, r: d.headR * 1.26, faceHalf: 1.24, browFrac: 0.28, aBot: 2.3,
      peak: d.headR * 0.55, thickness: d.headR * 0.15, folds: 6, foldDepth: d.headR * 0.07,
      uSeg: 52, vSeg: 26,
    });
    hood.position.set(0, d.headR * 0.16, -d.headR * 0.06);
    rig.head.add(hood);
    // Shoulder cowl: fabric gathering behind the neck — kept narrow (wrap well
    // under 180°) so its side edges stay behind the shoulders, not under the arms.
    const cowl = kit.drape({
      color: p.cloth2, length: d.headR * 1.2, radii: [d.headR * 0.6, d.headR * 0.9, d.headR * 0.6],
      wrap: 2.7, yTop: chestTop * 0.9, standoff: 0.1, thickness: 0.9, folds: 4, foldDepth: 0.4, curl: 0.7,
    });
    rig.chest.add(cowl);
  }
  if (n.markers.has('trophy_straps')) {
    rig.chest.add(kit.ribbon(
      [[-d.shoulderHalf * 0.8, chestTop * 1.0, d.hipHalf * 0.8], [0, chestTop * 0.4, d.hipHalf * 1.3], [d.shoulderHalf * 0.85, chestTop * -0.35, d.hipHalf * 0.6]],
      0.85, kit.mat(p.leather), 0.55,
    ));
    // Trophy tusks on the strap.
    rig.chest.add(kit.cone(0.55, 1.8, kit.mat(p.bone), -1.2, chestTop * 0.55, d.hipHalf * 1.55).rotateZ(0.5));
    rig.chest.add(kit.cone(0.55, 1.6, kit.mat(p.bone), 0.6, chestTop * 0.4, d.hipHalf * 1.6).rotateZ(-0.4));
  }
  if (n.markers.has('radiant_motif')) {
    // Modest halo ring behind the head — reads instantly as "holy".
    const halo = kit.torus(d.headR * 0.85, 0.28, kit.mat(p.magic, { emissive: p.magic, emissiveIntensity: 0.55 }), 0, d.headR * 0.75, -d.headR * 1.15, 22);
    rig.head.add(kit.noOutline(halo));
  }
  if (n.markers.has('nature_motif')) {
    for (const [s, sh] of [[-1, rig.shoulderL], [1, rig.shoulderR]] as const) {
      for (let i = 0; i < 2; i++) {
        const leaf = kit.sph(0.9, kit.mat(0x6a9a4a), s * 0.8, 1.2 - i * 0.9, 0.6 + i * 0.5);
        leaf.scale.set(0.8, 1.3, 0.4);
        leaf.rotation.z = s * (0.6 + i * 0.4);
        sh.add(leaf);
      }
    }
  }
  if (n.markers.has('sneak_gear')) {
    // Spare dagger sheathed at the small of the back.
    const sheath = kit.bevelBox(1.1, 4.2, 1.0, kit.mat(p.leather, { flat: true }), -d.hipHalf * 1.1, -0.6, -d.hipHalf * 1.25, 0.3);
    sheath.rotation.z = 0.5;
    rig.hips.add(sheath);
  }
  if (n.markers.has('wilderness_gear')) {
    rig.chest.add(kit.ribbon(
      [[d.shoulderHalf * 0.75, chestTop * 1.0, d.hipHalf * 0.8], [0, chestTop * 0.45, d.hipHalf * 1.3], [-d.shoulderHalf * 0.8, chestTop * -0.3, d.hipHalf * 0.6]],
      0.7, kit.mat(p.leather), 0.55,
    ));
  }
  if (n.markers.has('holy_symbol') && !n.gear.includes('holy_symbol_necklace') && !n.gear.includes('holy_symbol_held')) {
    n.gear.push('holy_symbol_necklace');
  }
}

/** Which hands ended up holding something (for free-hand glow placement). */
interface HandUsage { left: boolean; right: boolean }

/** Place gear into hands / onto sockets. `swap` flips which hand is "main"
 *  (poses that extend the right hand want the weapon planted in the left). */
function buildGear(kit: MiniKit, rig: Rig, n: Normalized, gearScale: number, swap: boolean): HandUsage {
  const d = rig.dims;
  const mainHand = swap ? rig.handL : rig.handR;
  const offHand = swap ? rig.handR : rig.handL;
  const used: HandUsage = { left: false, right: false };
  const isBusy = (h: Rig['handL']) => (h === rig.handL ? used.left : used.right);
  const setBusy = (h: Rig['handL']) => { if (h === rig.handL) used.left = true; else used.right = true; };

  const hold = (id: GearId, hand: Rig['handL']) => {
    const def = GEAR[id];
    const g = def.build(kit, n.pal);
    g.scale.setScalar(gearScale);
    if (hand === rig.handL) g.scale.x *= -1; // mirror left-held items
    const [rx, ry, rz] = def.held ?? [Math.PI / 2, 0, 0];
    g.rotation.set(rx, ry, rz);
    g.position.set(0, -0.6, 0.3);
    // Flagged weapons get yaw-corrected toward the figure's facing after the
    // pose runs (see reaimWeapons) — the static `held` euler is just the base.
    if (def.aim) g.userData.isWeapon = true;
    hand.add(g);
    setBusy(hand);
  };

  for (const id of n.gear) {
    if (id === 'none') continue; // explicit empty-hand sentinel
    const def = GEAR[id];
    if (!def) continue;
    switch (def.slot) {
      case 'main':
        if (!isBusy(mainHand)) hold(id, mainHand);
        else if (!isBusy(offHand)) hold(id, offHand);
        break;
      case 'off':
        if (!isBusy(offHand)) hold(id, offHand);
        else if (!isBusy(mainHand)) hold(id, mainHand);
        break;
      case 'both':
        if (!isBusy(mainHand)) hold(id, mainHand);
        break;
      case 'dual':
        if (!isBusy(rig.handR)) hold(id, rig.handR);
        if (!isBusy(rig.handL)) hold(id, rig.handL);
        break;
      case 'shield': {
        const g = def.build(kit, n.pal);
        g.scale.setScalar(gearScale * 0.9);
        // Provisional strap position; flagged so the builder re-aims the face
        // FORWARD in world space after the pose runs and re-anchors it clear
        // of the posed forearm/fist (see the isShield pass in buildMiniature).
        g.position.set(0, -d.foreArm * 0.5, Math.sqrt(d.bulk) * 1.35);
        g.userData.isShield = true;
        rig.elbowL.add(g);
        used.left = true; // forearm occupied — no second off-hand item
        break;
      }
      case 'back': {
        const g = def.build(kit, n.pal);
        g.scale.setScalar(gearScale * (d.shoulderHalf / 4.4));
        rig.sockets.back.add(g);
        if (g.userData.wantsHood && !n.markers.has('hood_up')) {
          // Hood worn DOWN: an empty hood slumped between the shoulder blades —
          // a short drape with a deep curl so it reads as collapsed cloth, not
          // a ball. Faces up/back off the neck.
          const cowl = kit.drape({
            color: n.pal.cloth2, length: d.headR * 1.25, radii: [d.headR * 0.6, d.headR * 1.05, d.headR * 0.55],
            wrap: 3.3, yTop: d.headR * 0.7, standoff: 0.15, thickness: 1.0, folds: 4, foldDepth: 0.5, curl: d.headR * 0.9,
          });
          rig.sockets.back.add(cowl);
        }
        break;
      }
      case 'belt': {
        const g = def.build(kit, n.pal);
        g.scale.setScalar(gearScale * (d.hipHalf / 2.5));
        rig.sockets.belt.add(g);
        break;
      }
      case 'neck': {
        const g = def.build(kit, n.pal);
        g.scale.setScalar(d.shoulderHalf / 4.4);
        g.position.y = d.torsoLen * 0.5;
        rig.chest.add(g);
        break;
      }
      case 'head': {
        const g = def.build(kit, n.pal);
        g.scale.setScalar(d.headR / 3.3);
        g.position.y = d.headR * 0.55;
        rig.head.add(g);
        break;
      }
      case 'body': {
        const g = def.build(kit, n.pal);
        if (id === 'tabard') {
          // Tabard hangs from the WAIST (hips), clear of the cuirass.
          g.scale.setScalar(d.hipHalf / 2.5);
          g.position.y = 1.2;
          rig.hips.add(g);
        } else {
          g.scale.setScalar(d.shoulderHalf / 4.4);
          rig.chest.add(g);
        }
        break;
      }
      case 'hands': {
        if (id === 'hand_wraps') {
          for (const el of [rig.elbowL, rig.elbowR]) {
            const g = def.build(kit, n.pal);
            g.scale.setScalar(Math.sqrt(d.bulk));
            g.position.y = -d.foreArm * 0.6;
            el.add(g);
          }
        } else {
          // magic_hands: wisps around each palm.
          for (const hand of [rig.handL, rig.handR]) {
            const g = def.build(kit, n.pal);
            g.scale.setScalar(0.55 * gearScale);
            g.position.y = -1.2;
            hand.add(g);
          }
        }
        break;
      }
    }
  }
  return used;
}

/** Magic hand-glows (blessing, arcane spark, infernal flame) land on a FREE
 *  hand after gear placement — a glow inside a held tome reads as a mistake. */
function buildHandGlows(kit: MiniKit, rig: Rig, n: Normalized, used: HandUsage): void {
  const p = n.pal;
  const glowAt = (hand: Rig['handL'], r: number) =>
    hand.add(kit.noOutline(kit.sph(r, kit.mat(p.magic, { emissive: p.magic, emissiveIntensity: 0.9, opacity: 0.85 }), 0, -1.6, 0.3)));
  // Blessing is always the raised left palm (shield straps to the forearm,
  // so the palm itself stays open).
  if (n.markers.has('blessing_hand')) glowAt(rig.handL, 1.5);
  if (n.markers.has('arcane_glow') && (!used.left || !used.right)) glowAt(used.right ? rig.handL : rig.handR, 1.1);
  if (n.markers.has('infernal_motif') && (!used.right || !used.left)) glowAt(used.right ? rig.handL : rig.handR, 1.1);
}

/** Re-aim strapped shields for the rig's CURRENT joint state: whatever the arm
 *  is doing, the face points forward (slight outward yaw + down-tilt reads best
 *  on the tabletop). Orientation alone is NOT enough: the strap offset lives in
 *  the forearm's local frame, so re-aiming the face to world-forward would let
 *  the forearm skewer through it. So we re-seat the disc CENTRED on the
 *  mid-forearm and push it out along the (now world-forward) face normal just
 *  far enough that its back rests flush against the outer forearm — the fist
 *  grips BEHIND the shield, so we deliberately do NOT clear past it (that read
 *  as floating). Called once at build; pose transitions re-call it per frame so
 *  the shield tracks the moving arm. */
export function reaimShields(THREE: typeof THREE_NS, rig: Rig): void {
  rig.root.updateMatrixWorld(true);
  // The rig authors in mm, but a caller may have it inside a scaled wrapper
  // (board figures bake mm→cell) and/or a rotated one (token facing, the
  // turntable spin). Work in WORLD units — mm-based radii multiply by the
  // world scale, and "forward" is the FIGURE's +Z, not the world's.
  const scl = rig.root.getWorldScale(new THREE.Vector3()).y || 1;
  const baseQ = rig.root.getWorldQuaternion(new THREE.Quaternion());
  const elbowW = rig.elbowL.getWorldPosition(new THREE.Vector3());
  const wristW = rig.handL.getWorldPosition(new THREE.Vector3());
  const armR = 1.35 * Math.sqrt(rig.dims.bulk) * scl; // rig.ts limb radius, world units
  const along = wristW.clone().sub(elbowW).normalize();
  const handW = wristW.clone().add(along.multiplyScalar(1.1 * armR)); // fist centre
  rig.root.traverse((o) => {
    if (!o.userData.isShield || !o.parent) return;
    const parentQ = o.parent.getWorldQuaternion(new THREE.Quaternion());
    const target = baseQ.clone()
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, -0.35, 0)));
    o.quaternion.copy(parentQ.invert().multiply(target));
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(target);
    const anchor = elbowW.clone().lerp(wristW, 0.55); // disc centred on the forearm
    const backHalf = 0.8 * o.scale.z * scl; // face-back extent at gear scale, world units
    // Push out along the face normal just past however far the gripping hand
    // reaches forward, so the fist grips BEHIND the disc (never pokes through
    // the face) whether the arm is across the body or punched forward — but
    // no clearance for the elbow (it's behind) or a gap, so it doesn't float.
    let reach = armR; // forearm radius floor (flush when the arm lies across n)
    for (const [pt, r] of [[wristW, armR], [handW, 0.8 * armR]] as const) {
      reach = Math.max(reach, pt.clone().sub(anchor).dot(n) + r);
    }
    const centerW = anchor.add(n.multiplyScalar(reach + backHalf));
    o.position.copy(o.parent.worldToLocal(centerW));
  });
}

/** Re-aim held weapons for the rig's CURRENT joint state: a leading blade
 *  should THREATEN along the figure's facing (toward the enemy across the
 *  table), not drift to whatever azimuth the arm chain left it at. Only the
 *  YAW is corrected — a world-space rotation about the figure's up axis
 *  through the grip — so the pose's authored pitch (raised / lowered) and the
 *  weapon's edge roll survive. Two authored reads are deliberately left alone:
 *  near-vertical weapons (planted hafts, overhead wind-ups — yaw is
 *  meaningless there, so the correction fades out toward vertical) and
 *  weapons trailing BEHIND the figure (rage_charge) which point backward on
 *  purpose. Called once at build; pose transitions re-call it per frame
 *  alongside reaimShields so the weapon tracks the moving arm. */
export function reaimWeapons(THREE: typeof THREE_NS, rig: Rig): void {
  rig.root.updateMatrixWorld(true);
  // Like reaimShields: the figure may live in a rotated wrapper (token
  // facing, turntable spin) — "forward" is the FIGURE's +Z in world space.
  const rootQ = rig.root.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rootQ);
  const fwdFlat = fwd.clone().addScaledVector(up, -fwd.dot(up)).normalize();
  rig.root.traverse((o) => {
    if (!o.userData.isWeapon || !o.parent) return;
    // Compose the world rotation from quaternions (not matrix decompose —
    // left-hand mirroring bakes a negative scale on the weapon itself).
    const parentQ = o.parent.getWorldQuaternion(new THREE.Quaternion());
    const worldQ = parentQ.clone().multiply(o.quaternion);
    const blade = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQ); // long axis
    const flat = blade.clone().addScaledVector(up, -blade.dot(up));
    const horiz = flat.length(); // 0 = vertical blade, 1 = level blade
    if (horiz < 0.3) return; // planted / overhead wind-up — leave it
    flat.normalize();
    if (flat.dot(fwdFlat) <= 0.1) return; // trailing or backswing — authored
    const yaw = Math.atan2(flat.clone().cross(fwdFlat).dot(up), flat.dot(fwdFlat));
    // Ease the correction in over a short window past the vertical cutoff so
    // a raised weapon crossing the threshold mid-tween drifts instead of
    // popping; anything meaningfully levelled gets the full correction.
    const w = Math.min(1, (horiz - 0.3) / 0.15);
    // Rotate about the grip: the gear group's origin IS the grip, so a pure
    // quaternion change pivots the weapon in the fist without unseating it.
    const target = new THREE.Quaternion().setFromAxisAngle(up, yaw * w).multiply(worldQ);
    o.quaternion.copy(parentQ.invert().multiply(target));
  });
}

/** Build one miniature from a (validated) recipe. */
export function buildMiniature(THREE: typeof THREE_NS, recipe: MiniRecipe, kit?: MiniKit): BuiltMini {
  const k = kit ?? makeMiniKit(THREE);
  const n = normalize(recipe);
  const sp = SPECIES[recipe.species];
  const dims = speciesDims(recipe.species);

  const rig = buildRig(k, dims, bodyStyle(n));
  buildSpeciesFeatures(k, rig, recipe.species, effectiveMarkers(recipe.species, recipe.speciesMarkers), n.pal);
  buildOutfit(k, rig, n);

  // Weapons stay near-heroic size even on small folk (tabletop readability):
  // scale drifts only 20% across the whole stature range.
  const gearScale = 0.8 + 0.2 * sp.height;
  const used = buildGear(k, rig, n, gearScale, POSES[n.pose].swapHands ?? false);
  buildHandGlows(k, rig, n, used);

  poseRig(rig, n.pose, recipe.poseIntensity);
  if (sp.lean) rig.chest.rotation.x += sp.lean; // species posture (dragonborn)

  reaimShields(THREE, rig);
  reaimWeapons(THREE, rig);

  const baseRadius = recipe.baseSize === '32mm_round' ? 16 : 12.5;
  const base = buildBase(k, n.base, baseRadius, n.pal);
  // Tag the plinth so downstream consumers can strip it. The /minis viewer and
  // thumbnails keep it; the scene-map adapter (models3d/miniRecipe.ts) removes
  // it because the map draws its own pedestal ring under every figure.
  base.group.userData.isMiniBase = true;

  const group = k.group(base.group, rig.root);
  rig.root.position.y = base.topY;
  group.name = recipe.name;

  // Ground clamp: FK poses (crouches, lunges) move the feet vertically; plant
  // the lowest boot point exactly on the plinth top so every pose stands
  // properly based. Measured from the feet only — a low-trailing weapon may
  // legitimately overlap the base rubble.
  group.updateMatrixWorld(true);
  const feet = new THREE.Box3().setFromObject(rig.footL);
  feet.union(new THREE.Box3().setFromObject(rig.footR));
  if (Number.isFinite(feet.min.y)) rig.root.position.y += base.topY - feet.min.y;

  k.addOutline(group);

  // Frame on the ACTUAL top (a crouched rogue is far shorter than an
  // overhead-strike fighter) so the viewer/thumbnail camera fits every pose.
  group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(group);
  const heightMm = Number.isFinite(bb.max.y) ? Math.max(bb.max.y, 20) : base.topY + dims.height + 2;

  return { group, recipe, heightMm, baseRadiusMm: baseRadius, rig };
}
