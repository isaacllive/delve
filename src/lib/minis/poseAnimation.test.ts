// Pose transition engine tests: the pure target kernel resolves the static
// pose tables faithfully, lerped blends keep the flat-sole ankle invariant at
// every point, and the animator tweens a real rig between poses, re-planting
// the boots on the plinth when it settles. Geometry uses real THREE in node
// (no renderer needed), same as minis.test.ts.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeMiniKit } from './kit.ts';
import { buildRig, HUMAN_DIMS, type Rig } from './rig.ts';
import { poseTargets, applyPoseTargets, poseRig, poseScale, POSE_JOINTS } from './poses.ts';
import { createPoseAnimator, createPoseFlourish, lerpPoseTargets, easeInOutCubic } from './poseAnimation.ts';
import { buildMiniature, effectivePose, reaimShields, reaimWeapons } from './builder.ts';
import { parseMiniRecipe } from './recipe.ts';

const D = Math.PI / 180;

const testRig = (): Rig =>
  buildRig(makeMiniKit(THREE), HUMAN_DIMS, {
    skin: 0xe0a878, torso: 0x777777, arms: 0x777777,
    hands: 0xe0a878, legs: 0x555555, boots: 0x333333,
  });

describe('easeInOutCubic', () => {
  it('hits the endpoints, is symmetric, and clamps', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(-2)).toBe(0);
    expect(easeInOutCubic(3)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25); // slow-in
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75); // slow-out
  });
});

describe('poseScale', () => {
  it('runs from the 45% floor to the 120% overdrive ceiling and clamps', () => {
    expect(poseScale(0)).toBeCloseTo(0.45);
    expect(poseScale(1)).toBeCloseTo(1.2);
    expect(poseScale(-5)).toBeCloseTo(0.45);
    expect(poseScale(9)).toBeCloseTo(1.2);
    expect(poseScale(0.6)).toBeCloseTo(0.9); // recipe default lands near authored
  });
});

describe('poseTargets', () => {
  it('overdrives the pose table at full intensity (t = poseScale(1))', () => {
    const s = poseScale(1);
    const t = poseTargets(HUMAN_DIMS, 'ready_stance', 1);
    expect(t.joints.shoulderR[0]).toBeCloseTo(-35 * D * s);
    expect(t.joints.shoulderR[2]).toBeCloseTo(14 * D * s);
    expect(t.joints.elbowR[0]).toBeCloseTo(-55 * D * s);
    expect(t.hipsPosY).toBeCloseTo(HUMAN_DIMS.hipY * (1 - 0.06 * s));
  });

  it('scales from the intensity floor, never to zero', () => {
    const lo = poseTargets(HUMAN_DIMS, 'ready_stance', 0);
    const hi = poseTargets(HUMAN_DIMS, 'ready_stance', 1);
    expect(lo.joints.shoulderR[0]).toBeCloseTo(hi.joints.shoulderR[0] * (poseScale(0) / poseScale(1)));
    expect(lo.joints.shoulderR[0]).not.toBe(0);
  });

  it('counter-rotates the ankles so soles stay flat', () => {
    const t = poseTargets(HUMAN_DIMS, 'crouching_sneak', 0.8);
    expect(t.joints.footL[0]).toBeCloseTo(-(t.joints.hipL[0] + t.joints.kneeL[0]));
    expect(t.joints.footL[2]).toBeCloseTo(-t.joints.hipL[2]);
    expect(t.joints.footR[0]).toBeCloseTo(-(t.joints.hipR[0] + t.joints.kneeR[0]));
  });
});

