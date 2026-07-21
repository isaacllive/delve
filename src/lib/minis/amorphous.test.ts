// Amorphous generator: every formless creature builds into finite, grounded
// geometry (mm, on y=0), and the schema rejects unknown ids. Shapes vary wildly
// (a tall flame vs a squat cube), so we don't assert an aspect ratio.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeMiniKit } from './kit.ts';
import { AMORPHOUS_IDS, AmorphousRecipeSchema, parseAmorphousRecipe, buildAmorphous } from './amorphous.ts';

describe('amorphous recipe schema', () => {
  it('rejects unknown ids and accepts a valid one', () => {
    expect(AmorphousRecipeSchema.safeParse({ name: 'X', amorphous: 'dragon' }).success).toBe(false);
    expect(AmorphousRecipeSchema.safeParse({ name: 'X', amorphous: 'ghost' }).success).toBe(true);
  });
});

describe('amorphous builder', () => {
  const kit = makeMiniKit(THREE);

  it.each(AMORPHOUS_IDS.map(id => [id] as const))('builds %s grounded with finite bounds', (id) => {
    const { group, heightMm } = buildAmorphous(THREE, parseAmorphousRecipe({ name: id, amorphous: id }), kit);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    for (const v of [box.min, box.max]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), id).toBe(true);
    }
    expect(Math.abs(box.min.y), `${id} grounded`).toBeLessThan(0.5); // mm, on y=0
    expect(heightMm, `${id} height`).toBeGreaterThan(8);
    expect(heightMm, `${id} height`).toBeLessThan(60);
  });
});
