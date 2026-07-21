// Procedural 3D model toolkit. Every model builder receives a ModelKit (which
// closes over the dynamically-imported THREE instance) and returns a
// THREE.Group built in UNIT space: ~1 cell wide/deep, base sitting on y=0,
// front facing +Z. Scene3D scales/positions/yaws the group per token.
//
// Builders never import 'three' directly (it's passed in), so this module and
// the category files are safe to import server-side (the build fns are inert
// until called in the browser).
import type * as THREE_NS from 'three';

type Mat = THREE_NS.Material;
type Obj = THREE_NS.Object3D;

export interface MatOpts { rough?: number; metal?: number; opacity?: number }

/** Build the helper kit around a live THREE namespace. */
export function makeKit(THREE: typeof THREE_NS) {
  // Material families — palette-keyed [roughness, metalness] so metal reads
  // as metal, stone as stone, cloth as cloth across every builder. Explicit
  // o.rough/o.metal still wins; non-palette tints keep the neutral default.
  // (Built at kit-construction time, after C below initialises.)
  const FAM: Record<number, [number, number]> = {
    [C.METAL]: [0.38, 0.75], [C.IRON]: [0.42, 0.7], [C.STEEL]: [0.32, 0.8],
    [C.GOLD]: [0.3, 0.85], [C.SILVER]: [0.3, 0.8], [C.RUST]: [0.6, 0.45],
    [C.STONE]: [0.9, 0.04], [C.DARKSTONE]: [0.92, 0.04], [C.BONE]: [0.85, 0.02],
    [C.PARCH]: [0.9, 0.02], [C.CLAY]: [0.88, 0.03],
    [C.WOOD]: [0.85, 0.02], [C.DARKWOOD]: [0.87, 0.02], [C.PLANK]: [0.84, 0.02],
    [C.BARK]: [0.9, 0.02], [C.LEATHER]: [0.8, 0.03], [C.DIRT]: [0.95, 0.02],
    [C.CLOTH]: [0.95, 0], [C.LEAF]: [0.88, 0.02], [C.DARKLEAF]: [0.9, 0.02], [C.GREEN]: [0.88, 0.02],
    [C.GLASS]: [0.15, 0.1], [C.ICE]: [0.18, 0.08], [C.WATER]: [0.25, 0.05],
  };
  // flatShading everywhere: one stylized-miniature look board-wide (matches
  // the ground decor) that turns low-poly faceting into the aesthetic.
  const mat = (color: string | number, o: MatOpts = {}): THREE_NS.MeshStandardMaterial => {
    const fam = typeof color === 'number' ? FAM[color] : undefined;
    return new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? fam?.[0] ?? 0.72, metalness: o.metal ?? fam?.[1] ?? 0.08,
      flatShading: true,
      transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
    });
  };
  /** Unlit, self-coloured material — for UI sprites (HP bars, labels, pings)
   *  and the odd flat accent. Ignores scene lighting/tone-mapping entirely. */
  const glow = (color: string | number, opacity = 1): THREE_NS.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
  /** Emissive *lit* material — a self-lit glow that still obeys the scene's
   *  ACES tone mapping + exposure (unlike the unlit `glow`). Use for 3D
   *  light-source PROP geometry: flames, coals, glowing crystals, magic
   *  portals/runes, fire/acid/lava pools. Dark base so only the emission reads;
   *  `intensity` ~0.5–0.8. Mirrors `glow`'s (color, opacity) for easy swaps. */
  const emit = (color: string | number, opacity = 1, intensity = 0.7): THREE_NS.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      color: 0x080808, emissive: color, emissiveIntensity: intensity,
      roughness: 0.6, metalness: 0,
      transparent: opacity < 1, opacity,
    });
  const resolve = (c: string | number | Mat): Mat => (typeof c === 'object' ? c : mat(c));
  const at = <T extends Obj>(m: T, x = 0, y = 0, z = 0): T => { m.position.set(x, y, z); return m; };

  const box = (w: number, h: number, d: number, color: string | number | Mat, x = 0, y = 0, z = 0) =>
    at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), resolve(color)), x, y, z);
  const cyl = (rt: number, rb: number, h: number, color: string | number | Mat, x = 0, y = 0, z = 0, seg = 14) =>
    at(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), resolve(color)), x, y, z);
  const sph = (r: number, color: string | number | Mat, x = 0, y = 0, z = 0, wseg = 14, hseg = 12) =>
    at(new THREE.Mesh(new THREE.SphereGeometry(r, wseg, hseg), resolve(color)), x, y, z);
  const cone = (r: number, h: number, color: string | number | Mat, x = 0, y = 0, z = 0, seg = 10) =>
    at(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), resolve(color)), x, y, z);
  const torus = (r: number, tube: number, color: string | number | Mat, x = 0, y = 0, z = 0, seg = 18) =>
    at(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, seg), resolve(color)), x, y, z);
  /** A flat ground disc/tile (e.g. fire patch, water pool) lying on the XZ plane. */
  const disc = (r: number, color: string | number | Mat, y = 0.02, seg = 24) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, seg), resolve(color));
    m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
  };
  /** A flat ground quad (square tile). */
  const tile = (w: number, d: number, color: string | number | Mat, y = 0.02) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), resolve(color));
    m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
  };
  const group = (...objs: (Obj | null | undefined)[]): THREE_NS.Group => {
    const g = new THREE.Group();
    for (const o of objs) if (o) g.add(o);
    return g;
  };
  /** Rotate a mesh in place (radians) and return it, for chaining. */
  const rot = <T extends Obj>(m: T, rx = 0, ry = 0, rz = 0): T => { m.rotation.set(rx, ry, rz); return m; };
  /** Capsule (rounded cylinder) — good for limbs/torsos. */
  const cap = (r: number, len: number, color: string | number | Mat, x = 0, y = 0, z = 0) =>
    at(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), resolve(color)), x, y, z);

  /** A standing humanoid base (~1.1 units tall, base on y=0, facing +Z), built
   *  as one *connected* figure: legs → pelvis → tapered torso (broad shoulders,
   *  narrow waist) → neck → head, with arms hung from the shoulders and small
   *  hands at the wrists. The shared body every creature mini accessorises with
   *  weapons / gear. Weapon convention: held items sit at x ≈ ±0.26, y ≈ 0.5
   *  (the hand). Returns a Group you add more meshes to.
   *  `armSwing` (radians) splays the arms out from the body; `armForward`
   *  pitches them toward +Z (shambling undead, casting). */
  const humanoid = (o: {
    body?: string | number; skin?: string | number; bulk?: number; height?: number;
    hood?: boolean; hoodColor?: string | number; shoulders?: boolean;
    armSwing?: number; armForward?: number;
  } = {}): THREE_NS.Group => {
    const body = o.body ?? C.LEATHER, skin = o.skin ?? 0xd8c2a6, bulk = o.bulk ?? 1;
    const swing = o.armSwing ?? 0.07, fwd = o.armForward ?? 0;
    const g = new THREE.Group();
    // Legs (0 → 0.40) with a pelvis block bridging them to the torso.
    g.add(box(0.11 * bulk, 0.40, 0.13, body, -0.085 * bulk, 0.20, 0));
    g.add(box(0.11 * bulk, 0.40, 0.13, body, 0.085 * bulk, 0.20, 0));
    g.add(cyl(0.15 * bulk, 0.16 * bulk, 0.14, body, 0, 0.45, 0));
    // Torso: tapered cylinder, broad at the shoulders (0.43) → narrow waist.
    g.add(cyl(0.17 * bulk, 0.14 * bulk, 0.40, body, 0, 0.66, 0));
    if (o.shoulders) g.add(box(0.46 * bulk, 0.13, 0.22 * bulk, body, 0, 0.84, 0));
    // Arms hung from the shoulders, inner edge overlapping the chest so there's
    // no gap; a hand sphere at the wrist for held weapons to meet.
    const ax = 0.17 * bulk + 0.05 * bulk;
    const arm = (sx: number, sign: number) => {
      const a = cap(0.052 * bulk, 0.26, body, sx, 0.66, 0.5 * fwd);
      a.rotation.set(fwd, 0, sign * swing); g.add(a);
      g.add(sph(0.055 * bulk, skin, sx + sign * 0.005, 0.49, 0.04 + fwd * 0.9));
    };
    arm(-ax, 1); arm(ax, -1);
    // Neck + head (or hood with a recessed face).
    g.add(cyl(0.055 * bulk, 0.06 * bulk, 0.08, skin, 0, 0.89, 0));
    if (o.hood) {
      g.add(sph(0.115, skin, 0, 0.97, 0.03));
      g.add(cone(0.17, 0.34, o.hoodColor ?? body, 0, 1.0, -0.02));
    } else {
      g.add(sph(0.12, skin, 0, 0.98, 0));
    }
    if (o.height && o.height !== 1) g.scale.setScalar(o.height);
    return g;
  };

  return { THREE, mat, glow, emit, box, cyl, sph, cone, torus, disc, tile, cap, humanoid, group, rot, at };
}

