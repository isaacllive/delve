import { describe, it, expect } from 'vitest';
import { generateRoomLevel, type RoomLevel } from './roomgen.ts';
import { cellAt } from './terrain.ts';

/** BFS over all non-wall cells from a start; returns the set of reached indices. */
function reachable(level: RoomLevel, start: { col: number; row: number }): Set<number> {
  const seen = new Set<number>();
  const q = [start];
  while (q.length) {
    const { col, row } = q.shift()!;
    if (col < 0 || row < 0 || col >= level.cols || row >= level.rows) continue;
    const idx = row * level.cols + col;
    if (seen.has(idx)) continue;
    const c = cellAt(level, col, row);
    if (!c || c.kind === 'wall') continue;
    seen.add(idx);
    q.push({ col: col + 1, row }, { col: col - 1, row }, { col, row: row + 1 }, { col, row: row - 1 });
  }
  return seen;
}

function countNonWall(level: RoomLevel): number {
  return level.cells.filter((c) => c.kind !== 'wall').length;
}

const SEEDS = ['crypt-of-ash', 'ember-fang-717', 'null-mire-42'];

describe('generateRoomLevel (room-accretion)', () => {
  it('is deterministic — same seed+depth yields identical levels', () => {
    for (const seed of SEEDS) {
      for (const depth of [0, 5, 20]) {
        const a = generateRoomLevel(seed, depth, { levelCount: 30 });
        const b = generateRoomLevel(seed, depth, { levelCount: 30 });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    }
  });

  it('different seeds (or depths) yield different levels', () => {
    const a = generateRoomLevel('seed-one', 3);
    const b = generateRoomLevel('seed-two', 3);
    const c = generateRoomLevel('seed-one', 4);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('produces a Level compatible with the terrain model (border sealed)', () => {
    const lvl = generateRoomLevel('shape', 2, { levelCount: 30 });
    expect(lvl.cells.length).toBe(lvl.cols * lvl.rows);
    // Border ring is all wall — the level is sealed.
    for (let c = 0; c < lvl.cols; c++) {
      expect(cellAt(lvl, c, 0)!.kind).toBe('wall');
      expect(cellAt(lvl, c, lvl.rows - 1)!.kind).toBe('wall');
    }
    for (let r = 0; r < lvl.rows; r++) {
      expect(cellAt(lvl, 0, r)!.kind).toBe('wall');
      expect(cellAt(lvl, lvl.cols - 1, r)!.kind).toBe('wall');
    }
  });

  it('carves multiple rooms and a substantial open area', () => {
    for (const seed of SEEDS) {
      const lvl = generateRoomLevel(seed, 4, { levelCount: 30 });
      expect(lvl.rooms.length).toBeGreaterThan(3);
      expect(lvl.openCount).toBeGreaterThan(lvl.cols * lvl.rows * 0.12);
    }
  });

  it('every floor cell is reachable from the entry (full connectivity)', () => {
    for (const seed of SEEDS) {
      for (const depth of [0, 3, 7, 15]) {
        const lvl = generateRoomLevel(seed, depth, { levelCount: 30 });
        expect(reachable(lvl, lvl.entry).size).toBe(countNonWall(lvl));
      }
    }
  });

  it('rooms do not overlap — each floor cell belongs to at most one room', () => {
    for (const seed of SEEDS) {
      const lvl = generateRoomLevel(seed, 6, { levelCount: 30 });
      const owner = new Map<number, number>();
      for (const room of lvl.rooms) {
        for (const idx of room.cells) {
          expect(owner.has(idx)).toBe(false); // no cell claimed twice
          owner.set(idx, room.id);
        }
      }
    }
  });

  it('adds loops (tree → graph) on a reasonably sized floor', () => {
    // Loop doorways are the doors NOT owned by a room (roomId undefined).
    let sawLoops = false;
    for (const seed of SEEDS) {
      const lvl = generateRoomLevel(seed, 10, { levelCount: 30 });
      const loops = lvl.doors.filter((d) => d.roomId === undefined).length;
      if (loops > 0) sawLoops = true;
    }
    expect(sawLoops).toBe(true);
  });

  it('every accretion doorway is a floor cell joining its room to the rest', () => {
    const lvl = generateRoomLevel('doors', 5, { levelCount: 30 });
    for (const door of lvl.doors) {
      expect(cellAt(lvl, door.col, door.row)!.kind).not.toBe('wall');
    }
  });

  it('places entry + down-stairs, both reachable and far apart', () => {
    const lvl = generateRoomLevel('stairs', 4, { levelCount: 30 });
    expect(lvl.stairsUp).toEqual(lvl.entry);
    expect(lvl.stairsDown).toBeDefined();
    const reach = reachable(lvl, lvl.entry);
    const down = lvl.stairsDown!;
    expect(reach.has(down.row * lvl.cols + down.col)).toBe(true);
    // Entry cell is stairsUp; the far cell is stairsDown.
    expect(cellAt(lvl, lvl.entry.col, lvl.entry.row)!.kind).toBe('stairsUp');
    expect(cellAt(lvl, down.col, down.row)!.kind).toBe('stairsDown');
    // They are meaningfully separated.
    const manhattan = Math.abs(down.col - lvl.entry.col) + Math.abs(down.row - lvl.entry.row);
    expect(manhattan).toBeGreaterThan(5);
  });

  it('omits down-stairs on the last floor only', () => {
    const notLast = generateRoomLevel('last', 2, { levelCount: 5 });
    const last = generateRoomLevel('last', 4, { levelCount: 5 });
    expect(notLast.stairsDown).toBeDefined();
    expect(last.stairsDown).toBeUndefined();
  });

  it('grows larger with depth, mirroring the cave generator', () => {
    const shallow = generateRoomLevel('grow', 0);
    const deep = generateRoomLevel('grow', 50);
    expect(deep.cols).toBeGreaterThan(shallow.cols);
    expect(deep.rows).toBeGreaterThan(shallow.rows);
  });

  it('exposes usable room metadata (cells, bounds, center) for machines', () => {
    const lvl = generateRoomLevel('meta', 5, { levelCount: 30 });
    for (const room of lvl.rooms) {
      expect(room.cells.length).toBeGreaterThan(0);
      // center lies within the bounds
      expect(room.center.col).toBeGreaterThanOrEqual(room.bounds.minCol);
      expect(room.center.col).toBeLessThanOrEqual(room.bounds.maxCol);
      expect(room.center.row).toBeGreaterThanOrEqual(room.bounds.minRow);
      expect(room.center.row).toBeLessThanOrEqual(room.bounds.maxRow);
    }
    // The seed room is first and tagged as such.
    expect(lvl.rooms[0].shape).toBe('seed');
  });
});
