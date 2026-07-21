// Pose transition engine: tween a built miniature's rig from its current pose
// to another pose family/intensity instead of rebuilding the figure.
//
// Everything here works on the pure `PoseTargets` snapshots poses.ts resolves
// from the static pose tables, so the animated path and the build-time path
// share one source of truth and can't drift. Lerping targets component-wise
// preserves the flat-sole ankle counter at every blend point (it's linear in
// the leg angles), so boots stay planted mid-transition.
//
// Ground clamp: FK poses move the feet vertically (crouches, lunges). The
// animator asks the renderer to measure the lowest boot point (a Box3 over the
// feet — THREE stays on the caller's side) at the start pose and at each
// destination pose, then tweens the root height so soles land exactly back on
// the plinth. Known gap, deliberate: gear stays in the hands it was BUILT in —
// a destination pose whose `swapHands` differs won't re-home the weapon
// (that's a rebuild, not a transition).
import { poseTargets, applyPoseTargets, POSE_JOINTS, type PoseTargets } from './poses.ts';
import type { PoseFamily } from './recipe.ts';
import type { Rig } from './rig.ts';

export interface PoseState {
  family: PoseFamily;
  /** 0..1, same scale as `MiniRecipe.poseIntensity`. */
  intensity: number;
}

/** Standard ease for pose transitions: slow-in/slow-out, no overshoot (an
 *  overshooting elbow reads as a glitch on a chunky mini, not as snap). */
export function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** Component-wise blend of two pose snapshots. t=0 → a, t=1 → b. */
export function lerpPoseTargets(a: PoseTargets, b: PoseTargets, t: number): PoseTargets {
  // Weighted form is exact at both endpoints (x + (y-x)*t drifts a ULP at t=1).
  const mix = (x: number, y: number) => (1 - t) * x + t * y;
  const joints = {} as PoseTargets['joints'];
  for (const j of POSE_JOINTS) {
    const ja = a.joints[j], jb = b.joints[j];
    joints[j] = [mix(ja[0], jb[0]), mix(ja[1], jb[1]), mix(ja[2], jb[2])];
  }
  return { hipsPosY: mix(a.hipsPosY, b.hipsPosY), hipsPosZ: mix(a.hipsPosZ, b.hipsPosZ), joints };
}

export interface PoseAnimatorOpts {
  /** Species posture lean (radians) the builder adds after posing — folded
   *  into every re-apply so a dragonborn keeps its forward pitch mid-tween. */
  chestLeanX?: number;
  /** Measure the world-space y of the lowest boot point for the pose that is
   *  CURRENTLY applied to the rig (Box3 over footL+footR after an
   *  updateMatrixWorld — the renderer owns THREE, so it owns the measuring).
   *  Omit to skip ground clamping (feet may sink/float between poses). */
  measureFeetMinY?: () => number;
  /** World units per rig-local unit in the frame measureFeetMinY reports —
   *  the ground-clamp delta divides by this before landing on the root's
   *  local y. 1 (default) for the turntable (mm world); a board figure baked
   *  to cell scale passes rig.root.getWorldScale().y. */
  worldUnitsPerRigUnit?: number;
  /** Transition length in ms; 0 (e.g. prefers-reduced-motion) snaps. */
  durationMs?: number;
}

export interface PoseAnimator {
  /** Start (or redirect mid-flight) a transition. Same-pose calls are no-ops.
   *  Pass `durationMs` to override the animator's default for THIS leg only
   *  (a flourish uses a fast strike then a slower recover). Pass `rootYTo` to
   *  set the destination root height DIRECTLY and skip the feet re-measure —
   *  used when returning to a pose whose grounded root height is already known
   *  (a flourish's recover leg), so it can't be thrown off by a measure taken
   *  in a different frame after the figure was mounted. */
  retarget(next: PoseState, durationMs?: number, rootYTo?: number): void;
  /** Advance to `nowMs` (performance.now() clock). Returns true if it wrote
   *  the rig this call — callers re-run per-frame derived work (shield
   *  re-aim) exactly while that's true. */
  update(nowMs: number): boolean;
  /** The pose currently targeted (== displayed once settled). */
  readonly pose: PoseState;
  readonly animating: boolean;
}

/** Drive pose transitions on a built rig. `initial` must be the pose the
 *  figure was BUILT in (builder ground-clamped it, so the current feet level
 *  defines the plinth top every later transition re-plants onto). */
