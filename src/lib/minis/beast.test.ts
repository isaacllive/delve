// Quadruped beast generator: every species builds into finite, grounded,
// sanely-proportioned geometry (mm, feet on y=0), and the recipe schema rejects
// unknown ids the same way the humanoid one does.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeMiniKit } from './kit.ts';
import { BEAST_IDS, BeastRecipeSchema, parseBeastRecipe, buildBeast } from './beast.ts';

describe('beast recipe schema', () => {
  it('fills defaults and rejects unknown beasts', () => {
    const r = parseBeastRecipe({ name: 'W', beast: 'wolf' });
    expect(r.stance).toBe('stand');
    expect(BeastRecipeSchema.safeParse({ name: 'X', beast: 'dragon' }).success).toBe(false);
  });
});

describe('beast builder', () => {
  const kit = makeMiniKit(THREE);

  // Reared, winged reptiles (dragons) stand tall on a raised neck; the plain
  // beasts keep a horizontal, ground-hugging silhouette.
  const DRAGONS = new Set(['drake', 'wyvern', 'great_dragon']);

  it.each(BEAST_IDS.map(id => [id] as const))('builds %s grounded with sane bounds', (id) => {
    for (const stance of ['stand', 'prowl'] as const) {
      const { group, heightMm } = buildBeast(THREE, parseBeastRecipe({ name: id, beast: id, stance }), kit);
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      for (const v of [box.min, box.max]) {
        expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), `${id}/${stance}`).toBe(true);
      }
      expect(Math.abs(box.min.y), `${id}/${stance} grounded`).toBeLessThan(0.5); // feet ~on y=0 (mm)
      expect(heightMm, `${id}/${stance} height`).toBeGreaterThan(6);
      expect(heightMm, `${id}/${stance} height`).toBeLessThan(80);
      if (!DRAGONS.has(id)) {
        // plain quadrupeds are longer (Z) than tall — a horizontal silhouette
        const len = box.max.z - box.min.z;
        expect(len, `${id}/${stance} length`).toBeGreaterThan(box.max.y - box.min.y);
      }
    }
  });

  it('adds outline hulls', () => {
    const { group } = buildBeast(THREE, parseBeastRecipe({ name: 'Bear', beast: 'bear' }), kit);
    let hulls = 0;
    group.traverse(o => { if (o.userData.isHull) hulls++; });
    expect(hulls).toBeGreaterThan(10);
  });
});
