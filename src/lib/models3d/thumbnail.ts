// Shared, lazy model-thumbnail renderer. One offscreen WebGL context turns any
// library model (procedural id) or imported GLB (url) into a cached PNG data
// URL, so a panel can show dozens of small 3D previews without spawning dozens
// of WebGL contexts (browsers cap those at ~16). Results are cached by key and
// in-flight renders are de-duplicated. The renderer is created on first use.
import type * as THREE_NS from 'three';
import { makeKit, MODEL_BY_ID, PREVIEW_MODEL_BY_ID, type ModelKit } from './index.ts';
import { disposeObject3D } from '$lib/threeDispose.ts';

export interface ThumbSpec {
  /** Procedural library model id (prop or mini). */
  id?: string;
  /** Imported GLB url (already resolved, e.g. via imageSrc). */
  gltfUrl?: string;
  /** Tint passed to the procedural builder (defaults to the model's color). */
  color?: string;
}

const SIZE = 160;
// Bounded LRU-ish cache (insertion-order Map; evict oldest past the cap) so a
// long session that previews many id×colour combos can't grow without bound.
const MAX_CACHE = 600;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function cacheSet(key: string, url: string) {
  cache.set(key, url);
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

interface Ctx {
  THREE: typeof THREE_NS;
  renderer: THREE_NS.WebGLRenderer;
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  kit: ModelKit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loader: any | null;
}
let ctxPromise: Promise<Ctx> | null = null;

async function getCtx(): Promise<Ctx> {
  if (ctxPromise) return ctxPromise;
  ctxPromise = (async () => {
    const THREE = await import('three');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    // Preview parity with the live scene: same ACES tone mapping/exposure
    // and the same key-weighted light balance (previews used to render
    // brighter + flatter than the placed model, so picks didn't match).
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(0xbfd0e6, 0x32302a, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(3, 6, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd0ff, 0.35); fill.position.set(-4, 2, -3); scene.add(fill);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    const kit = makeKit(THREE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let loader: any = null;
    try { const m = await import('three/addons/loaders/GLTFLoader.js'); loader = new m.GLTFLoader(); }
    catch { /* GLB previews simply unavailable */ }
    return { THREE, renderer, scene, camera, kit, loader };
  })();
  return ctxPromise;
}


function loadGLB(ctx: Ctx, url: string): Promise<THREE_NS.Object3D | null> {
  if (!ctx.loader) return Promise.resolve(null);
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx.loader.load(url, (gltf: any) => resolve(gltf.scene), undefined, () => resolve(null));
  });
}

async function render(spec: ThumbSpec, key: string): Promise<string> {
  const ctx = await getCtx();
  const { THREE, renderer, scene, camera } = ctx;
  let group: THREE_NS.Object3D | null = null;
  if (spec.id) {
    // Real placeable/token models first; fall back to the preview-only
    // marker/light models (kept out of MODEL_BY_ID on purpose).
    const def = MODEL_BY_ID[spec.id] ?? PREVIEW_MODEL_BY_ID[spec.id];
    if (def) group = def.build(ctx.kit, spec.color || def.color);
  } else if (spec.gltfUrl) {
    group = await loadGLB(ctx, spec.gltfUrl);
  }
  if (!group) {
    // Cache the miss too — a deleted/unknown model shouldn't re-attempt the
    // (possibly network) load every time its preview scrolls into view.
    cacheSet(key, '');
    inflight.delete(key);
    return '';
  }

  scene.add(group);
  const box = new THREE.Box3().setFromObject(group);
  const sz = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(sz.x, sz.y, sz.z, 0.4) * 0.5;
  const dist = (radius / Math.tan((32 * Math.PI / 180) / 2)) * 1.6;
  camera.aspect = 1;
  camera.position.set(center.x + dist * 0.5, center.y + dist * 0.42, center.z + dist * 0.9);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(group);
  disposeObject3D(group);

  cacheSet(key, url);
  inflight.delete(key);
  return url;
}

const keyOf = (s: ThumbSpec) => s.gltfUrl ? `glb:${s.gltfUrl}` : `id:${s.id ?? ''}:${s.color ?? ''}`;

/** Render (or return cached) a PNG data URL preview for a model. Returns '' if
 *  the model can't be built/loaded. Safe to call repeatedly — cached + deduped. */
export function modelThumbnail(spec: ThumbSpec): Promise<string> {
  const key = keyOf(spec);
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = render(spec, key);
  inflight.set(key, p);
  return p;
}

/** Synchronous cache peek (for instant paint when already rendered). */
export function cachedThumbnail(spec: ThumbSpec): string | undefined {
  return cache.get(keyOf(spec));
}
