import { describe, it, expect } from 'vitest';
import { TICKS_PER_TURN } from './energy.ts';
import {
  BOG_MOVE_MUL,
  DEEP_WATER_MOVE_MUL,
  LAVA_CONTACT_DAMAGE,
  LICHEN_CONTACT_POISON,
  TERRAIN_KINDS,
  TERRAIN_PROPS,
  WALL_HEIGHT,
  WEB_ENTANGLE_TURNS,
  blocksMove,
  burntKind,
  fillsColumn,
  hazardAt,
  isConcealedKind,
  isFlammableKind,
  isIgnitionSource,
  makeCell,
  moveCostTicks,
  occluderHeight,
  propsAt,
  revealCell,
  sweepsPack,
  terrainProps,
  type Level,
  type TerrainKind,
  type TerrainProps,
} from './terrain.ts';

const ALL_KINDS = TERRAIN_KINDS;

/** A 1-row level of the given kinds, for querying a single cell by column. */
function levelOf(kinds: TerrainKind[]): Level {
  return {
    cols: kinds.length,
    rows: 1,
    cells: kinds.map(makeCell),
    entry: { col: 0, row: 0 },
  };
}

describe('terrain kind registry', () => {
  // The point of the table: a new kind (deep water, lava, chasm, bog, web…)
  // cannot be added without answering every rule, so no derived query can
  // silently fall through to a default.
  it('gives every terrain kind a complete row', () => {
    for (const kind of ALL_KINDS) {
      const p = TERRAIN_PROPS[kind];
      expect(Number.isFinite(p.elevation), kind).toBe(true);
      expect(typeof p.blocksMove, kind).toBe('boolean');
      expect(['full', 'height', 'none'], kind).toContain(p.occluder);
      expect([null, ...ALL_KINDS], kind).toContain(p.entryHazard);
      expect(['none', 'shallow', 'deep'], kind).toContain(p.submersion);
      expect(p.moveCostMul, kind).toBeGreaterThan(0);
      expect(Number.isFinite(p.contactDamage), kind).toBe(true);
      expect(Number.isFinite(p.contactPoison), kind).toBe(true);
      expect(Number.isFinite(p.entangleTurns), kind).toBe(true);
      expect(typeof p.descends, kind).toBe('boolean');
      expect(typeof p.flammable, kind).toBe('boolean');
      expect(typeof p.ignitionSource, kind).toBe('boolean');
      expect([null, ...ALL_KINDS], kind).toContain(p.burnsInto);
      expect(Number.isFinite(p.spreadChance), kind).toBe(true);
    }
  });

  it('answers every declared property on every kind, with no extras', () => {
    // Structural companion to the check above: whatever fields the interface
    // grows, every row must define exactly those — no kind quietly missing a
    // new rule, and no row carrying a stale one.
    const fields = Object.keys(TERRAIN_PROPS.floor) as (keyof TerrainProps)[];
    expect(fields.length).toBeGreaterThan(0);
    for (const kind of ALL_KINDS) {
      expect(Object.keys(TERRAIN_PROPS[kind]).sort(), kind).toEqual([...fields].sort());
    }
  });

  it('builds cells at their kind default elevation', () => {
    for (const kind of ALL_KINDS) {
      expect(makeCell(kind), kind).toEqual({ kind, elevation: TERRAIN_PROPS[kind].elevation });
    }
  });

  it('derives every query from the table, for every kind', () => {
    const level = levelOf([...ALL_KINDS]);
    ALL_KINDS.forEach((kind, col) => {
      const p = TERRAIN_PROPS[kind];
      expect(blocksMove(level, col, 0), kind).toBe(p.blocksMove);
      expect(hazardAt(level, col, 0), kind).toBe(p.entryHazard);
      expect(isFlammableKind(kind), kind).toBe(p.flammable);
      expect(propsAt(level, col, 0), kind).toBe(p);
      expect(moveCostTicks(level, col, 0), kind).toBe(
        Math.max(1, Math.round(TICKS_PER_TURN * p.moveCostMul)),
      );
    });
  });

  it('flags an entry hazard exactly when entering does something', () => {
    // Guards the one redundancy in the table: `entryHazard` is the tag the move
    // handler branches on, while the fields below it say what happens. A row
    // that grew a consequence without the tag would be silently unresolved.
    for (const kind of ALL_KINDS) {
      const p = TERRAIN_PROPS[kind];
      const consequential =
        p.descends ||
        p.submersion !== 'none' ||
        p.contactDamage > 0 ||
        p.contactPoison > 0 ||
        p.entangleTurns > 0;
      expect(p.entryHazard !== null, `${kind} entryHazard`).toBe(consequential);
      // A cell may only report ITSELF as the hazard, or the branch the server
      // takes would not match the terrain the player is standing on.
      if (p.entryHazard !== null) expect(p.entryHazard).toBe(kind);
    }
  });

  it('only leaves burnt remains where fire can actually catch', () => {
    for (const kind of ALL_KINDS) {
      const p = TERRAIN_PROPS[kind];
      if (!p.flammable) expect(p.burnsInto, kind).toBeNull();
      // Nothing may burn into itself, or fire would consume it forever.
      if (p.burnsInto) expect(p.burnsInto, kind).not.toBe(kind);
      expect(burntKind(kind), kind).toBe(p.burnsInto ?? kind);
    }
  });

  it('never makes a step free (the scheduler would stall)', () => {
    const level = levelOf([...ALL_KINDS]);
    ALL_KINDS.forEach((kind, col) => {
      expect(moveCostTicks(level, col, 0, 1), kind).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('terrain rules that gameplay depends on', () => {
  it('blocks movement through walls, closed vault gates and unfound doors only', () => {
    const blocking = ALL_KINDS.filter((k) => TERRAIN_PROPS[k].blocksMove);
    expect([...blocking].sort()).toEqual(['gate', 'secretDoor', 'wall']);
  });

  it('treats out-of-bounds as solid rock for movement and sight', () => {
    const level = levelOf(['floor']);
    expect(blocksMove(level, -1, 0)).toBe(true);
    expect(blocksMove(level, 0, 5)).toBe(true);
    expect(occluderHeight(level, -1, 0)).toBe(WALL_HEIGHT);
    expect(hazardAt(level, -1, 0)).toBe(null);
    expect(propsAt(level, -1, 0)).toBe(TERRAIN_PROPS.wall);
  });

  it('occludes sight with walls, over ledges, and never with sunken cells', () => {
    const level = levelOf(['wall', 'ledge', 'floor', 'pit', 'water']);
    expect(occluderHeight(level, 0, 0)).toBe(WALL_HEIGHT);
    expect(occluderHeight(level, 1, 0)).toBe(TERRAIN_PROPS.ledge.elevation);
    expect(occluderHeight(level, 2, 0)).toBe(0);
    // Sunken terrain has negative elevation — it must not read as an occluder.
    expect(occluderHeight(level, 3, 0)).toBe(0);
    expect(occluderHeight(level, 4, 0)).toBe(0);
  });

  it('lets you see through a vault gate to the reward behind it', () => {
    // A gate blocks the body but not the eye — that tension is the whole point
    // of the guardian vault, so it is pinned here.
    const level = levelOf(['gate']);
    expect(blocksMove(level, 0, 0)).toBe(true);
    expect(occluderHeight(level, 0, 0)).toBe(0);
    expect(fillsColumn('gate')).toBe(false); // bars, not a rock mass
  });

  it('makes pits and water hazards to enter, not walls to bump into', () => {
    const level = levelOf(['pit', 'water']);
    expect(blocksMove(level, 0, 0)).toBe(false);
    expect(blocksMove(level, 1, 0)).toBe(false);
    expect(hazardAt(level, 0, 0)).toBe('pit');
    expect(hazardAt(level, 1, 0)).toBe('water');
  });

  it('keeps ordinary ground a normal-cost, uneventful step', () => {
    const plain: TerrainKind[] = ['floor', 'grass', 'ledge', 'stairsDown', 'stairsUp'];
    const level = levelOf(plain);
    plain.forEach((kind, col) => {
      expect(moveCostTicks(level, col, 0), kind).toBe(TICKS_PER_TURN);
      expect(hazardAt(level, col, 0), kind).toBeNull();
      expect(blocksMove(level, col, 0), kind).toBe(false);
    });
  });

  it('fills a column with rock for walls and their imitations only', () => {
    const solid = ALL_KINDS.filter(fillsColumn);
    expect([...solid].sort()).toEqual(['secretDoor', 'wall']);
  });
});

// ── deep vs shallow water ────────────────────────────────────────────────────

describe('water depth', () => {
  it('is enterable at both depths', () => {
    const level = levelOf(['water', 'deepWater']);
    expect(blocksMove(level, 0, 0)).toBe(false);
    expect(blocksMove(level, 1, 0)).toBe(false);
  });

  it('sweeps the pack only in deep water', () => {
    const level = levelOf(['water', 'deepWater', 'bog', 'floor']);
    expect(sweepsPack(level, 1, 0)).toBe(true);
    expect(sweepsPack(level, 0, 0)).toBe(false);
    expect(sweepsPack(level, 2, 0)).toBe(false);
    expect(sweepsPack(level, 3, 0)).toBe(false);
  });

  it('slows a swimmer but leaves a wader at full speed', () => {
    const level = levelOf(['water', 'deepWater']);
    expect(moveCostTicks(level, 0, 0)).toBe(TICKS_PER_TURN);
    expect(moveCostTicks(level, 1, 0)).toBe(Math.round(TICKS_PER_TURN * DEEP_WATER_MOVE_MUL));
    expect(moveCostTicks(level, 1, 0)).toBeGreaterThan(moveCostTicks(level, 0, 0));
  });

  it('sits deeper than shallow water and reports its own entry hazard', () => {
    expect(makeCell('deepWater').elevation).toBeLessThan(makeCell('water').elevation);
    expect(hazardAt(levelOf(['deepWater']), 0, 0)).toBe('deepWater');
  });

  it('neither depth burns, and neither drops you a floor', () => {
    for (const kind of ['water', 'deepWater'] as TerrainKind[]) {
      expect(isFlammableKind(kind), kind).toBe(false);
      expect(terrainProps(kind).descends, kind).toBe(false);
    }
  });
});

// ── lava ─────────────────────────────────────────────────────────────────────

describe('lava', () => {
  it('harms whoever enters it', () => {
    const level = levelOf(['lava']);
    expect(propsAt(level, 0, 0).contactDamage).toBe(LAVA_CONTACT_DAMAGE);
    expect(LAVA_CONTACT_DAMAGE).toBeGreaterThan(0);
    expect(hazardAt(level, 0, 0)).toBe('lava');
  });

  it('is walkable-into, not a wall — the mistake has to be possible', () => {
    expect(blocksMove(levelOf(['lava']), 0, 0)).toBe(false);
  });

  it('is an ignition source that is never itself consumed', () => {
    const level = levelOf(['lava', 'grass']);
    expect(isIgnitionSource(level, 0, 0)).toBe(true);
    expect(isIgnitionSource(level, 1, 0)).toBe(false);
    expect(isIgnitionSource(level, 9, 9)).toBe(false); // off-map
    expect(isFlammableKind('lava')).toBe(false); // fuel it is not
    expect(burntKind('lava')).toBe('lava');
  });

  it('is the only ignition source', () => {
    expect(ALL_KINDS.filter((k) => terrainProps(k).ignitionSource)).toEqual(['lava']);
  });
});

// ── the chasm (pit, generalised) ─────────────────────────────────────────────

describe('chasm descent', () => {
  it('drops whoever steps in to the level below', () => {
    const level = levelOf(['pit']);
    expect(propsAt(level, 0, 0).descends).toBe(true);
    expect(blocksMove(level, 0, 0)).toBe(false); // you can walk in — that is the point
    expect(hazardAt(level, 0, 0)).toBe('pit');
  });

  it('is the ONE descending terrain (chasm == pit, not a second kind)', () => {
    expect(ALL_KINDS.filter((k) => terrainProps(k).descends)).toEqual(['pit']);
  });

  it('does not drop anyone through ordinary ground or liquids', () => {
    const kinds: TerrainKind[] = ['floor', 'water', 'deepWater', 'bog', 'lava', 'bridge'];
    const level = levelOf(kinds);
    kinds.forEach((kind, col) => expect(propsAt(level, col, 0).descends, kind).toBe(false));
  });
});

// ── bog ──────────────────────────────────────────────────────────────────────

describe('bog', () => {
  it('costs more time to cross than open ground', () => {
    const level = levelOf(['bog', 'floor']);
    expect(moveCostTicks(level, 0, 0)).toBe(Math.round(TICKS_PER_TURN * BOG_MOVE_MUL));
    expect(moveCostTicks(level, 0, 0)).toBeGreaterThan(moveCostTicks(level, 1, 0));
  });

  it('scales the actor own speed rather than replacing it', () => {
    // A hasted delver in bog still moves faster than a normal one in bog: the
    // multiplier composes with energy.ts, it is not a second speed model.
    const level = levelOf(['bog']);
    const hastedBase = TICKS_PER_TURN / 2;
    expect(moveCostTicks(level, 0, 0, hastedBase)).toBe(Math.round(hastedBase * BOG_MOVE_MUL));
    expect(moveCostTicks(level, 0, 0, hastedBase)).toBeLessThan(moveCostTicks(level, 0, 0));
  });

  it('is passable, harmless and does not burn', () => {
    const level = levelOf(['bog']);
    expect(blocksMove(level, 0, 0)).toBe(false);
    expect(propsAt(level, 0, 0).contactDamage).toBe(0);
    expect(isFlammableKind('bog')).toBe(false);
  });
});

// ── spider webs ──────────────────────────────────────────────────────────────

describe('spider webs', () => {
  it('entangles: leaving costs turns of struggling', () => {
    const level = levelOf(['web']);
    expect(propsAt(level, 0, 0).entangleTurns).toBe(WEB_ENTANGLE_TURNS);
    expect(WEB_ENTANGLE_TURNS).toBeGreaterThan(0);
    expect(hazardAt(level, 0, 0)).toBe('web');
  });

  it('does not block the step itself — you walk in, then you are stuck', () => {
    expect(blocksMove(levelOf(['web']), 0, 0)).toBe(false);
    expect(moveCostTicks(levelOf(['web']), 0, 0)).toBe(TICKS_PER_TURN);
  });

  it('burns away to bare floor', () => {
    expect(isFlammableKind('web')).toBe(true);
    expect(burntKind('web')).toBe('floor');
  });

  it('is the only entangling terrain', () => {
    expect(ALL_KINDS.filter((k) => terrainProps(k).entangleTurns > 0)).toEqual(['web']);
  });
});

// ── creeping lichen ──────────────────────────────────────────────────────────

describe('creeping lichen', () => {
  it('poisons on contact', () => {
    const level = levelOf(['lichen']);
    expect(propsAt(level, 0, 0).contactPoison).toBe(LICHEN_CONTACT_POISON);
    expect(LICHEN_CONTACT_POISON).toBeGreaterThan(0);
    expect(hazardAt(level, 0, 0)).toBe('lichen');
  });

  it('is walkable and flammable, and burns to floor', () => {
    expect(blocksMove(levelOf(['lichen']), 0, 0)).toBe(false);
    expect(isFlammableKind('lichen')).toBe(true);
    expect(burntKind('lichen')).toBe('floor');
  });

  it('is the only terrain that creeps', () => {
    expect(ALL_KINDS.filter((k) => terrainProps(k).spreadChance > 0)).toEqual(['lichen']);
  });
});

// ── bridges ──────────────────────────────────────────────────────────────────

describe('bridges', () => {
  it('is walkable at ground level even where it spans a chasm', () => {
    const level = levelOf(['pit', 'bridge', 'pit']);
    expect(blocksMove(level, 1, 0)).toBe(false);
    expect(propsAt(level, 1, 0).descends).toBe(false); // the span holds you up
    expect(makeCell('bridge').elevation).toBe(0);
    expect(makeCell('bridge').elevation).toBeGreaterThan(makeCell('pit').elevation);
  });

  it('costs a normal step and triggers no entry event', () => {
    const level = levelOf(['bridge']);
    expect(moveCostTicks(level, 0, 0)).toBe(TICKS_PER_TURN);
    expect(hazardAt(level, 0, 0)).toBeNull();
  });

  it('burns, and burning it leaves the chasm it spanned', () => {
    expect(isFlammableKind('bridge')).toBe(true);
    expect(burntKind('bridge')).toBe('pit');
    expect(terrainProps(burntKind('bridge')).descends).toBe(true);
  });
});

// ── secret doors ─────────────────────────────────────────────────────────────

describe('secret doors', () => {
  it('is indistinguishable from wall in every rule until it is found', () => {
    // Property-by-property equality with the kind it imitates: a future rule
    // added to one and not the other would leak the door's presence.
    const { concealment, ...disguised } = TERRAIN_PROPS.secretDoor;
    const { concealment: wallConcealment, ...wall } = TERRAIN_PROPS.wall;
    expect(disguised).toEqual(wall);
    expect(wallConcealment).toBeNull();
    expect(concealment).toEqual({ presentsAs: 'wall', revealsTo: 'floor' });
  });

  it('reads as wall to movement, sight and the voxel mesh', () => {
    const level = levelOf(['secretDoor']);
    expect(blocksMove(level, 0, 0)).toBe(true);
    expect(occluderHeight(level, 0, 0)).toBe(WALL_HEIGHT);
    expect(hazardAt(level, 0, 0)).toBeNull();
    expect(fillsColumn('secretDoor')).toBe(true);
  });

  it('becomes a passable, transparent doorway once revealed', () => {
    const level = levelOf(['secretDoor']);
    level.cells[0] = revealCell(level.cells[0]);
    expect(blocksMove(level, 0, 0)).toBe(false);
    expect(occluderHeight(level, 0, 0)).toBe(0);
    expect(moveCostTicks(level, 0, 0)).toBe(TICKS_PER_TURN);
    expect(hazardAt(level, 0, 0)).toBeNull();
  });

  it('reveals immutably and keeps the generated ceiling overhead', () => {
    const before: ReturnType<typeof makeCell> = { ...makeCell('secretDoor'), ceiling: 6.25 };
    const after = revealCell(before);
    expect(after).not.toBe(before);
    expect(before.kind).toBe('secretDoor'); // the original is untouched
    expect(after.kind).toBe('floor');
    expect(after.ceiling).toBe(6.25);
  });

  it('is a no-op on anything with nothing to find', () => {
    const wall = makeCell('wall');
    expect(revealCell(wall)).toBe(wall);
    const opened = revealCell(makeCell('secretDoor'));
    expect(revealCell(opened)).toBe(opened);
  });

  it('is the only concealed terrain', () => {
    expect(ALL_KINDS.filter(isConcealedKind)).toEqual(['secretDoor']);
  });
});

// ── fire fuel across the whole registry ──────────────────────────────────────

describe('fire fuel', () => {
  it('burns groundcover, silk, lichen and bridges — and nothing structural', () => {
    const burnable = ALL_KINDS.filter(isFlammableKind);
    expect([...burnable].sort()).toEqual(['bridge', 'grass', 'lichen', 'web']);
  });

  it('never lets fuel block movement (a burning wall makes no sense)', () => {
    for (const kind of ALL_KINDS.filter(isFlammableKind)) {
      expect(TERRAIN_PROPS[kind].blocksMove, kind).toBe(false);
    }
  });
});