describe('lerpPoseTargets', () => {
  const a = poseTargets(HUMAN_DIMS, 'standing', 0.6);
  const b = poseTargets(HUMAN_DIMS, 'overhead_strike', 0.9);

  it('returns the endpoints at t=0 and t=1', () => {
    expect(lerpPoseTargets(a, b, 0)).toEqual(a);
    expect(lerpPoseTargets(a, b, 1)).toEqual(b);
  });

  it('blends every component linearly', () => {
    const mid = lerpPoseTargets(a, b, 0.5);
    expect(mid.hipsPosY).toBeCloseTo((a.hipsPosY + b.hipsPosY) / 2);
    for (const j of POSE_JOINTS) {
      for (const c of [0, 1, 2] as const) {
        expect(mid.joints[j][c]).toBeCloseTo((a.joints[j][c] + b.joints[j][c]) / 2);
      }
    }
  });

  it('keeps the flat-sole ankle invariant at every blend point', () => {
    const from = poseTargets(HUMAN_DIMS, 'crouching_sneak', 1);
    const to = poseTargets(HUMAN_DIMS, 'sword_lunge', 1);
    for (const t of [0.2, 0.5, 0.8]) {
      const m = lerpPoseTargets(from, to, t);
      expect(m.joints.footL[0]).toBeCloseTo(-(m.joints.hipL[0] + m.joints.kneeL[0]));
      expect(m.joints.footL[2]).toBeCloseTo(-m.joints.hipL[2]);
      expect(m.joints.footR[0]).toBeCloseTo(-(m.joints.hipR[0] + m.joints.kneeR[0]));
      expect(m.joints.footR[2]).toBeCloseTo(-m.joints.hipR[2]);
    }
  });
});

describe('applyPoseTargets', () => {
  it('writes the same joint state as the build-time poseRig path', () => {
    const r1 = testRig(), r2 = testRig();
    poseRig(r1, 'bow_drawn', 0.85);
    applyPoseTargets(r2, poseTargets(HUMAN_DIMS, 'bow_drawn', 0.85));
    for (const j of POSE_JOINTS) {
      expect(r2[j].rotation.x).toBeCloseTo(r1[j].rotation.x);
      expect(r2[j].rotation.y).toBeCloseTo(r1[j].rotation.y);
      expect(r2[j].rotation.z).toBeCloseTo(r1[j].rotation.z);
    }
    expect(r2.hips.position.y).toBeCloseTo(r1.hips.position.y);
    expect(r2.hips.position.z).toBeCloseTo(r1.hips.position.z);
  });

  it('folds the species chest lean into the absolute chest rotation', () => {
    const rig = testRig();
    const t = poseTargets(HUMAN_DIMS, 'standing', 0.6);
    applyPoseTargets(rig, t, 0.1);
    expect(rig.chest.rotation.x).toBeCloseTo(t.joints.chest[0] + 0.1);
  });
});