export type ModelKit = ReturnType<typeof makeKit>;

// Shared palette so the library reads consistently. Builders may override with
// the per-token tint passed as the second build() arg.
export const C = {
  STONE: 0x9a948a, DARKSTONE: 0x5d5a54, WOOD: 0x6f4f30, DARKWOOD: 0x4a3220, PLANK: 0x8a6a3e,
  METAL: 0x9aa3ad, IRON: 0x55585e, STEEL: 0xb7bdc4, GOLD: 0xd4af37, SILVER: 0xc8ccd2,
  BONE: 0xe8e2d0, CLOTH: 0x8a6f4a, LEATHER: 0x6e4a2c, RED: 0xb23b3b, BLUE: 0x3b6ea5,
  GREEN: 0x4a7340, LEAF: 0x3f6b3a, DARKLEAF: 0x2f4f2c, BARK: 0x5a4128, DIRT: 0x6b5236,
  WATER: 0x3b6ea5, ICE: 0xbfe3ff, FIRE: 0xff7a2a, EMBER: 0xffcf6b, LAVA: 0xff5a1e,
  ACID: 0x7bd23a, POISON: 0x86d36a, SMOKE: 0x9a9a9a, FOG: 0xcfd6dd, MAGIC: 0xa78bfa,
  ARCANE: 0x6ad0ff, PARCH: 0xcabf94, CLAY: 0xb07a4e, GLASS: 0xaad6e0, RUST: 0x8a5a3a,
} as const;
