import { describe, it, expect } from 'vitest';
import { cellIndex } from './grid.ts';
import { makeRng } from './rng.ts';
import { makeCell, type Level, type TerrainKind } from './terrain.ts';
import {
  FIRE_START,
  GAS_KINDS,
  emitGas,
  fireAt,
  gasAt,
  hazardActive,
  ignite,
  makeHazardField,
  makeHazardFieldForLevel,
  stepHazards,
  type HazardField,
} from './hazards.ts';

/** A uniform level of one terrain kind (no borders — tests control geometry). */
function makeLevel(cols: number, rows: number, kind: TerrainKind = 'grass'): Level {
  const cells = Array.from({ length: cols * rows }, () => makeCell(kind));
  return { cols, rows, cells, entry: { col: 0, row: 0 } };
}

function set(level: Level, col: number, row: number, kind: TerrainKind): void {
  level.cells[cellIndex(col, row, level.cols)] = makeCell(kind);
}

/** Total gas of a kind across the whole field. */
function totalGas(field: HazardField, kind: (typeof GAS_KINDS)[number]): number {
  return field.gas[kind].reduce((a, b) => a + b, 0);
}

/** Run n deterministic steps with a fresh seeded rng. */
function run(field: HazardField, level: Level, n: number, seed = 'test-seed'): void {
  const rng = makeRng(seed);
  for (let i = 0; i < n; i++) stepHazards(field, level, rng);
}

describe('fire', () => {
  it('spreads along a line of grass', () => {
    // A single row of grass; light the left end. Fire should march rightward.
    const level = makeLevel(6, 1, 'grass');
    const field = makeHazardFieldForLevel(level);
    ignite(field, 0, 0);

    expect(fireAt(field, 0, 0)).toBe(FIRE_START);
    run(field, level, 1);
    expect(fireAt(field, 1, 0)).toBe(FIRE_START); // orthogonal spread is guaranteed
    run(field, level, 1);
    expect(fireAt(field, 2, 0)).toBe(FIRE_START);
  });

  it('consumes the grass it burns (grass → floor)', () => {
    const level = makeLevel(3, 1, 'grass');
    const field = makeHazardFieldForLevel(level);
    ignite(field, 0, 0);
    run(field, level, 1);
    // The lit cell is consumed to floor on the tick it burns.
    expect(level.cells[cellIndex(0, 0, level.cols)].kind).toBe('floor');
  });

  it('does not spread onto non-flammable terrain', () => {
    // One grass cell in a sea of floor: it burns, nothing else catches.
    const level = makeLevel(5, 5, 'floor');
    set(level, 2, 2, 'grass');
    const field = makeHazardFieldForLevel(level);
    ignite(field, 2, 2);
    run(field, level, 1);

    let others = 0;
    for (let r = 0; r < level.rows; r++)
      for (let c = 0; c < level.cols; c++) if (!(c === 2 && r === 2) && fireAt(field, c, r) > 0) others++;
    expect(others).toBe(0);
  });

  it('burns out and leaves an inert (all-floor) level', () => {
    const level = makeLevel(8, 1, 'grass');
    const field = makeHazardFieldForLevel(level);
    ignite(field, 0, 0);
    run(field, level, 100);

    expect(hazardActive(field)).toBe(false);
    for (let c = 0; c < level.cols; c++) {
      expect(fireAt(field, c, 0)).toBe(0);
      expect(level.cells[cellIndex(c, 0, level.cols)].kind).toBe('floor'); // all consumed
    }
  });

  it('keeps fire intensity within [0, FIRE_START]', () => {
    const level = makeLevel(6, 6, 'grass');
    const field = makeHazardFieldForLevel(level);
    ignite(field, 3, 3);
    const rng = makeRng('bounds');
    for (let s = 0; s < 40; s++) {
      stepHazards(field, level, rng);
      for (const v of field.fire) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(FIRE_START);
      }
    }
  });
});