describe('createPoseAnimator', () => {
  const feetMinY = (rig: Rig) => {
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.footL);
    box.union(new THREE.Box3().setFromObject(rig.footR));
    return box.min.y;
  };

  it('snaps instantly with duration 0 (reduced motion)', () => {
    const rig = testRig();
    poseRig(rig, 'standing', 0.6);
    const anim = createPoseAnimator(rig, { family: 'standing', intensity: 0.6 }, { durationMs: 0 });
    anim.retarget({ family: 'overhead_strike', intensity: 1 });
    expect(anim.update(123)).toBe(true);
    const want = poseTargets(HUMAN_DIMS, 'overhead_strike', 1);
    expect(rig.shoulderR.rotation.x).toBeCloseTo(want.joints.shoulderR[0]);
    expect(anim.update(124)).toBe(false); // settled — nothing more to write
  });

  it('tweens through intermediate states and settles on the target', () => {
    const rig = testRig();
    poseRig(rig, 'standing', 0.6);
    const anim = createPoseAnimator(rig, { family: 'standing', intensity: 0.6 }, { durationMs: 100 });
    anim.retarget({ family: 'crouching_sneak', intensity: 1 });

    anim.update(1000); // first frame stamps the clock (t=0)
    const from = poseTargets(HUMAN_DIMS, 'standing', 0.6);
    expect(rig.shoulderR.rotation.x).toBeCloseTo(from.joints.shoulderR[0]);

    anim.update(1050); // halfway
    const to = poseTargets(HUMAN_DIMS, 'crouching_sneak', 1);
    const lo = Math.min(from.joints.shoulderR[0], to.joints.shoulderR[0]);
    const hi = Math.max(from.joints.shoulderR[0], to.joints.shoulderR[0]);
    expect(rig.shoulderR.rotation.x).toBeGreaterThan(lo);
    expect(rig.shoulderR.rotation.x).toBeLessThan(hi);

    expect(anim.update(1100)).toBe(true); // final write
    expect(rig.shoulderR.rotation.x).toBeCloseTo(to.joints.shoulderR[0]);
    expect(rig.hips.position.y).toBeCloseTo(to.hipsPosY);
    expect(anim.animating).toBe(false);
  });

  it('re-plants the boots on the plinth after a deep crouch', () => {
    const rig = testRig();
    poseRig(rig, 'standing', 0.6);
    // Builder-style ground clamp for the initial pose.
    rig.root.position.y += 3 - feetMinY(rig);
    const plinth = feetMinY(rig);
    expect(plinth).toBeCloseTo(3);

    const anim = createPoseAnimator(rig, { family: 'standing', intensity: 0.6 }, {
      durationMs: 0,
      measureFeetMinY: () => feetMinY(rig),
    });
    anim.retarget({ family: 'crouching_sneak', intensity: 1 });
    anim.update(1);
    expect(feetMinY(rig)).toBeCloseTo(plinth, 4);
  });

  it('re-plants boots when the rig lives in a scaled world (board figures)', () => {
    // Board figures bake mm→cell scale on a wrapper; ground-clamp probes
    // measure world (cell) units while the root corrects in local (mm) units.
    const rig = testRig();
    poseRig(rig, 'standing', 0.6);
    const SCALE = 1 / 35;
    const wrapper = new THREE.Group();
    wrapper.scale.setScalar(SCALE);
    wrapper.add(rig.root);
    const measure = () => {
      wrapper.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig.footL);
      box.union(new THREE.Box3().setFromObject(rig.footR));
      return box.min.y;
    };
    rig.root.position.y += (0.1 - measure()) / SCALE; // clamp initial pose at world y=0.1
    const plinth = measure();
    expect(plinth).toBeCloseTo(0.1, 5);

    const anim = createPoseAnimator(rig, { family: 'standing', intensity: 0.6 }, {
      durationMs: 0,
      measureFeetMinY: measure,
      worldUnitsPerRigUnit: rig.root.getWorldScale(new THREE.Vector3()).y,
    });
    anim.retarget({ family: 'crouching_sneak', intensity: 1 });
    anim.update(1);
    expect(measure()).toBeCloseTo(plinth, 5);
  });

  it('ignores a retarget to the pose it already shows', () => {
    const rig = testRig();
    poseRig(rig, 'standing', 0.6);
    const anim = createPoseAnimator(rig, { family: 'standing', intensity: 0.6 }, { durationMs: 100 });
    anim.retarget({ family: 'standing', intensity: 0.6 });
    expect(anim.animating).toBe(false);
    expect(anim.update(1)).toBe(false);
  });

  it('redirects smoothly mid-flight without snapping back', () => {
    const rig = testRig();
    poseRig(rig, 'standing', 0.6);
    const anim = createPoseAnimator(rig, { family: 'standing', intensity: 0.6 }, { durationMs: 100 });
    anim.retarget({ family: 'overhead_strike', intensity: 1 });
    anim.update(1000);
    anim.update(1050);
    const midX = rig.shoulderR.rotation.x;

    anim.retarget({ family: 'crouching_sneak', intensity: 1 });
    anim.update(2000); // first frame of the redirect starts FROM the mid state
    expect(rig.shoulderR.rotation.x).toBeCloseTo(midX);

    anim.update(2100);
    const want = poseTargets(HUMAN_DIMS, 'crouching_sneak', 1);
    expect(rig.shoulderR.rotation.x).toBeCloseTo(want.joints.shoulderR[0]);
  });
});

