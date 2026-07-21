import type { Object3D, Mesh, Material } from 'three';

/** Recursively free an object's GPU resources (geometries + materials). One
 *  shared implementation so the scene renderer and the thumbnail renderer can't
 *  drift on disposal behaviour. With `skipShared`, meshes tagged
 *  `userData.shared` are left alone — their geometry/materials are owned and
 *  reused by a cache (e.g. Scene3D's imported-GLB clone cache), so disposing
 *  them would corrupt the next clone. */
export function disposeObject3D(root: Object3D, opts: { skipShared?: boolean } = {}): void {
  root.traverse((o) => {
    if (opts.skipShared && o.userData?.shared) return;
    const m = o as Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = (m as { material?: Material | Material[] }).material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
