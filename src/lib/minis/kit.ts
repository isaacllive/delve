// Miniature sculpting kit. Every part builder receives a MiniKit (closing over
// a live THREE namespace, same pattern as models3d/kit.ts) and works in
// MILLIMETRES: a heroic humanoid is ~30–36mm tall, a 25mm base is radius 12.5.
// Base sits on y=0, mini faces +Z.
//
// Style contract (this is where "premium mini line" consistency lives):
// - Toon-stepped lighting (shared 4-step gradient map) + a fresnel rim glow
//   baked into every material → sculpted, studio-lit look.
// - ORGANIC parts (body, cloth, hair, tails, horns) are smooth-shaded and
//   built from generously overlapping capsules/spheres so they read as one
//   blended mass ("blend-shell" style without a real SDF mesher).
// - HARD parts (blades, plates, books, shields) are flat-shaded with real
//   chamfered geometry (bevelBox / low-seg cylinders) so edges stay crisp.
// - Outlines are inverted hulls added once per mini by addOutline().
//
// Builders never import 'three' directly, so recipe/part modules stay safe to
// import on the server (build fns are inert until called in the browser).
import type * as THREE_NS from 'three';

type Mat = THREE_NS.Material;
type Obj = THREE_NS.Object3D;

export interface ToonOpts {
  /** Hard-surface intent marker. MeshToonMaterial has no flatShading, so the
   *  crisp look actually comes from beveled/faceted GEOMETRY (bevelBox,
   *  extruded plates) — this flag just keeps hard parts on separate material
   *  instances so future tweaks (e.g. a specular pass) can target them. */
  flat?: boolean;
  /** Emissive glow colour (magic, flames). */
  emissive?: string | number;
  emissiveIntensity?: number;
  /** Rim strength multiplier (default 1; 0 disables). */
  rim?: number;
  opacity?: number;
}