describe('createPoseFlourish', () => {
  const rest = { family: 'ready_stance', intensity: 0.6 } as const;
  const strike = { family: 'sword_lunge', intensity: 1 } as const;

  // Non-zero base clock — the animator's `if (!startAt)` treats 0 as "unset"
  // (harmless in-app since performance.now() is never 0).
  it('drives rest → strike → hold → rest and then settles to done', () => {
    const rig = testRig();
    poseRig(rig, rest.family, rest.intensity);
    const fl = createPoseFlourish(rig, rest, strike, { strikeMs: 100, holdMs: 100, returnMs: 100 });

    // Strike leg completes → figure sits at the strike pose.
    fl.update(1000);
    fl.update(1100);
    const wantStrike = poseTargets(HUMAN_DIMS, strike.family, strike.intensity);
    expect(rig.shoulderR.rotation.x).toBeCloseTo(wantStrike.joints.shoulderR[0]);
    expect(fl.animating).toBe(true);

    // Through the hold it stays animating (caller keeps it alive) but the
    // pose doesn't move off the strike.
    fl.update(1150);
    expect(fl.animating).toBe(true);
    expect(rig.shoulderR.rotation.x).toBeCloseTo(wantStrike.joints.shoulderR[0]);

    // Recover leg runs after the hold, ending back at rest, then done.
    fl.update(1200); // hold expires → start return
    fl.update(1300); // return completes
    const wantRest = poseTargets(HUMAN_DIMS, rest.family, rest.intensity);
    expect(rig.shoulderR.rotation.x).toBeCloseTo(wantRest.joints.shoulderR[0]);
    expect(fl.pose).toEqual(rest);
    expect(fl.animating).toBe(false);
    expect(fl.update(1400)).toBe(false); // finished — nothing more to write
  });

  it('ignores external retargets (self-driven sequence)', () => {
    const rig = testRig();
    poseRig(rig, rest.family, rest.intensity);
    const fl = createPoseFlourish(rig, rest, strike, { strikeMs: 100, holdMs: 0, returnMs: 100 });
    fl.retarget({ family: 'pounce', intensity: 1 }); // no-op
    fl.update(1000);
    fl.update(1100);
    // Still headed to the strike we constructed with, not the pounce.
    const wantStrike = poseTargets(HUMAN_DIMS, strike.family, strike.intensity);
    expect(rig.shoulderR.rotation.x).toBeCloseTo(wantStrike.joints.shoulderR[0]);
  });

  // Regression: on the board the figure is MOUNTED (positioned at the pedestal,
  // scaled by token size) AFTER the flourish is constructed, so a feet measure
  // taken during the recover leg reports a different frame than the plinth
  // captured at construction. The recover leg must restore the exact rest root
  // height regardless, or the whole figure gets yanked down into the base.
  it('restores the rest root height on recover despite a shifted feet measure', () => {
    const rig = testRig();
    poseRig(rig, rest.family, rest.intensity);
    const restRootY = rig.root.position.y;
    // A measure that jumps by a large offset once the figure is "mounted".
    let mounted = false;
    const measure = () => {
      rig.root.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(rig.footL);
      b.union(new THREE.Box3().setFromObject(rig.footR));
      return b.min.y + (mounted ? 100 : 0);
    };
    const fl = createPoseFlourish(rig, rest, { family: 'crouching_sneak', intensity: 1 }, {
      measureFeetMinY: measure,
      worldUnitsPerRigUnit: 1,
      strikeMs: 100, holdMs: 0, returnMs: 100,
    });
    mounted = true; // figure gets placed on the board — measure frame shifts
    fl.update(1000);
    fl.update(1100); // strike settles → enter hold (holdMs 0)
    fl.update(1101); // hold expires → start recover (must ignore the +100 measure)
    fl.update(1250); // recover completes
    expect(rig.root.position.y).toBeCloseTo(restRootY, 3);
  });
});

describe('reaimShields in scaled/rotated worlds', () => {
  const findShield = (root: THREE.Object3D): THREE.Object3D => {
    let shield: THREE.Object3D | null = null;
    root.traverse((o) => { if (o.userData.isShield) shield = o; });
    expect(shield).toBeTruthy();
    return shield!;
  };

  it('keeps the shield strapped to the figure inside a cell-scaled wrapper', () => {
    // Regression: the board bakes mm→cell (1/35) on a wrapper; the re-aim
    // used raw mm radii against world (cell) distances, throwing the shield
    // cells away from the figure mid pose-transition.
    const built = buildMiniature(THREE, parseMiniRecipe({
      name: 'S', class: 'fighter', species: 'goblin', gear: ['club', 'round_shield'],
    }));
    const wrapper = new THREE.Group();
    wrapper.scale.setScalar(1 / 35);
    wrapper.add(built.group);
    poseRig(built.rig, 'pounce', 1); // move the arm hard, then re-seat
    reaimShields(THREE, built.rig);
    wrapper.updateMatrixWorld(true);
    const shieldW = findShield(built.rig.root).getWorldPosition(new THREE.Vector3());
    const elbowW = built.rig.elbowL.getWorldPosition(new THREE.Vector3());
    // World figure height ≈ heightMm/35; the shield must sit within arm's
    // reach of the elbow, not cells away.
    const figureH = built.heightMm / 35;
    expect(shieldW.distanceTo(elbowW)).toBeLessThan(figureH * 0.5);
  });

  it('aims the face along the FIGURE forward, not world forward', () => {
    const built = buildMiniature(THREE, parseMiniRecipe({
      name: 'S', class: 'fighter', species: 'human', gear: ['sword', 'heater_shield'],
    }));
    const spin = new THREE.Group();
    spin.rotation.y = Math.PI / 2; // token facing east
    spin.add(built.group);
    reaimShields(THREE, built.rig);
    spin.updateMatrixWorld(true);
    const shield = findShield(built.rig.root);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(shield.getWorldQuaternion(new THREE.Quaternion()));
    // Figure forward is now world +X; the slight authored yaw/tilt keeps it
    // off-axis, but the dominant component must follow the figure.
    expect(Math.abs(n.x)).toBeGreaterThan(Math.abs(n.z));
  });
});

