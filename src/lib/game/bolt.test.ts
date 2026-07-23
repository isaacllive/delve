import { describe, it, expect } from 'vitest';
import { cellIndex, type Cell } from './grid.ts';
import { makeRng } from './rng.ts';
import { makeCell, type Level, type TerrainKind } from './terrain.ts';
import {
  BOLT_PROPS,
  DEFAULT_BOLT_RANGE,
  traceBolt,
  type BoltProps,
  type BoltTrace,
} from './bolt.ts';

/** A level of one terrain kind — tests carve their own geometry. */
function makeLevel(cols: number, rows: number, kind: TerrainKind = 'floor'): Level {
  const cells = Array.from({ length: cols * rows }, () => makeCell(kind));
  return { cols, rows, cells, entry: { col: 1, row: 1 } };
}

/** A floor room ringed by wall, the usual enclosed-dungeon case. */
function makeRoom(cols: number, rows: number): Level {
  const level = makeLevel(cols, rows);
  for (let col = 0; col < cols; col++) {
    set(level, col, 0, 'wall');
    set(level, col, rows - 1, 'wall');
  }
  for (let row = 0; row < rows; row++) {
    set(level, 0, row, 'wall');
    set(level, cols - 1, row, 'wall');
  }
  return level;
}

function set(level: Level, col: number, row: number, kind: TerrainKind): void {
  level.cells[cellIndex(col, row, level.cols)] = makeCell(kind);
}

function at(col: number, row: number): Cell {
  return { col, row };
}

/** Compact "col,row col,row …" rendering of a path, for readable assertions. */
function pathOf(trace: BoltTrace<Cell>): string {
  return trace.path.map((c) => `${c.col},${c.row}`).join(' ');
}

/** A bolt shaped for one test, starting from a sane baseline. */
function props(overrides: Partial<BoltProps>): BoltProps {
  return { ...BOLT_PROPS.firebolt, ...overrides };
}

describe('flight along a line', () => {
  it('stops at the wall it runs into and reports it', () => {
    const level = makeRoom(10, 3);
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(5, 1),
      bolt: BOLT_PROPS.firebolt,
    });

    expect(pathOf(trace)).toBe('2,1 3,1 4,1 5,1 6,1 7,1 8,1');
    expect(trace.end).toBe('wall');
    expect(trace.blockedAt).toEqual(at(9, 1));
    // The wall cell is never occupied by the bolt.
    expect(trace.path).not.toContainEqual(at(9, 1));
  });

  it('flies through the aimed-at cell and on to its range', () => {
    const level = makeLevel(40, 3);
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(3, 1),
      bolt: BOLT_PROPS.firebolt,
    });

    expect(trace.path).toHaveLength(DEFAULT_BOLT_RANGE);
    expect(trace.path.at(-1)).toEqual(at(1 + DEFAULT_BOLT_RANGE, 1));
    expect(trace.end).toBe('range');
    expect(trace.blockedAt).toBeUndefined();
  });

  it('walks a true diagonal, one cell per step', () => {
    const level = makeRoom(10, 10);
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(4, 4),
      bolt: props({ range: 4 }),
    });

    expect(pathOf(trace)).toBe('2,2 3,3 4,4 5,5');
    expect(trace.end).toBe('range');
  });

  it('reaches the map edge without leaving it when aimed out of bounds', () => {
    const level = makeLevel(5, 3); // no wall border: the map edge IS the wall
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(100, 1),
      bolt: BOLT_PROPS.firebolt,
    });

    expect(pathOf(trace)).toBe('2,1 3,1 4,1');
    expect(trace.end).toBe('wall');
    expect(trace.blockedAt).toEqual(at(5, 1));
  });

  it('never leaves the caster when aimed at the caster', () => {
    const level = makeRoom(10, 3);
    const trace = traceBolt({
      level,
      from: at(4, 1),
      toward: at(4, 1),
      bolt: BOLT_PROPS.firebolt,
      actors: [at(4, 1)],
    });

    expect(trace.end).toBe('origin');
    expect(trace.path).toEqual([]);
    expect(trace.hits).toEqual([]);
  });
});

