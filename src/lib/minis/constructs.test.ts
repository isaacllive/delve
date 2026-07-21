// Construct generator: every construct builds into finite, grounded geometry
// (mm, on y=0) with outline hulls, and the schema rejects unknown ids.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeMiniKit } from './kit.ts';
import { CONSTRUCT_IDS, ConstructRecipeSchema, parseConstructRecipe, buildConstruct } from './constructs.ts';

describe('construct recipe schema', () => {
  it('rejects unknown constructs', () => {
    expect(ConstructRecipeSchema.safeParse({ name: 'X', construct: 'dragon' }).success).toBe(false);
    expect(ConstructRecipeSchema.safeParse({ name: 'X', construct: 'golem' }).success).toBe(true);
  });
});

describe('construct builder', () => {
  const kit = makeMiniKit(THREE);

  it.each(CONSTRUCT_IDS.map(id => [id] as const))('builds %s grounded + upright with hulls', (id) => {
    const { group, heightMm } = buildConstruct(THREE, parseConstructRecipe({ name: id, construct: id }), kit);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    for (const v of [box.min, box.max]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), id).toBe(true);
    }
    expect(Math.abs(box.min.y), `${id} grounded`).toBeLessThan(0.5); // mm, on y=0
    expect(heightMm, `${id} height`).toBeGreaterThan(15);
    expect(heightMm, `${id} height`).toBeLessThan(60);
    // humanoid-form → taller than wide
    expect(box.max.y - box.min.y, `${id} upright`).toBeGreaterThan(box.max.x - box.min.x);
    let hulls = 0;
    group.traverse(o => { if (o.userData.isHull) hulls++; });
    expect(hulls, `${id} outlined`).toBeGreaterThan(5);
  });
});
