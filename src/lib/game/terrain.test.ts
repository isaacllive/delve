import { describe, it, expect } from 'vitest';
import {
  TERRAIN_PROPS,
  WALL_HEIGHT,
  blocksMove,
  hazardAt,
  isFlammableKind,
  makeCell,
  occluderHeight,
  type Level,
  type TerrainKind,
} from './terrain.ts';

const ALL_KINDS = Object.keys(TERRAIN_PROPS) as TerrainKind[];

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
      expect([null, 'pit', 'water'], kind).toContain(p.entryHazard);
      expect(typeof p.flammable, kind).toBe('boolean');
    }
  });

  it('builds cells at their kind default elevation', () => {
    for (const kind of ALL_KINDS) {
      expect(makeCell(kind), kind).toEqual({ kind, elevation: TERRAIN_PROPS[kind].elevation });
    }
  });

  it('derives every query from the table, for every kind', () => {
    const level = levelOf(ALL_KINDS);
    ALL_KINDS.forEach((kind, col) => {
      const p = TERRAIN_PROPS[kind];
      expect(blocksMove(level, col, 0), kind).toBe(p.blocksMove);
      expect(hazardAt(level, col, 0), kind).toBe(p.entryHazard);
      expect(isFlammableKind(kind), kind).toBe(p.flammable);
    });
  });
});

describe('terrain rules that gameplay depends on', () => {
  it('blocks movement through walls and closed vault gates only', () => {
    const blocking = ALL_KINDS.filter((k) => TERRAIN_PROPS[k].blocksMove);
    expect(blocking.sort()).toEqual(['gate', 'wall']);
  });

  it('treats out-of-bounds as solid rock for movement and sight', () => {
    const level = levelOf(['floor']);
    expect(blocksMove(level, -1, 0)).toBe(true);
    expect(blocksMove(level, 0, 5)).toBe(true);
    expect(occluderHeight(level, -1, 0)).toBe(WALL_HEIGHT);
    expect(hazardAt(level, -1, 0)).toBe(null);
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
  });

  it('makes pits and water hazards to enter, not walls to bump into', () => {
    const level = levelOf(['pit', 'water']);
    expect(blocksMove(level, 0, 0)).toBe(false);
    expect(blocksMove(level, 1, 0)).toBe(false);
    expect(hazardAt(level, 0, 0)).toBe('pit');
    expect(hazardAt(level, 1, 0)).toBe('water');
  });

  it('makes grass the only fire fuel so far', () => {
    const burnable = ALL_KINDS.filter(isFlammableKind);
    expect(burnable).toEqual(['grass']);
  });
});