describe('reaimWeapons', () => {
  const findWeapon = (root: THREE.Object3D): THREE.Object3D => {
    let weapon: THREE.Object3D | null = null;
    root.traverse((o) => { if (o.userData.isWeapon) weapon = o; });
    expect(weapon).toBeTruthy();
    return weapon!;
  };
  /** World heading of the weapon's long axis, projected on the ground plane. */
  const heading = (o: THREE.Object3D): THREE.Vector3 => {
    o.updateWorldMatrix(true, false);
    const dir = new THREE.Vector3(0, 1, 0).transformDirection(o.matrixWorld);
    dir.y = 0;
    return dir.normalize();
  };

  it('points a leading blade along the figure forward (build-time pass)', () => {
    const built = buildMiniature(THREE, parseMiniRecipe({
      name: 'W', class: 'fighter', species: 'human', gear: ['sword'], poseFamily: 'sword_lunge',
    }));
    built.group.updateMatrixWorld(true);
    // buildMiniature already ran reaimWeapons — the thrust sword threatens +Z.
    expect(heading(findWeapon(built.rig.root)).z).toBeGreaterThan(0.95);
  });

  it('follows the FIGURE forward inside a rotated wrapper (token facing)', () => {
    const built = buildMiniature(THREE, parseMiniRecipe({
      name: 'W', class: 'fighter', species: 'human', gear: ['sword'], poseFamily: 'sword_lunge',
    }));
    const spin = new THREE.Group();
    spin.rotation.y = Math.PI / 2; // token facing east (world +X)
    spin.add(built.group);
    reaimWeapons(THREE, built.rig);
    spin.updateMatrixWorld(true);
    expect(heading(findWeapon(built.rig.root)).x).toBeGreaterThan(0.95);
  });

  it('leaves a cocked-back weapon alone (authored backswing)', () => {
    // smite_strike winds the warhammer up high over the shoulder — its head
    // points up-and-back on purpose; re-aiming it forward would kill the read.
    const built = buildMiniature(THREE, parseMiniRecipe({
      name: 'W', class: 'cleric', species: 'human', gear: ['warhammer'], poseFamily: 'smite_strike',
    }));
    built.group.updateMatrixWorld(true);
    const before = heading(findWeapon(built.rig.root));
    expect(before.z).toBeLessThan(0.1); // still trailing after the build pass
    reaimWeapons(THREE, built.rig); // idempotent — a second pass doesn't drag it forward
    expect(heading(findWeapon(built.rig.root)).z).toBeCloseTo(before.z, 5);
  });
});

describe('builder pose-animation surface', () => {
  it('exposes the live rig inside the built group', () => {
    const built = buildMiniature(THREE, parseMiniRecipe({ name: 'T', class: 'fighter', species: 'human' }));
    expect(built.rig.root.parent).toBe(built.group);
    let found = false;
    built.group.traverse((o) => { if (o === built.rig.shoulderR) found = true; });
    expect(found).toBe(true);
  });

  it('effectivePose resolves the recipe override or the class default', () => {
    const withPose = parseMiniRecipe({ name: 'T', class: 'fighter', species: 'human', poseFamily: 'pounce', poseIntensity: 0.9 });
    expect(effectivePose(withPose)).toEqual({ family: 'pounce', intensity: 0.9 });
    const noPose = parseMiniRecipe({ name: 'T', class: 'ranger', species: 'elf' });
    expect(effectivePose(noPose).family).toBe('bow_drawn'); // ranger class default
    expect(effectivePose(noPose).intensity).toBeCloseTo(0.6);
  });
});
