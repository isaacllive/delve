// Shared offscreen thumbnail renderer for miniatures — same design as
// models3d/thumbnail.ts (one lazy WebGL context, cached PNG data URLs) so the
// gallery can show a whole roster without spawning a WebGL context per card
// (browsers cap those at ~16). The live turntable is only created for the
// selected mini.
import type * as THREE_NS from 'three';
import { disposeObject3D } from '$lib/threeDispose.ts';
import { makeMiniKit, type MiniKit } from './kit.ts';
import { buildMiniature } from './builder.ts';
import type { MiniRecipe } from './recipe.ts';

const SIZE = 288;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

interface Ctx {
  THREE: typeof THREE_NS;
  renderer: THREE_NS.WebGLRenderer;
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  kit: MiniKit;
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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    // Toon three-point: warm key, cool fill, strong back rim (same recipe as
    // MiniTurntable so thumbnails match the live view).
    scene.add(new THREE.AmbientLight(0xfff4e0, 0.55));
    scene.add(new THREE.HemisphereLight(0xcdd8e8, 0x4a4238, 0.5));
    const key = new THREE.DirectionalLight(0xfff2dc, 1.9); key.position.set(35, 60, 45); scene.add(key);
    const fill = new THREE.DirectionalLight(0xa8c4e8, 0.55); fill.position.set(-50, 25, 10); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1); rim.position.set(-15, 45, -55); scene.add(rim);
    const camera = new THREE.PerspectiveCamera(28, 1, 1, 500);
    return { THREE, renderer, scene, camera, kit: makeMiniKit(THREE) };
  })();
  return ctxPromise;
}

async function render(recipe: MiniRecipe, key: string): Promise<string> {
  const ctx = await getCtx();
  const { THREE, renderer, scene, camera } = ctx;
  let url = '';
  try {
    const built = buildMiniature(THREE, recipe, ctx.kit);
    scene.add(built.group);
    const h = built.heightMm;
    const dist = h * 2.05;
    camera.position.set(dist * 0.42, h * 0.62, dist * 0.9);
    camera.lookAt(0, h * 0.44, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    url = renderer.domElement.toDataURL('image/png');
    scene.remove(built.group);
    // Kit materials + hull geometry are shared across builds — skip them.
    disposeObject3D(built.group, { skipShared: true });
  } catch (e) {
    console.error('[minis] thumbnail build failed', recipe.name, e);
  }
  cache.set(key, url);
  inflight.delete(key);
  return url;
}

/** Synchronous cache peek (instant paint when this recipe already rendered). */
export function cachedMiniThumbnail(recipe: MiniRecipe): string | undefined {
  return cache.get(JSON.stringify(recipe));
}

/** Render (or return cached) a PNG preview of a recipe. Keyed by recipe JSON
 *  so edited recipes re-render. Returns '' on build failure. */
export function miniThumbnail(recipe: MiniRecipe): Promise<string> {
  const key = JSON.stringify(recipe);
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = render(recipe, key);
  inflight.set(key, p);
  return p;
}