export function createPoseAnimator(rig: Rig, initial: PoseState, opts: PoseAnimatorOpts = {}): PoseAnimator {
  const defaultDuration = opts.durationMs ?? 650;
  const lean = opts.chestLeanX ?? 0;
  let duration = defaultDuration;
  let target: PoseState = { ...initial };
  let current = poseTargets(rig.dims, initial.family, initial.intensity);
  let from = current;
  let to = current;
  let rootYFrom = rig.root.position.y;
  let rootYTo = rootYFrom;
  let startAt = 0;
  let animating = false;
  const plinthY = opts.measureFeetMinY?.() ?? null;

  return {
    retarget(next: PoseState, durationMs?: number, rootYToOverride?: number) {
      if (next.family === target.family && Math.abs(next.intensity - target.intensity) < 1e-3) return;
      duration = durationMs ?? defaultDuration;
      target = { ...next };
      from = current; // mid-flight redirects start from the blended state
      rootYFrom = rig.root.position.y;
      to = poseTargets(rig.dims, next.family, next.intensity);
      rootYTo = rootYFrom;
      if (rootYToOverride != null) {
        // Caller already knows the grounded root height for this pose — use it
        // and skip the (frame-sensitive) feet re-measure entirely.
        rootYTo = rootYToOverride;
      } else if (plinthY != null && opts.measureFeetMinY) {
        // Probe the destination: apply it, see where the boots land, and aim
        // the root height so they end up back on the plinth. Restore the
        // in-flight state before the next frame renders.
        applyPoseTargets(rig, to, lean);
        rootYTo = rootYFrom + (plinthY - opts.measureFeetMinY()) / (opts.worldUnitsPerRigUnit ?? 1);
        applyPoseTargets(rig, current, lean);
      }
      startAt = 0;
      animating = true;
    },
    update(nowMs: number): boolean {
      if (!animating) return false;
      if (!startAt) startAt = nowMs;
      const raw = duration <= 0 ? 1 : (nowMs - startAt) / duration;
      const t = easeInOutCubic(raw);
      current = raw >= 1 ? to : lerpPoseTargets(from, to, t);
      applyPoseTargets(rig, current, lean);
      rig.root.position.y = rootYFrom + (rootYTo - rootYFrom) * t;
      if (raw >= 1) animating = false;
      return true;
    },
    get pose() { return target; },
    get animating() { return animating; },
  };
}

export interface PoseFlourishOpts extends Omit<PoseAnimatorOpts, 'durationMs'> {
  /** rest → strike leg (ms). */
  strikeMs?: number;
  /** dwell at the strike pose (ms). */
  holdMs?: number;
  /** strike → rest leg (ms). */
  returnMs?: number;
}

/** A one-shot combat *flourish*: tween `rest` → `strike`, hold, then
 *  `strike` → `rest`, exposing the same `PoseAnimator` surface so the scene
 *  render loop drives it exactly like a normal pose tween. Built on
 *  `createPoseAnimator`, so it inherits the ground-clamp + shield re-aim
 *  behaviour for free. `retarget` is a no-op — the sequence owns the rig
 *  until it finishes; `animating` stays true through the hold so the caller
 *  keeps it in its update list. The rig must already be built in `rest`. */
export function createPoseFlourish(
  rig: Rig,
  rest: PoseState,
  strike: PoseState,
  opts: PoseFlourishOpts = {},
): PoseAnimator {
  const strikeMs = opts.strikeMs ?? 220;
  const holdMs = opts.holdMs ?? 320;
  const returnMs = opts.returnMs ?? 380;
  // The rig was built (and ground-clamped) in `rest`, so its current root
  // height IS the grounded rest height. Recovering to `rest` just restores it —
  // capture it now, BEFORE the figure is mounted/moved, so the recover leg is
  // immune to a feet measure taken in a different frame later.
  const restRootY = rig.root.position.y;
  const inner = createPoseAnimator(rig, rest, { ...opts, durationMs: strikeMs });
  let phase: 'strike' | 'hold' | 'return' | 'done' = 'strike';
  let holdUntil = 0;
  inner.retarget(strike);

  return {
    retarget() { /* self-driven; external retargets are ignored */ },
    update(nowMs: number): boolean {
      if (phase === 'done') return false;
      const wrote = inner.update(nowMs);
      if (phase === 'strike' && !inner.animating) {
        phase = 'hold';
        holdUntil = nowMs + holdMs;
      } else if (phase === 'hold' && nowMs >= holdUntil) {
        phase = 'return';
        inner.retarget(rest, returnMs, restRootY); // restore the exact rest height
        return inner.update(nowMs); // begin the recover leg this same frame
      } else if (phase === 'return' && !inner.animating) {
        phase = 'done';
      }
      return wrote;
    },
    get pose() { return inner.pose; },
    get animating() { return phase !== 'done'; },
  };
}