describe('gas', () => {
  it('diffuses into neighbours then dissipates to nothing', () => {
    const level = makeLevel(9, 9, 'floor');
    const field = makeHazardFieldForLevel(level);
    emitGas(field, 4, 4, 'caustic', 10);

    run(field, level, 1);
    expect(gasAt(field, 5, 4)!.concentration).toBeGreaterThan(0); // spread to a neighbour
    expect(gasAt(field, 5, 4)!.kind).toBe('caustic');

    run(field, level, 200);
    expect(hazardActive(field)).toBe(false); // fully dissipated
  });

  it('total concentration is non-increasing each tick and trends to zero', () => {
    const level = makeLevel(9, 9, 'floor');
    const field = makeHazardFieldForLevel(level);
    emitGas(field, 4, 4, 'caustic', 20);

    const rng = makeRng('conserve');
    let prev = totalGas(field, 'caustic');
    for (let s = 0; s < 30; s++) {
      stepHazards(field, level, rng);
      const now = totalGas(field, 'caustic');
      expect(now).toBeLessThanOrEqual(prev + 1e-6); // dissipation only removes gas
      prev = now;
    }
    expect(prev).toBe(0);
  });

  it('no cell ever exceeds the emitted concentration (bounded)', () => {
    const level = makeLevel(7, 7, 'floor');
    const field = makeHazardFieldForLevel(level);
    emitGas(field, 3, 3, 'confusion', 5);

    const rng = makeRng('gas-bounds');
    for (let s = 0; s < 25; s++) {
      stepHazards(field, level, rng);
      for (const v of field.gas.confusion) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(5);
      }
    }
  });

  it('does not diffuse through walls', () => {
    // grass | wall | grass — gas on the left cannot reach the right.
    const level = makeLevel(3, 1, 'floor');
    set(level, 1, 0, 'wall');
    const field = makeHazardFieldForLevel(level);
    emitGas(field, 0, 0, 'caustic', 10);

    run(field, level, 5);
    expect(gasAt(field, 2, 0)).toBeNull();
  });

  it('reports the denser kind where two gases overlap', () => {
    const level = makeLevel(3, 3, 'floor');
    const field = makeHazardFieldForLevel(level);
    emitGas(field, 1, 1, 'caustic', 2);
    emitGas(field, 1, 1, 'confusion', 8);
    expect(gasAt(field, 1, 1)!.kind).toBe('confusion');
  });
});

describe('seeding + queries', () => {
  it('ignite clamps intensity and re-stokes to the max', () => {
    const field = makeHazardField(3, 3);
    ignite(field, 1, 1, 99); // clamped to FIRE_START
    expect(fireAt(field, 1, 1)).toBe(FIRE_START);
    ignite(field, 1, 1, 0.1); // weaker source doesn't lower an existing fire
    expect(fireAt(field, 1, 1)).toBe(FIRE_START);
  });

  it('ignore out-of-bounds and non-positive seeds', () => {
    const field = makeHazardField(3, 3);
    ignite(field, -1, 0);
    ignite(field, 3, 3);
    emitGas(field, 0, 0, 'caustic', 0);
    emitGas(field, 10, 10, 'caustic', 5);
    expect(hazardActive(field)).toBe(false);
    expect(fireAt(field, -1, 0)).toBe(0);
    expect(gasAt(field, 0, 0)).toBeNull();
  });
});

describe('determinism', () => {
  it('same seed → identical fire and gas fields', () => {
    const build = () => {
      const level = makeLevel(12, 12, 'grass');
      const field = makeHazardFieldForLevel(level);
      ignite(field, 6, 6);
      emitGas(field, 2, 2, 'caustic', 6);
      emitGas(field, 9, 9, 'confusion', 6);
      return { level, field };
    };

    const a = build();
    const b = build();
    const rngA = makeRng('determinism#7');
    const rngB = makeRng('determinism#7');
    for (let s = 0; s < 20; s++) {
      stepHazards(a.field, a.level, rngA);
      stepHazards(b.field, b.level, rngB);
    }

    expect(Array.from(a.field.fire)).toEqual(Array.from(b.field.fire));
    for (const kind of GAS_KINDS) {
      expect(Array.from(a.field.gas[kind])).toEqual(Array.from(b.field.gas[kind]));
    }
  });
});
