// Every creature mini must actually BUILD — recipe-backed or hand-built — into
// finite, sanely-sized geometry in unit space with its feet on y=0. This is the
// integration guard for the generator migration: a bad gear/pose id throws at
// module load (fromRecipe parses eagerly), and a broken build shows up here as
// NaN bounds or a runaway silhouette rather than a blank token on the map.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeKit } from './kit.ts';
import { MINI_MODELS } from './index.ts';

describe('every creature mini builds', () => {
  const kit = makeKit(THREE);

  it.each(MINI_MODELS.map(m => [m.id, m] as const))('%s builds with sane unit bounds', (_id, m) => {
    const g = m.build(kit, m.color);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    for (const v of [box.min, box.max]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), m.id).toBe(true);
    }
    const height = box.max.y - box.min.y;
    // Low sprawlers (swarms, centipede) are legitimately flat; tall poses reach
    // high — just fence out degenerate (~0) and runaway (>4 unit) silhouettes.
    expect(height, m.id).toBeGreaterThan(0.1);
    expect(height, m.id).toBeLessThan(4);
    // Grounded near y=0 — nothing floats away or sinks through the floor. Ooze
    // masses melt a hair below the plane, so allow a small negative.
    expect(box.min.y, m.id).toBeGreaterThan(-0.35);
    expect(box.min.y, m.id).toBeLessThan(0.3);
  });
});
