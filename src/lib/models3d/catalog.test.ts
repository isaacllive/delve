import { describe, it, expect } from 'vitest';
import { MODEL_LIBRARY, MODEL_BY_ID, PROP_MODELS, MINI_MODELS, pickMiniId } from './index.ts';

// Catalog integrity — the library is aggregated from 13 category files
// and de-duped by id; Scene3D, the Models panel, and thumbnails all
// assume these invariants.
describe('model catalog', () => {
  it('is large and id-unique', () => {
    expect(MODEL_LIBRARY.length).toBeGreaterThan(200);
    expect(new Set(MODEL_LIBRARY.map(m => m.id)).size).toBe(MODEL_LIBRARY.length);
    expect(Object.keys(MODEL_BY_ID).length).toBe(MODEL_LIBRARY.length);
  });

  it('every def carries the fields renderers rely on', () => {
    for (const m of MODEL_LIBRARY) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.icon).toBeTruthy();
      expect(typeof m.build).toBe('function');
      expect(typeof m.color).toBe('string');
      if (m.size !== undefined) {
        expect(m.size).toBeGreaterThanOrEqual(1);
        expect(m.size).toBeLessThanOrEqual(4);
      }
    }
  });

  it('splits cleanly into props vs creature minis', () => {
    expect(PROP_MODELS.length + MINI_MODELS.length).toBe(MODEL_LIBRARY.length);
    expect(MINI_MODELS.length).toBeGreaterThan(50);
    expect(MINI_MODELS.every(m => m.creature)).toBe(true);
    expect(PROP_MODELS.every(m => !m.creature)).toBe(true);
  });

  it('pickMiniId is safe on junk and returns known ids on hits', () => {
    expect(pickMiniId(null)).toBeNull();
    expect(pickMiniId('')).toBeNull();
    expect(pickMiniId('zzz-nothing-matches-this')).toBeNull();
    const hit = pickMiniId('goblin');
    if (hit !== null) expect(MODEL_BY_ID[hit]).toBeDefined();
  });
});