export function makeMiniKit(THREE: typeof THREE_NS) {
  // --- shared toon gradient: 4 hard steps = classic cel bands. Cached on the
  // kit so every material in every mini shades identically.
  const grad = new THREE.DataTexture(new Uint8Array([90, 150, 215, 255]), 4, 1, THREE.RedFormat);
  grad.minFilter = THREE.NearestFilter;
  grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;

  // Material cache — one material per (color|opts) key so a whole roster of
  // minis shares GPU programs and organic parts sharing a material visually
  // fuse at intersections (no seam shading).
  const matCache = new Map<string, THREE_NS.MeshToonMaterial>();

  /** Toon material with a subtle warm fresnel rim injected into the shader.
   *  The rim is what sells "studio-lit resin mini" at gallery size. */
  const mat = (color: string | number, o: ToonOpts = {}): THREE_NS.MeshToonMaterial => {
    const key = `${typeof color === 'number' ? color.toString(16) : color}|${o.flat ? 1 : 0}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.rim ?? 1}|${o.opacity ?? 1}`;
    const hit = matCache.get(key);
    if (hit) return hit;
    const m = new THREE.MeshToonMaterial({
      color,
      gradientMap: grad,
      transparent: (o.opacity ?? 1) < 1,
      opacity: o.opacity ?? 1,
    });
    if (o.emissive !== undefined) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.emissiveIntensity ?? 0.55;
    }
    const rimStrength = o.rim ?? 1;
    if (rimStrength > 0) {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uRimColor = { value: new THREE.Color(0xfff2dc) };
        shader.uniforms.uRimStrength = { value: 0.32 * rimStrength };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
          .replace(
            '#include <opaque_fragment>',
            // Fresnel rim: brightens grazing angles. Added pre-tonemap so it
            // participates in the toon look instead of blowing out.
            'float rimAmt = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 2.6);\n' +
            'outgoingLight += uRimColor * rimAmt * uRimStrength;\n' +
            '#include <opaque_fragment>'
          );
      };
      // Distinct program per rim variant (cache key already splits materials).
      m.customProgramCacheKey = () => `minirim${rimStrength}`;
    }
    matCache.set(key, m);
    return m;
  };

  /** Unlit self-coloured material for pure glow accents (magic wisps). */
  const glow = (color: string | number, opacity = 1): THREE_NS.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });

  const resolve = (c: string | number | Mat): Mat => (typeof c === 'object' ? c : mat(c));
  const at = <T extends Obj>(m: T, x = 0, y = 0, z = 0): T => { m.position.set(x, y, z); return m; };
  const rot = <T extends Obj>(m: T, rx = 0, ry = 0, rz = 0): T => { m.rotation.set(rx, ry, rz); return m; };

  // --- primitives (organic: generous segment counts + smooth shading) -------
  const sph = (r: number, color: string | number | Mat, x = 0, y = 0, z = 0) =>
    at(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), resolve(color)), x, y, z);
  /** Capsule along local Y. `len` is the cylindrical mid-section length. */
  const cap = (r: number, len: number, color: string | number | Mat, x = 0, y = 0, z = 0) =>
    at(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), resolve(color)), x, y, z);
  const cyl = (rt: number, rb: number, h: number, color: string | number | Mat, x = 0, y = 0, z = 0, seg = 18) =>
    at(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), resolve(color)), x, y, z);
  const cone = (r: number, h: number, color: string | number | Mat, x = 0, y = 0, z = 0, seg = 14) =>
    at(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), resolve(color)), x, y, z);
  const box = (w: number, h: number, d: number, color: string | number | Mat, x = 0, y = 0, z = 0) =>
    at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), resolve(color)), x, y, z);
  const torus = (r: number, tube: number, color: string | number | Mat, x = 0, y = 0, z = 0, seg = 20) =>
    at(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, seg), resolve(color)), x, y, z);

  /** Chamfered block — THE hard-surface primitive. Real bevel geometry (not a
   *  shading trick) so armour plates, blades and books catch a highlight edge
   *  and stay print-chunky. Extruded along Z. */
  const bevelBox = (w: number, h: number, d: number, color: string | number | Mat, x = 0, y = 0, z = 0, bevel?: number) => {
    const b = Math.min(bevel ?? Math.min(w, h, d) * 0.18, w / 2.01, h / 2.01, d / 2.01);
    const shape = new THREE.Shape();
    const hw = w / 2 - b, hh = h / 2 - b;
    shape.moveTo(-hw, -hh); shape.lineTo(hw, -hh); shape.lineTo(hw, hh); shape.lineTo(-hw, hh); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: d - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, steps: 1,
    });
    geo.translate(0, 0, -(d - b * 2) / 2);
    const m = new THREE.Mesh(geo, resolve(typeof color === 'object' ? color : mat(color, { flat: true })));
    return at(m, x, y, z);
  };

  /** Lathe a profile (array of [radius, y] pairs, bottom→top) — robes, skirts,
   *  bell shapes. Smooth-shaded; keeps cloth as a solid volume, never a sheet. */
  const lathe = (profile: [number, number][], color: string | number | Mat, x = 0, y = 0, z = 0, seg = 24) => {
    const pts = profile.map(([r, py]) => new THREE.Vector2(r, py));
    return at(new THREE.Mesh(new THREE.LatheGeometry(pts, seg), resolve(color)), x, y, z);
  };

  /** Tapered organic chain: overlapping spheres along a Catmull-Rom curve with
   *  lerped radius. This is the "curved capsule chain" — tails, horns, braids,
   *  flame licks. Reads as one sculpted mass, prints as one fused mass. */
  const chain = (points: [number, number, number][], r0: number, r1: number, color: string | number | Mat, steps = 12): THREE_NS.Group => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const g = new THREE.Group();
    const m = resolve(color);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = curve.getPoint(t);
      const r = r0 + (r1 - r0) * t;
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(Math.max(r, 0.5), 14, 12), m), p.x, p.y, p.z));
    }
    return g;
  };

  /** Smooth tapered ROUND tube swept along a Catmull-Rom curve, radius lerped
   *  end→end. The smooth counterpart to chain(): one fused, watertight mesh
   *  with a round cross-section and NO sphere-string scalloping — the right
   *  primitive for horns, tails, braids, tusks and antler forks, which read
   *  lumpy as overlapping spheres at these radii. Same (points, r0, r1[, steps])
   *  call shape as chain() so it drops in where the scallop shows. The ring
   *  wraps with no duplicate seam and both ends are fan-capped, so smooth
   *  vertex normals come out seamless and the mass prints solid.
   *
   *  Winding: for a ring ordered CCW about the curve tangent T with frame
   *  (T,N,B), the wall quad (i,j)->(i,j+1)->(i+1,j+1) faces radially OUTWARD
   *  (see the frame cross-product), so front-face culling keeps the outside. */
  const taperTube = (
    points: [number, number, number][], r0: number, r1: number,
    color: string | number | Mat, steps = 24, radial = 12,
  ): THREE_NS.Mesh => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const frames = curve.computeFrenetFrames(steps, false);
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const P = curve.getPointAt(u);
      const N = frames.normals[i], B = frames.binormals[i];
      const r = Math.max(r0 + (r1 - r0) * u, 0.5); // print floor, same as chain()
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const cx = Math.cos(a), cy = Math.sin(a);
        pos.push(
          P.x + r * (cx * N.x + cy * B.x),
          P.y + r * (cx * N.y + cy * B.y),
          P.z + r * (cx * N.z + cy * B.z),
        );
      }
    }
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j, b = i * radial + ((j + 1) % radial);
        const c = (i + 1) * radial + ((j + 1) % radial), d = (i + 1) * radial + j;
        idx.push(a, b, c, a, c, d);
      }
    }
    // Fan-cap both ends (start faces -T, end faces +T) so the tube is closed.
    const p0 = curve.getPointAt(0), pS = curve.getPointAt(1);
    const c0 = pos.length / 3; pos.push(p0.x, p0.y, p0.z);
    const cS = pos.length / 3; pos.push(pS.x, pS.y, pS.z);
    const last = steps * radial;
    for (let j = 0; j < radial; j++) {
      idx.push(c0, (j + 1) % radial, j);
      idx.push(cS, last + j, last + ((j + 1) % radial));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, resolve(color));
  };

  /** Thickened ribbon along a curve (belts, straps, energy swirls). Uses a
   *  TubeGeometry squashed on one axis — never a zero-thickness sheet. */
  const ribbon = (points: [number, number, number][], radius: number, color: string | number | Mat, flatten = 0.45, seg = 32): THREE_NS.Mesh => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const geo = new THREE.TubeGeometry(curve, seg, radius, 10, false);
    const m = new THREE.Mesh(geo, resolve(color));
    m.scale.z = Math.max(flatten, 0.3); // keep ≥ ~1mm of wall at typical radii
    return m;
  };

  /** Watertight THICK shell from a parametric mid-surface `Pf(i,j)` sampled on
   *  a (U+1)×(V+1) grid: offsets a second layer ±t along the surface normal and
   *  stitches the open rim, so an OPEN cloth surface prints solid and never
   *  reads as a sheet. `outwardAt(p)` gives the reference "away from the body"
   *  direction that fixes the normal sign. Rendered double-sided so an open
   *  shell shows its lining. The shared spine of drape() (capes) and
   *  hoodShell() (hoods) — both are open draped cloth, only the surface differs. */
  const thickShell = (
    Pf: (i: number, j: number) => THREE_NS.Vector3, U: number, V: number, t2: number,
    outwardAt: (p: THREE_NS.Vector3) => THREE_NS.Vector3, color: string | number | Mat,
  ): THREE_NS.Mesh => {
    const cols = U + 1, idx2 = (i: number, j: number) => i * cols + j;
    const mid: THREE_NS.Vector3[] = [];
    for (let i = 0; i <= V; i++) for (let j = 0; j <= U; j++) mid.push(Pf(i, j));
    const nrm = mid.map(() => new THREE.Vector3());
    for (let i = 0; i <= V; i++) {
      for (let j = 0; j <= U; j++) {
        const du = Pf(i, Math.min(j + 1, U)).sub(Pf(i, Math.max(j - 1, 0)));
        const dv = Pf(Math.min(i + 1, V), j).sub(Pf(Math.max(i - 1, 0), j));
        const n = new THREE.Vector3().crossVectors(du, dv).normalize();
        if (n.dot(outwardAt(mid[idx2(i, j)])) < 0) n.multiplyScalar(-1);
        nrm[idx2(i, j)].copy(n);
      }
    }
    const pos: number[] = [];
    for (const [k, p] of mid.entries()) { const q = p.clone().addScaledVector(nrm[k], t2); pos.push(q.x, q.y, q.z); }
    for (const [k, p] of mid.entries()) { const q = p.clone().addScaledVector(nrm[k], -t2); pos.push(q.x, q.y, q.z); }
    const inner = mid.length;
    const tris: number[] = [];
    for (let i = 0; i < V; i++) {
      for (let j = 0; j < U; j++) {
        const a = idx2(i, j), b = idx2(i, j + 1), c = idx2(i + 1, j + 1), d = idx2(i + 1, j);
        tris.push(a, b, c, a, c, d);                                     // outer (+normal)
        tris.push(inner + a, inner + c, inner + b, inner + a, inner + d, inner + c); // inner (reversed)
      }
    }
    const rim = (a: number, b: number) => tris.push(a, b, inner + b, a, inner + b, inner + a);
    for (let j = 0; j < U; j++) { rim(idx2(0, j + 1), idx2(0, j)); rim(idx2(V, j), idx2(V, j + 1)); }
    for (let i = 0; i < V; i++) { rim(idx2(i, 0), idx2(i + 1, 0)); rim(idx2(i + 1, U), idx2(i, U)); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(tris);
    geo.computeVertexNormals();
    const m = (resolve(color) as THREE_NS.MeshToonMaterial).clone();
    m.side = THREE.DoubleSide;
    return new THREE.Mesh(geo, m);
  };

  /** Draped cloth shell — an OPEN, curved, thick-walled panel that hangs off
   *  the shoulders/back: the right primitive for capes, cloaks and shoulder
   *  mantles. A lathe() can't express a cape (it's a CLOSED solid of
   *  revolution — a bell that wraps the whole body); a cape only wraps the back
   *  ~150°, is concave toward the body, and shows a lining when it flares.
   *
   *  Swept around an axis set just in front of the attach point so the top hem
   *  hugs the back and the cloth billows out below. Optional fold ridges + hem
   *  flare/curl sell the cloth. Local frame: hangs from yTop downward, concave
   *  toward +Z (the body), θ=0 on the spine (−Z) — drop it on the `back` socket. */
  const drape = (o: {
    color: string | number | Mat;
    length: number;
    radii: [number, number, number]; // distance from the sweep axis at top/mid/hem
    wrap?: number;                    // total angular span around the back (rad)
    yTop?: number;
    standoff?: number;                // gap from the back surface at the top
    thickness?: number;
    folds?: number;
    foldDepth?: number;               // ridge amplitude (mm), deepens toward the hem
    flare?: number;                   // extra hem push outward (mm)
    curl?: number;                    // hem tuck back toward the body (mm)
    uSeg?: number; vSeg?: number;
  }): THREE_NS.Mesh => {
    const wrap = o.wrap ?? 2.7, yTop = o.yTop ?? 0;
    const folds = o.folds ?? 5, foldDepth = o.foldDepth ?? 0;
    const flare = o.flare ?? 0, curl = o.curl ?? 0;
    const U = o.uSeg ?? 28, V = o.vSeg ?? 20;
    const [r0, r1, r2] = o.radii;
    const cz = r0 + (o.standoff ?? 0.4); // sweep axis sits in front so the top hugs the back
    const bez = (t: number) => (1 - t) * (1 - t) * r0 + 2 * (1 - t) * t * r1 + t * t * r2;
    const P = (i: number, j: number) => {
      const v = i / V, u = j / U, th = -wrap / 2 + wrap * u;
      let r = bez(v) + flare * v * v;
      const edge = Math.sin(Math.PI * u); // 0 at the side hems → clean edges
      r += foldDepth * v * edge * Math.cos(folds * th);
      return new THREE.Vector3(r * Math.sin(th), yTop - o.length * v, cz - r * Math.cos(th) + curl * v * v * v);
    };
    return thickShell(P, U, V, (o.thickness ?? 0.9) / 2, (p) => new THREE.Vector3(p.x, 0, p.z - cz), o.color);
  };

  /** HOOD cowl — a thick cloth dome over the head with a carved FACE OPENING,
   *  a soft back peak and fold ridges. The right primitive for a raised hood,
   *  which a bare sphere never sells. Built as a CLOSED spherical dome (full
   *  azimuth, so the CROWN stays solid — no notch/seam over the top) with the
   *  face hole cut only in the FRONT (+Z) BELOW the brow: `browFrac` down the
   *  dome the opening starts and widens to ±`faceHalf` at the neck, so the
   *  opening is a proper downward-widening arch, not a slot to the crown.
   *  Double-walled (radial offset) + double-sided; centre it on the head. */
  const hoodShell = (o: {
    color: string | number | Mat;
    r: number;                       // dome radius (~1.18× head radius)
    faceHalf?: number;               // azimuth half-width of the face opening at the neck (rad)
    browFrac?: number;               // how far down the dome (0..1) the opening begins
    aTop?: number; aBot?: number;    // polar span: crown → neckline (past the equator)
    peak?: number;                   // back-point elongation (mm)
    thickness?: number;
    folds?: number; foldDepth?: number;
    uSeg?: number; vSeg?: number;
  }): THREE_NS.Mesh => {
    const R = o.r, faceHalf = o.faceHalf ?? 1.1, browFrac = o.browFrac ?? 0.34;
    const aTop = o.aTop ?? 0.04, aBot = o.aBot ?? 2.2, peak = o.peak ?? 0, t2 = (o.thickness ?? 1.0) / 2;
    const folds = o.folds ?? 6, foldDepth = o.foldDepth ?? 0;
    const U = o.uSeg ?? 48, V = o.vSeg ?? 24; // fine enough that the carved rim reads smooth
    const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const openHalf = (v: number) => {
      if (v <= browFrac) return 0;
      const t = (v - browFrac) / (1 - browFrac);
      return faceHalf * (t * t * (3 - 2 * t)); // smoothstep widening
    };

    // Mid-surface: full azimuth ring (φ=0 is the FACE/front, +Z), polar aTop→aBot.
    // The two grid columns that border the face hole are SNAPPED onto the exact
    // opening curve (φ = ±openHalf) per row, so the carved rim reads as a smooth
    // arch instead of a staircase of cell edges.
    const jc = U / 2; // column at the front (φ=0)
    const phiAt = (i: number, j: number) => {
      const oh = openHalf(i / V);
      const base = -Math.PI + (2 * Math.PI) * (j / U);
      if (oh <= 0) return base;
      const delta = (oh / (2 * Math.PI)) * U;
      if (j === Math.floor(jc - delta)) return -oh;
      if (j === Math.ceil(jc + delta)) return oh;
      return base;
    };
    const mid: THREE_NS.Vector3[] = [];
    for (let i = 0; i <= V; i++) {
      const v = i / V, a = aTop + (aBot - aTop) * v, ringY = R * Math.cos(a);
      for (let j = 0; j < U; j++) {
        const phi = phiAt(i, j);
        const rr = R + foldDepth * v * Math.cos(folds * phi);
        const bk = Math.max(0, -Math.cos(phi)); // 1 at the back (φ=±π)
        const pk = peak * bk * Math.max(0, 1 - v * 1.3);
        const ring = rr * Math.sin(a);
        mid.push(new THREE.Vector3(ring * Math.sin(phi), ringY + pk, ring * Math.cos(phi) - pk * 0.4));
      }
    }
    const g = (i: number, j: number) => i * U + (j % U);
    const kept = (i: number, j: number) => { // quad below the brow AND across the front → hole
      const oh = openHalf((i + 0.5) / V);
      if (oh <= 0) return true;
      return Math.abs(wrapPi(-Math.PI + (2 * Math.PI) * ((j + 0.5) / U))) >= oh;
    };
    const nrm = mid.map((p) => p.clone().normalize()); // radial offset direction
    const pos: number[] = [];
    for (const [k, p] of mid.entries()) { const q = p.clone().addScaledVector(nrm[k], t2); pos.push(q.x, q.y, q.z); }
    for (const [k, p] of mid.entries()) { const q = p.clone().addScaledVector(nrm[k], -t2); pos.push(q.x, q.y, q.z); }
    const inner = mid.length;
    const tris: number[] = [];
    for (let i = 0; i < V; i++) {
      for (let j = 0; j < U; j++) {
        if (!kept(i, j)) continue;
        const a = g(i, j), b = g(i, j + 1), c = g(i + 1, j + 1), d = g(i + 1, j);
        tris.push(a, b, c, a, c, d);                                     // outer
        tris.push(inner + a, inner + c, inner + b, inner + a, inner + d, inner + c); // inner
        // Stitch a thick rim wherever this face borders the hole or a boundary.
        const rim = (o1: number, o2: number) => tris.push(o1, o2, inner + o2, o1, inner + o2, inner + o1);
        if (i === 0 || !kept(i - 1, j)) rim(a, b);
        if (i === V - 1 || !kept(i + 1, j)) rim(c, d);
        if (!kept(i, j - 1)) rim(d, a);
        if (!kept(i, j + 1)) rim(b, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(tris);
    geo.computeVertexNormals();
    const m = (resolve(o.color) as THREE_NS.MeshToonMaterial).clone();
    m.side = THREE.DoubleSide;
    return new THREE.Mesh(geo, m);
  };

  const group = (...objs: (Obj | null | undefined | false)[]): THREE_NS.Group => {
    const g = new THREE.Group();
    for (const o of objs) if (o) g.add(o);
    return g;
  };

  /** Mark an object (and its subtree) as excluded from the outline pass —
   *  glows, magic wisps and other airy accents look wrong with hulls. */
  const noOutline = <T extends Obj>(o: T): T => { o.userData.noOutline = true; return o; };

  // Shared outline material: inverted hull pushed along vertex normals in
  // object space. One material for every hull in every mini.
  let hullMat: THREE_NS.MeshBasicMaterial | null = null;
  const getHullMat = () => {
    if (hullMat) return hullMat;
    hullMat = new THREE.MeshBasicMaterial({ color: 0x1d1712, side: THREE.BackSide });
    hullMat.onBeforeCompile = (shader) => {
      shader.uniforms.uOutline = { value: 0.28 }; // mm — bold enough for 32mm scale
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uOutline;')
        .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uOutline;');
    };
    hullMat.customProgramCacheKey = () => 'minihull';
    return hullMat;
  };

  /** Add inverted-hull outlines to every mesh under `root` (sharing geometry,
   *  so it's cheap). Call ONCE, after the mini is fully assembled + posed.
   *  Skips subtrees flagged with noOutline(). */
  const addOutline = (root: Obj): void => {
    const flagged = (o: Obj): boolean => {
      for (let p: Obj | null = o; p && p !== root.parent; p = p.parent)
        if (p.userData?.noOutline) return true;
      return false;
    };
    const hulls: { parent: Obj; hull: THREE_NS.Mesh }[] = [];
    root.traverse((o) => {
      const mesh = o as THREE_NS.Mesh;
      if (!mesh.isMesh || mesh.userData.isHull || flagged(o)) return;
      const hull = new THREE.Mesh(mesh.geometry, getHullMat());
      hull.userData.isHull = true;
      hull.userData.shared = true; // geometry is shared — disposal must skip it
      hulls.push({ parent: mesh, hull });
    });
    // Add after traversal so we don't mutate the tree mid-walk.
    for (const { parent, hull } of hulls) parent.add(hull);
  };

  return {
    THREE, mat, glow, sph, cap, cyl, cone, box, torus, bevelBox, lathe, chain,
    taperTube, ribbon, drape, hoodShell, group, at, rot, noOutline, addOutline,
  };
}

export type MiniKit = ReturnType<typeof makeMiniKit>;
