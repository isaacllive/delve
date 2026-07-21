// Adapter contract: fromRecipe() must hand Scene3D a figure in the same shape
// every hand-built models3d creature builder used to — a Group in ~1-cell unit
// space, base planted on y=0, no generator plinth left behind — while keeping
// the generator's relative species stature. These invariants are what let a
// recipe-built mini drop into buildTokens() unchanged.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeKit } from './kit.ts';
import { fromRecipe } from './miniRecipe.ts';

const boxOf = (g: THREE.Object3D) => {
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g);
};

describe('fromRecipe adapter', () => {
  it('produces a grounded, unit-scaled, plinth-free figure', () => {
    const kit = makeKit(THREE);
    const g = fromRecipe({ name: 'Human Fighter', class: 'fighter', species: 'human' })(kit, '#fff');
    const box = boxOf(g);
    const height = box.max.y - box.min.y;
    expect(Math.abs(box.min.y)).toBeLessThan(0.02);      // feet on y=0
    expect(height).toBeGreaterThan(0.7);                 // reads at cell scale
    expect(height).toBeLessThan(1.8);                    // nothing runs away
    let bases = 0;
    g.traverse(o => { if (o.userData?.isMiniBase) bases++; });
    expect(bases).toBe(0);                               // plinth stripped
  });

  it('keeps relative species stature (dwarf shorter than human)', () => {
    const kit = makeKit(THREE);
    const human = boxOf(fromRecipe({ name: 'H', class: 'fighter', species: 'human' })(kit, '#fff'));
    const dwarf = boxOf(fromRecipe({ name: 'D', class: 'fighter', species: 'dwarf' })(kit, '#fff'));
    expect(dwarf.max.y).toBeLessThan(human.max.y);
  });

  it('validates the recipe eagerly (bad id throws at fromRecipe time)', () => {
    // @ts-expect-error deliberately invalid class id
    expect(() => fromRecipe({ name: 'X', class: 'chef', species: 'human' })).toThrow();
  });
});
