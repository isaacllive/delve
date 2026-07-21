// Sculpting-kit primitive tests. The kit is the generator's foundation, so a
// primitive that emits degenerate geometry (NaN verts, no faces, an inside-out
// tube) corrupts every mini that composes it. These build with real THREE in
// node (no renderer) and assert the mesh is well-formed: finite bounds, real
// faces, and — for taperTube — outward-consistent normals + the print-floor
// radius clamp that keeps thin tapers printable.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeMiniKit } from './kit.ts';

const kit = makeMiniKit(THREE);

/** A geometry is "solid" if it has indexed faces, finite positions and normals,
 *  and non-zero volume bounds. */
function expectSolid(mesh: THREE.Mesh) {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const pos = geo.getAttribute('position');
  expect(pos.count).toBeGreaterThan(0);
  expect(geo.getIndex()!.count).toBeGreaterThan(0);
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  for (const v of [b.min, b.max]) {
    expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
  }
  const nrm = geo.getAttribute('normal');
  expect(nrm).toBeTruthy();
  for (let i = 0; i < nrm.count * 3; i++) expect(Number.isFinite(nrm.array[i])).toBe(true);
}

describe('taperTube', () => {
  it('builds a solid, well-formed tube from a curve', () => {
    const t = kit.taperTube([[0, 0, 0], [1, 4, 0.5], [0.5, 8, -0.5]], 1.2, 0.4, 0x808080, 20);
    expect(t.isMesh).toBe(true);
    expectSolid(t);
  });

  it('wraps its cross-section with no duplicate seam vertices', () => {
    const radial = 12, steps = 8;
    const t = kit.taperTube([[0, 0, 0], [0, 6, 0]], 1, 1, 0x808080, steps, radial);
    const pos = (t.geometry as THREE.BufferGeometry).getAttribute('position');
    // (steps+1) rings × radial verts + 2 cap centres — a duplicated seam would
    // add one extra vert per ring, so this pins the seamless ring construction.
    expect(pos.count).toBe((steps + 1) * radial + 2);
  });

  it('honours the 0.5mm print floor even when radii taper to zero', () => {
    const t = kit.taperTube([[0, 0, 0], [0, 10, 0]], 0.2, 0, 0x808080, 12, 8);
    (t.geometry as THREE.BufferGeometry).computeBoundingBox();
    const b = (t.geometry as THREE.BufferGeometry).boundingBox!;
    // Thinnest cross-section is clamped to r=0.5, so the tube spans ≥ ~1mm wide.
    expect(b.max.x - b.min.x).toBeGreaterThanOrEqual(0.9);
  });

  it('produces predominantly outward-facing normals', () => {
    // A straight vertical tube: every wall normal should point away from the
    // Y axis (radially out), i.e. have a non-trivial XZ component and small Y.
    const t = kit.taperTube([[0, 0, 0], [0, 10, 0]], 2, 2, 0x808080, 10, 12);
    const geo = t.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal');
    let outward = 0, total = 0;
    for (let i = 0; i < pos.count - 2; i++) { // skip the 2 cap centres
      const px = pos.getX(i), pz = pos.getZ(i);
      const nx = nrm.getX(i), nz = nrm.getZ(i);
      const rad = Math.hypot(px, pz);
      if (rad < 0.01) continue;
      total++;
      if ((px * nx + pz * nz) / rad > 0.3) outward++; // normal agrees with radius
    }
    expect(outward / total).toBeGreaterThan(0.9);
  });
});

describe('drape', () => {
  it('builds a solid, thick cape shell', () => {
    const c = kit.drape({ color: 0x445566, length: 20, radii: [4, 6, 7], wrap: 2.7, folds: 5, foldDepth: 1 });
    expect(c.isMesh).toBe(true);
    expectSolid(c);
    (c.material as THREE.Material & { side: number }); // has a material
    expect((c.material as THREE.MeshToonMaterial).side).toBe(THREE.DoubleSide);
  });

  it('is an OPEN shell — it wraps the back, not the whole body', () => {
    // A cape spanning wrap<2π must leave the front open: no geometry should sit
    // in front of the sweep axis (the body side), unlike a closed lathe bell.
    const c = kit.drape({ color: 0x445566, length: 18, radii: [4, 5, 6], wrap: 2.6, standoff: 0.4 });
    const pos = (c.geometry as THREE.BufferGeometry).getAttribute('position');
    const cz = 4 + 0.4; // r0 + standoff (sweep axis)
    let front = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > cz) front++;
    expect(front).toBe(0); // nothing wraps around to the front
  });

  it('hangs downward from the top edge', () => {
    const c = kit.drape({ color: 0x445566, length: 22, radii: [4, 5, 6], yTop: 1.5 });
    (c.geometry as THREE.BufferGeometry).computeBoundingBox();
    const b = (c.geometry as THREE.BufferGeometry).boundingBox!;
    expect(b.max.y).toBeLessThanOrEqual(1.5 + 0.6);   // top near yTop
    expect(b.min.y).toBeLessThan(-18);                // falls the full length
  });
});

describe('hoodShell', () => {
  it('builds a solid, double-sided hood dome', () => {
    const h = kit.hoodShell({ color: 0x333333, r: 4, faceHalf: 1.1, peak: 2, folds: 6, foldDepth: 0.5 });
    expect(h.isMesh).toBe(true);
    expectSolid(h);
    expect((h.material as THREE.MeshToonMaterial).side).toBe(THREE.DoubleSide);
  });

  it('carves a face opening low on the front (+Z), not over the crown', () => {
    // At the crown (y near +r) the dome is CLOSED all around; the opening only
    // appears lower down the front. Only vertices actually referenced by a face
    // count as "fabric" — the hole's verts stay in the buffer but unused.
    const r = 5;
    const h = kit.hoodShell({ color: 0x333333, r, faceHalf: 1.1, browFrac: 0.35, aBot: 2.2 });
    const geo = h.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position'), index = geo.getIndex()!;
    const used = new Set<number>();
    for (let i = 0; i < index.count; i++) used.add(index.getX(i));

    let crownFront = false, lowFrontCentre = 0;
    for (const i of used) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (z > r * 0.5 && Math.abs(x) < r * 0.4 && y > r * 0.6) crownFront = true; // front-top covered
      if (z > r * 0.5 && Math.abs(x) < r * 0.25 && y < -r * 0.3) lowFrontCentre++; // face gap
    }
    expect(crownFront).toBe(true);   // crown closed over the top
    expect(lowFrontCentre).toBe(0);  // face open low on the front
  });

  it('covers over the crown (positive Y dome)', () => {
    const h = kit.hoodShell({ color: 0x333333, r: 5 });
    (h.geometry as THREE.BufferGeometry).computeBoundingBox();
    expect((h.geometry as THREE.BufferGeometry).boundingBox!.max.y).toBeGreaterThan(4); // crown near +r
  });
});