describe('actors', () => {
  it('stops on the first actor when the bolt is single-target', () => {
    const level = makeRoom(12, 3);
    const near = at(3, 1);
    const far = at(6, 1);
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(8, 1),
      bolt: BOLT_PROPS.firebolt,
      actors: [near, far],
    });

    expect(trace.end).toBe('actor');
    expect(trace.hits.map((h) => h.actor)).toEqual([near]);
    expect(trace.path.at(-1)).toEqual(near);
  });

  it('skewers every actor on the line when the bolt pierces', () => {
    const level = makeRoom(12, 3);
    const near = at(3, 1);
    const far = at(6, 1);
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(8, 1),
      bolt: BOLT_PROPS.lightning,
      actors: [near, far],
    });

    expect(trace.hits.map((h) => h.actor)).toEqual([near, far]);
    // Each hit points at the path cell where it happened.
    for (const hit of trace.hits) expect(trace.path[hit.step]).toEqual(hit.actor);
    expect(trace.end).toBe('wall');
  });

  it('does not reach an actor standing behind a wall', () => {
    const level = makeRoom(12, 3);
    set(level, 5, 1, 'wall');
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(9, 1),
      bolt: BOLT_PROPS.lightning,
      actors: [at(7, 1)],
    });

    expect(trace.hits).toEqual([]);
    expect(trace.end).toBe('wall');
    expect(trace.blockedAt).toEqual(at(5, 1));
  });

  it('returns the caller’s own actor objects, so effects need no lookup', () => {
    const level = makeRoom(12, 3);
    const goblin = { id: 'goblin-1', col: 4, row: 1 };
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(8, 1),
      bolt: BOLT_PROPS.firebolt,
      actors: [goblin],
    });

    expect(trace.hits[0].actor.id).toBe('goblin-1');
  });
});

describe('blocking terrain', () => {
  it('splashes against a closed gate', () => {
    const level = makeRoom(10, 3);
    set(level, 5, 1, 'gate');
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(8, 1),
      bolt: BOLT_PROPS.firebolt,
    });

    expect(trace.end).toBe('wall');
    expect(trace.blockedAt).toEqual(at(5, 1));
  });

  it('splashes against a raised ledge', () => {
    const level = makeRoom(10, 3);
    set(level, 5, 1, 'ledge');
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(8, 1),
      bolt: BOLT_PROPS.firebolt,
    });

    expect(trace.blockedAt).toEqual(at(5, 1));
  });

  it('slips through bars and over ledges when the bolt is incorporeal', () => {
    const level = makeRoom(10, 3);
    set(level, 4, 1, 'gate');
    set(level, 5, 1, 'ledge');
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(8, 1),
      bolt: BOLT_PROPS.spectral,
    });

    expect(pathOf(trace)).toBe('2,1 3,1 4,1 5,1 6,1 7,1 8,1');
    expect(trace.end).toBe('wall');
    expect(trace.blockedAt).toEqual(at(9, 1));
  });

  it('is still stopped by rock even when incorporeal', () => {
    const level = makeRoom(10, 3);
    set(level, 5, 1, 'wall');
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(8, 1),
      bolt: BOLT_PROPS.spectral,
    });

    expect(trace.blockedAt).toEqual(at(5, 1));
  });

  it('flies over pits and water, which stop nothing', () => {
    const level = makeRoom(10, 3);
    set(level, 4, 1, 'pit');
    set(level, 5, 1, 'water');
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(8, 1),
      bolt: BOLT_PROPS.firebolt,
    });

    expect(pathOf(trace)).toBe('2,1 3,1 4,1 5,1 6,1 7,1 8,1');
  });
});

describe('reflection', () => {
  it('bounces straight back off a wall it hits head-on', () => {
    const level = makeRoom(10, 3);
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(5, 1),
      bolt: BOLT_PROPS.spark,
    });

    // Out to the east wall, then back the way it came; range is the total.
    expect(pathOf(trace)).toBe('2,1 3,1 4,1 5,1 6,1 7,1 8,1 7,1');
    expect(trace.bounces).toBe(1);
    expect(trace.end).toBe('range');
  });

  it('glances off a flat wall struck at an angle', () => {
    const level = makeRoom(12, 8);
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(2, 2),
      bolt: props({ range: 20, maxBounces: 1 }),
    });

    // Down-right to the floor, then up-right off it.
    expect(pathOf(trace)).toBe('2,2 3,3 4,4 5,5 6,6 7,5 8,4 9,3 10,2');
    expect(trace.bounces).toBe(1);
    expect(trace.end).toBe('reflected-out');
    expect(trace.blockedAt).toEqual(at(11, 1));
  });

  it('retraces its path out of an inside corner', () => {
    const level = makeRoom(8, 8);
    const trace = traceBolt({
      level,
      from: at(3, 3),
      toward: at(4, 4),
      bolt: props({ range: 6, maxBounces: 1 }),
    });

    // (7,7) is the corner: both (7,6) and (6,7) are wall, so it comes back.
    expect(pathOf(trace)).toBe('4,4 5,5 6,6 5,5 4,4 3,3');
    expect(trace.bounces).toBe(1);
    expect(trace.end).toBe('range');
  });

  it('dies at the wall once its bounces are spent', () => {
    const level = makeRoom(10, 3);
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(5, 1),
      bolt: props({ range: 30, maxBounces: 1 }),
    });

    expect(trace.bounces).toBe(1);
    expect(trace.end).toBe('reflected-out');
    expect(trace.blockedAt).toEqual(at(0, 1));
    expect(trace.path).toHaveLength(14); // 7 out, 7 back — well short of range
  });

  it('can come back and hit the caster', () => {
    const level = makeRoom(10, 3);
    const caster = at(1, 1);
    const trace = traceBolt({
      level,
      from: caster,
      toward: at(5, 1),
      bolt: props({ range: 30, maxBounces: 1 }),
      actors: [caster],
    });

    expect(trace.hits.map((h) => h.actor)).toEqual([caster]);
    expect(trace.end).toBe('actor');
    expect(trace.path.at(-1)).toEqual(caster);
  });
});

