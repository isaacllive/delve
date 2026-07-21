// Scene-figure adapter contract: the board figure must NOT carry the
// generator's plinth (the scene map draws its own pedestal ring, so a built-in
// plinth would double up / z-fight with it) and must be grounded on y=0 so it
// stands directly on that pedestal. Mirrors the models3d/miniRecipe.ts contract
// for the live-rig path. Real THREE in node (no renderer), like minis.test.ts.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { sceneMiniFigure, animatableSceneFigure } from './sceneFigure.ts';
import { parseMiniRecipe } from './recipe.ts';

const boxOf = (g: THREE.Object3D) => {
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g);
};
const recipe = parseMiniRecipe({ name: 'F', class: 'fighter', species: 'human', gear: ['sword', 'heater_shield'] });

const countBases = (g: THREE.Object3D) => {
  let n = 0;
  g.traverse(o => { if (o.userData?.isMiniBase) n++; });
  return n;
};

describe('sceneMiniFigure', () => {
  it('drops the generator plinth and grounds the figure on y=0', () => {
    const { group, topCells } = sceneMiniFigure(THREE, recipe);
    const box = boxOf(group);
    expect(countBases(group)).toBe(0);              // plinth stripped
    expect(Math.abs(box.min.y)).toBeLessThan(0.03); // feet on y=0, no plinth gap
    expect(topCells).toBeGreaterThan(0.5);          // reads at cell scale
    expect(topCells).toBeLessThan(1.5);             // nothing runs away
  });

  it('returns independent clones (stripping the template once is enough)', () => {
    const a = sceneMiniFigure(THREE, recipe);
    const b = sceneMiniFigure(THREE, recipe);
    expect(a.group).not.toBe(b.group);
    expect(countBases(a.group)).toBe(0);
    expect(countBases(b.group)).toBe(0);
  });
});

describe('animatableSceneFigure', () => {
  it('is plinth-free, grounded, and exposes a live rig', () => {
    const { group, rig } = animatableSceneFigure(THREE, recipe);
    const box = boxOf(group);
    expect(countBases(group)).toBe(0);
    expect(Math.abs(box.min.y)).toBeLessThan(0.03);
    expect(rig.footL).toBeTruthy();
    expect(rig.footR).toBeTruthy();
  });
});
