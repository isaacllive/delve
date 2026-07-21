// Critter generator: every critter builds into finite, grounded geometry (mm,
// on y=0) with outline hulls, and the schema rejects unknown ids.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeMiniKit } from './kit.ts';
import { CRITTER_IDS, CritterRecipeSchema, parseCritterRecipe, buildCritter } from './critters.ts';

describe('critter recipe schema', () => {
  it('rejects unknown critters', () => {
    expect(CritterRecipeSchema.safeParse({ name: 'X', critter: 'wolf' }).success).toBe(false);
    expect(CritterRecipeSchema.safeParse({ name: 'X', critter: 'spider' }).success).toBe(true);
  });
});

describe('critter builder', () => {
  const kit = makeMiniKit(THREE);

  it.each(CRITTER_IDS.map(id => [id] as const))('builds %s grounded with hulls', (id) => {
    const { group, heightMm } = buildCritter(THREE, parseCritterRecipe({ name: id, critter: id }), kit);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    for (const v of [box.min, box.max]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), id).toBe(true);
    }
    expect(Math.abs(box.min.y), `${id} grounded`).toBeLessThan(0.5); // mm, on y=0
    expect(heightMm, `${id} height`).toBeGreaterThan(2);
    expect(heightMm, `${id} height`).toBeLessThan(40);
    let hulls = 0;
    group.traverse(o => { if (o.userData.isHull) hulls++; });
    expect(hulls, `${id} outlined`).toBeGreaterThan(3);
  });
});