describe('tunneling', () => {
  it('bores through a slab of rock and reports the cells it opened', () => {
    const level = makeRoom(13, 5);
    for (const row of [1, 2, 3]) {
      set(level, 5, row, 'wall');
      set(level, 6, row, 'wall');
    }
    const trace = traceBolt({
      level,
      from: at(1, 2),
      toward: at(4, 2),
      bolt: props({ range: 12, tunnelDepth: 4, stopsAtActor: false }),
    });

    expect(pathOf(trace)).toBe('2,2 3,2 4,2 5,2 6,2 7,2 8,2 9,2 10,2 11,2');
    expect(trace.tunneled).toEqual([at(5, 2), at(6, 2)]);
    expect(trace.end).toBe('wall');
    // Two charges of depth left over, yet the level's border ring stays sealed.
    expect(trace.blockedAt).toEqual(at(12, 2));
    // Purity: the level is untouched — digging is the caller's job.
    expect(level.cells[cellIndex(5, 2, level.cols)].kind).toBe('wall');
  });

  it('is spent partway through rock thicker than its depth', () => {
    const level = makeRoom(13, 5);
    for (const row of [1, 2, 3]) {
      set(level, 5, row, 'wall');
      set(level, 6, row, 'wall');
    }
    const trace = traceBolt({
      level,
      from: at(1, 2),
      toward: at(4, 2),
      bolt: props({ range: 12, tunnelDepth: 1, stopsAtActor: false }),
    });

    expect(pathOf(trace)).toBe('2,2 3,2 4,2 5,2');
    expect(trace.tunneled).toEqual([at(5, 2)]);
    expect(trace.end).toBe('wall');
    expect(trace.blockedAt).toEqual(at(6, 2));
  });

  it('cannot bore off the edge of the map', () => {
    const level = makeLevel(5, 3);
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(3, 1),
      bolt: props({ range: 12, tunnelDepth: 4, stopsAtActor: false }),
    });

    expect(pathOf(trace)).toBe('2,1 3,1 4,1');
    expect(trace.tunneled).toEqual([]);
    expect(trace.end).toBe('wall');
  });

  it('bores rock but not a portcullis', () => {
    const level = makeRoom(10, 3);
    set(level, 5, 1, 'gate');
    const trace = traceBolt({
      level,
      from: at(1, 1),
      toward: at(8, 1),
      bolt: props({ range: 12, tunnelDepth: 4, stopsAtActor: false }),
    });

    expect(trace.tunneled).toEqual([]);
    expect(trace.blockedAt).toEqual(at(5, 1));
  });
});

describe('determinism', () => {
  /** An open room with a single pillar clipped corner-on: the one genuinely
   *  ambiguous reflection, and therefore the only use of the Rng. */
  function pillarTrace(seed: string | undefined): BoltTrace<Cell> {
    const level = makeRoom(12, 12);
    set(level, 5, 5, 'wall');
    return traceBolt({
      level,
      from: at(1, 1),
      toward: at(2, 2),
      bolt: props({ range: 20, maxBounces: 1 }),
      rng: seed === undefined ? undefined : makeRng(seed),
    });
  }

  it('replays identically for the same seed', () => {
    for (const seed of ['delve-1', 'delve-2', 'delve-3']) {
      expect(pillarTrace(seed)).toEqual(pillarTrace(seed));
    }
  });

  it('actually consults the seeded rng for the ambiguous glance', () => {
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const distinct = new Set(seeds.map((s) => pathOf(pillarTrace(s))));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('is reproducible without an rng at all', () => {
    const trace = pillarTrace(undefined);
    expect(trace).toEqual(pillarTrace(undefined));
    // No coin to flip: it comes straight back down its own path.
    expect(pathOf(trace)).toBe('2,2 3,3 4,4 3,3 2,2 1,1');
    expect(trace.bounces).toBe(1);
  });
});

describe('range clamping', () => {
  it('refuses to fly a negative or absurd range', () => {
    const level = makeLevel(200, 3);
    expect(traceBolt({ level, from: at(1, 1), toward: at(5, 1), bolt: props({ range: -5 }) }).path)
      .toEqual([]);
    const huge = traceBolt({
      level,
      from: at(1, 1),
      toward: at(5, 1),
      bolt: props({ range: 10_000 }),
    });
    expect(huge.path.length).toBeLessThanOrEqual(40);
    expect(huge.end).toBe('range');
  });
});
