// Room-accretion dungeon generation — Brogue's signature algorithm, as a pure
// deterministic module standing alongside the cellular-automata cave generator
// in dungeon.ts. Where caves are one organic blob, an accreted level is a TREE
// of hand-shaped rooms (rectangular, circular, cross, small cellular cavern)
// stitched together at doorways, then relaxed into a graph by carving a few
// extra LOOPS. That structure — rooms with door slots — is exactly what a future
// machine/vault system needs to attach reward vaults, guardian puzzles, and
// altars, which a featureless cave cannot host.
//
// The algorithm (BrogueCE `Architect.c`, anderoonies' "Broguelike Dungeon
// Creation" write-ups):
//   1. Stamp a seed room. Then repeatedly: design a candidate room of a random
//      shape and try to ACCRETE it onto the existing structure at a random legal
//      door slot (a wall cell adjacent to existing floor) where the whole room
//      footprint lands on untouched rock without overlapping — carving a single
//      doorway to connect it. This yields a fully-connected tree of rooms.
//   2. ADD LOOPS: up to LOOP_MAX doorways over LOOP_TRIES attempts. Pick a wall
//      between two floor cells that are currently FAR APART by path; carve it,
//      turning the tree into a graph with tactically-interesting loops.
//   3. Place entry + down-stairs far apart (BFS-distance, as dungeon.ts does).
//
// Everything is deterministic from `seed`+`depth` via rng.ts — no Date.now /
// Math.random — so the server and every client regenerate an identical level.
// The returned level reuses the terrain model (makeCell / TerrainKind / the
// Level shape from terrain.ts), so dungeon.ts can adopt it as an alternate
// per-biome generator with no changes to the wire or the client.

import { cellIndex } from './grid.ts';
import { makeCell, type Level, type TerrainCell } from './terrain.ts';
import { makeRng, type Rng } from './rng.ts';

// ── public shape ─────────────────────────────────────────────────────────────

/** A unit step in one of the four orthogonal directions. */
export interface Dir {
  col: number;
  row: number;
}

/** A carved doorway: the (col,row) of the door cell plus the direction that
 *  points from the parent structure OUT into the room it opens onto. `roomId`
 *  is the accreted room this door leads into (undefined for loop doorways,
 *  which connect two pre-existing rooms rather than introducing a new one). */
export interface RoomDoor {
  col: number;
  row: number;
  dir: Dir;
  roomId?: number;
}

export type RoomShape = 'seed' | 'rect' | 'circle' | 'cross' | 'cave';

/** One accreted room. `cells` are the flat row-major indices of its floor cells
 *  (a machine can iterate them to scatter loot / guardians / altar props);
 *  `doors` are the doorways on its boundary; `bounds`/`center` bound it. This is
 *  the metadata the future machine/vault system attaches to. */
export interface Room {
  id: number;
  shape: RoomShape;
  cells: number[];
  doors: RoomDoor[];
  bounds: { minCol: number; minRow: number; maxCol: number; maxRow: number };
  center: { col: number; row: number };
}

/** A room-accreted level: a `Level` (so it is drop-in compatible with the
 *  terrain model and everything that consumes a Level) plus the room/door graph
 *  and the depth/openCount bookkeeping dungeon.ts's DungeonLevel also carries. */
export interface RoomLevel extends Level {
  depth: number;
  /** Count of non-wall (open) cells — mirrors DungeonLevel.openCount. */
  openCount: number;
  /** Every accreted room, in accretion order (rooms[0] is the seed room). */
  rooms: Room[];
  /** Every carved doorway on the level — accretion doorways and loop doorways. */
  doors: RoomDoor[];
}

export interface RoomGenOptions {
  cols?: number;
  rows?: number;
  /** Total floors in the run — only used to know whether this is the LAST floor
   *  (no down-stairs). Mirrors DungeonOptions.levelCount. */
  levelCount?: number;
}
type ResolvedOptions = Required<RoomGenOptions>;

// Base (floor-0) size + depth growth, mirroring dungeon.ts so an accreted floor
// is the same scale as a cave floor at the same depth.
const DEFAULTS: ResolvedOptions = { cols: 72, rows: 52, levelCount: 100 };
const COL_GROW = 0.8;
const ROW_GROW = 0.6;
const MAX_COLS = 170;
const MAX_ROWS = 124;

function sizeForDepth(depth: number, opts: ResolvedOptions): { cols: number; rows: number } {
  return {
    cols: Math.min(MAX_COLS, Math.round(opts.cols + depth * COL_GROW)),
    rows: Math.min(MAX_ROWS, Math.round(opts.rows + depth * ROW_GROW)),
  };
}

// Accretion tuning.
const TARGET_OPEN_FRACTION = 0.34; // stop accreting once this share of interior is floor
const MAX_ACCRETION_ATTEMPTS = 600; // hard cap on candidate rooms tried
const ATTACH_TRIES_PER_ROOM = 40; // door slots probed per candidate before giving up
// Loop phase (Brogue: ~30 loops / 500 attempts).
const LOOP_MAX = 30;
const LOOP_TRIES = 500;
const LOOP_MIN_PATH = 15; // only carve a shortcut if the two sides are this far apart by path
const LOOP_BFS_CAP = 400; // bound the loop-distance BFS for performance

const DIRS4: readonly Dir[] = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
];

// ── room-shape designers ─────────────────────────────────────────────────────
// Each returns a list of local [col,row] floor offsets, normalised so the
// minimum offset is (0,0). Empty results are rejected by the caller.

type LocalCells = Array<[number, number]>;

function normalise(cells: LocalCells): LocalCells {
  let minC = Infinity;
  let minR = Infinity;
  for (const [c, r] of cells) {
    if (c < minC) minC = c;
    if (r < minR) minR = r;
  }
  return cells.map(([c, r]) => [c - minC, r - minR] as [number, number]);
}

function designRect(rng: Rng): LocalCells {
  const w = rng.int(4, 11);
  const h = rng.int(3, 7);
  const out: LocalCells = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push([c, r]);
  return out;
}

function designCircle(rng: Rng): LocalCells {
  const radius = rng.int(2, 5);
  const rr = (radius + 0.5) * (radius + 0.5);
  const out: LocalCells = [];
  for (let r = -radius; r <= radius; r++) {
    for (let c = -radius; c <= radius; c++) {
      if (c * c + r * r <= rr) out.push([c + radius, r + radius]);
    }
  }
  return out;
}

function designCross(rng: Rng): LocalCells {
  const w = rng.int(6, 11); // full width
  const h = rng.int(5, 9); // full height
  const armW = rng.int(2, Math.max(2, w - 3)); // vertical bar width
  const armH = rng.int(2, Math.max(2, h - 3)); // horizontal bar height
  const cOff = Math.floor((w - armW) / 2);
  const rOff = Math.floor((h - armH) / 2);
  const out: LocalCells = [];
  const seen = new Set<string>();
  const add = (c: number, r: number) => {
    const k = `${c},${r}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push([c, r]);
    }
  };
  // Horizontal bar (full width, centred vertically).
  for (let r = rOff; r < rOff + armH; r++) for (let c = 0; c < w; c++) add(c, r);
  // Vertical bar (full height, centred horizontally).
  for (let r = 0; r < h; r++) for (let c = cOff; c < cOff + armW; c++) add(c, r);
  return out;
}

/** Small cellular-automata cavern — the organic shape among the geometric ones.
 *  Keeps the largest 4-connected region so the room is a single blob. */
function designCave(rng: Rng): LocalCells {
  const w = rng.int(7, 12);
  const h = rng.int(6, 10);
  let fill: boolean[] = new Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      // Border biased solid so the cavern pulls away from its bounding box.
      fill[r * w + c] = c === 0 || r === 0 || c === w - 1 || r === h - 1 ? true : rng.chance(0.45);
    }
  }
  const wallN = (m: boolean[], c: number, r: number): number => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nc = c + dx;
        const nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= w || nr >= h) n++;
        else if (m[nr * w + nc]) n++;
      }
    return n;
  };
  for (let step = 0; step < 3; step++) {
    const next = new Array<boolean>(w * h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) next[r * w + c] = wallN(fill, c, r) >= 5;
    fill = next;
  }
  // Largest connected open region.
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  for (let i = 0; i < fill.length; i++) {
    if (fill[i] || seen[i]) continue;
    const region: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      region.push(idx);
      const c = idx % w;
      const r = Math.floor(idx / w);
      const nb = [
        c > 0 ? idx - 1 : -1,
        c < w - 1 ? idx + 1 : -1,
        r > 0 ? idx - w : -1,
        r < h - 1 ? idx + w : -1,
      ];
      for (const nn of nb) if (nn >= 0 && !fill[nn] && !seen[nn]) ((seen[nn] = 1), stack.push(nn));
    }
    if (region.length > best.length) best = region;
  }
  return best.map((idx) => [idx % w, Math.floor(idx / w)] as [number, number]);
}

const DESIGNERS: ReadonlyArray<(rng: Rng) => LocalCells> = [
  designRect,
  designRect, // rectangles are the workhorse — weight them
  designCircle,
  designCross,
  designCave,
];
const SHAPES: readonly RoomShape[] = ['rect', 'rect', 'circle', 'cross', 'cave'];

function designRoom(rng: Rng): { shape: RoomShape; cells: LocalCells } {
  const i = rng.int(0, DESIGNERS.length - 1);
  const cells = normalise(DESIGNERS[i](rng));
  return { shape: SHAPES[i], cells };
}

// ── grid helpers ─────────────────────────────────────────────────────────────

/** A cell is an INTERIOR cell if it is in bounds and NOT on the border ring
 *  (the border must stay solid rock so the level is sealed). */
function isInterior(col: number, row: number, cols: number, rows: number): boolean {
  return col > 0 && row > 0 && col < cols - 1 && row < rows - 1;
}

function key(col: number, row: number): string {
  return `${col},${row}`;
}

// ── level assembly ───────────────────────────────────────────────────────────

interface Working {
  cols: number;
  rows: number;
  /** true = open floor, false = solid rock. Row-major. */
  floor: boolean[];
  rooms: Room[];
  doors: RoomDoor[];
  rng: Rng;
}

/** Stamp a room's floor cells and register it. Returns the created Room. */
function stampRoom(
  w: Working,
  shape: RoomShape,
  placed: Array<[number, number]>,
  door: RoomDoor | undefined,
): Room {
  const id = w.rooms.length;
  const indices: number[] = [];
  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;
  for (const [c, r] of placed) {
    w.floor[r * w.cols + c] = true;
    indices.push(r * w.cols + c);
    if (c < minCol) minCol = c;
    if (r < minRow) minRow = r;
    if (c > maxCol) maxCol = c;
    if (r > maxRow) maxRow = r;
  }
  const doors: RoomDoor[] = [];
  if (door) {
    door.roomId = id;
    w.floor[door.row * w.cols + door.col] = true; // carve the doorway
    doors.push(door);
    w.doors.push(door);
  }
  const room: Room = {
    id,
    shape,
    cells: indices,
    doors,
    bounds: { minCol, minRow, maxCol, maxRow },
    center: { col: Math.round((minCol + maxCol) / 2), row: Math.round((minRow + maxRow) / 2) },
  };
  w.rooms.push(room);
  return room;
}

/** Would placing `placed` (plus carving doorway `door`) be legal? Every room
 *  cell and the doorway must be interior rock, and the footprint must keep a
 *  one-cell rock buffer from all EXISTING floor except through the doorway —
 *  so rooms never overlap or silently merge. `attachFloor` is the single
 *  existing floor cell the doorway is allowed to touch. */
function placementFits(
  w: Working,
  placed: Array<[number, number]>,
  door: RoomDoor,
  attachFloor: { col: number; row: number },
): boolean {
  const { cols, rows, floor } = w;
  const own = new Set<string>();
  for (const [c, r] of placed) own.add(key(c, r));
  own.add(key(door.col, door.row));

  const checkCell = (c: number, r: number): boolean => {
    if (!isInterior(c, r, cols, rows)) return false;
    if (floor[r * cols + c]) return false; // must be rock now
    // Buffer: no orthogonal neighbour may be pre-existing floor, except the
    // doorway is allowed to touch its one attach cell.
    for (const d of DIRS4) {
      const nc = c + d.col;
      const nr = r + d.row;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (own.has(key(nc, nr))) continue; // part of the room-in-progress
      if (floor[nr * cols + nc]) {
        if (c === door.col && r === door.row && nc === attachFloor.col && nr === attachFloor.row)
          continue;
        return false;
      }
    }
    return true;
  };

  for (const [c, r] of placed) if (!checkCell(c, r)) return false;
  if (!checkCell(door.col, door.row)) return false;
  return true;
}

/** Attempt to accrete one candidate room onto the current structure. Returns
 *  the placed Room, or null if no legal door slot was found this try. */
function tryAccrete(w: Working, shape: RoomShape, local: LocalCells): Room | null {
  const { cols, rows, floor, rng } = w;
  const localSet = new Set<string>();
  for (const [c, r] of local) localSet.add(key(c, r));

  for (let attempt = 0; attempt < ATTACH_TRIES_PER_ROOM; attempt++) {
    // Pick a random door slot on the existing dungeon: a floor cell F with an
    // interior-rock neighbour W = F + dir. The room will grow beyond W in `dir`.
    const dir = DIRS4[rng.int(0, DIRS4.length - 1)];
    const fCol = rng.int(1, cols - 2);
    const fRow = rng.int(1, rows - 2);
    if (!floor[fRow * cols + fCol]) continue;
    const wCol = fCol + dir.col;
    const wRow = fRow + dir.row;
    if (!isInterior(wCol, wRow, cols, rows) || floor[wRow * cols + wCol]) continue;

    // The room's connecting cell lands at W + dir; it must be a room floor cell
    // whose neighbour in -dir is the doorway (i.e. on the room's -dir edge).
    const edge: LocalCells = local.filter(
      ([c, r]) => !localSet.has(key(c - dir.col, r - dir.row)),
    );
    if (edge.length === 0) continue;
    const rc = edge[rng.int(0, edge.length - 1)];
    const anchorCol = wCol + dir.col;
    const anchorRow = wRow + dir.row;
    const offC = anchorCol - rc[0];
    const offR = anchorRow - rc[1];
    const placed: LocalCells = local.map(([c, r]) => [c + offC, r + offR]);
    const door: RoomDoor = { col: wCol, row: wRow, dir };
    if (placementFits(w, placed, door, { col: fCol, row: fRow })) {
      return stampRoom(w, shape, placed, door);
    }
  }
  return null;
}

/** BFS distance (in orthogonal floor steps) from `start` to `goal`, capped at
 *  LOOP_BFS_CAP expansions. Returns Infinity if goal not reached within the cap
 *  (treated as "far apart" — a good loop candidate). */
function pathDistance(
  floor: boolean[],
  cols: number,
  rows: number,
  start: number,
  goal: number,
): number {
  const dist = new Map<number, number>([[start, 0]]);
  const q = [start];
  let expanded = 0;
  for (let head = 0; head < q.length; head++) {
    const idx = q[head];
    if (idx === goal) return dist.get(idx)!;
    if (++expanded > LOOP_BFS_CAP) return Infinity;
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const d = dist.get(idx)!;
    const nb = [
      c > 0 ? idx - 1 : -1,
      c < cols - 1 ? idx + 1 : -1,
      r > 0 ? idx - cols : -1,
      r < rows - 1 ? idx + cols : -1,
    ];
    for (const n of nb) {
      if (n < 0 || !floor[n] || dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return Infinity;
}

/** Add loops (Brogue `addLoops`): carve a wall that sits between two floor cells
 *  which are currently far apart by path, turning the room tree into a graph.
 *  Returns the doorways carved. */
function addLoops(w: Working): RoomDoor[] {
  const { cols, rows, floor, rng } = w;
  const added: RoomDoor[] = [];
  for (let t = 0; t < LOOP_TRIES && added.length < LOOP_MAX; t++) {
    const c = rng.int(1, cols - 2);
    const r = rng.int(1, rows - 2);
    const idx = r * cols + c;
    if (floor[idx]) continue; // must be a wall
    // Two opposite floor neighbours (horizontal OR vertical corridor across).
    const horiz = c > 0 && c < cols - 1 && floor[idx - 1] && floor[idx + 1];
    const vert = r > 0 && r < rows - 1 && floor[idx - cols] && floor[idx + cols];
    if (!horiz && !vert) continue;
    const dir: Dir = horiz ? { col: 1, row: 0 } : { col: 0, row: 1 };
    const aIdx = horiz ? idx - 1 : idx - cols;
    const bIdx = horiz ? idx + 1 : idx + cols;
    // Only worth a loop if the two sides are currently far apart by path.
    if (pathDistance(floor, cols, rows, aIdx, bIdx) < LOOP_MIN_PATH) continue;
    floor[idx] = true; // carve the shortcut
    const door: RoomDoor = { col: c, row: r, dir };
    w.doors.push(door);
    added.push(door);
  }
  return added;
}

/** BFS distances over floor from a start index (all reachable cells). */
function bfsAll(floor: boolean[], cols: number, rows: number, start: number): Map<number, number> {
  const dist = new Map<number, number>([[start, 0]]);
  const q = [start];
  for (let head = 0; head < q.length; head++) {
    const idx = q[head];
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const d = dist.get(idx)!;
    const nb = [
      c > 0 ? idx - 1 : -1,
      c < cols - 1 ? idx + 1 : -1,
      r > 0 ? idx - cols : -1,
      r < rows - 1 ? idx + cols : -1,
    ];
    for (const n of nb) {
      if (n < 0 || !floor[n] || dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return dist;
}

/**
 * Generate a single room-accreted floor, deterministically from `seed`+`depth`.
 * The result is a `Level` (drop-in for the terrain model) enriched with the
 * room/door graph and depth/openCount bookkeeping, so dungeon.ts can adopt it
 * as an alternate per-biome generator without any wire/client change.
 */
export function generateRoomLevel(
  seed: string,
  depth: number,
  options: RoomGenOptions = {},
): RoomLevel {
  const opts: ResolvedOptions = { ...DEFAULTS, ...options };
  const { cols, rows } = sizeForDepth(depth, opts);
  const isLast = depth === opts.levelCount - 1;
  const rng = makeRng(`${seed}#${depth}`);

  const w: Working = {
    cols,
    rows,
    floor: new Array<boolean>(cols * rows).fill(false),
    rooms: [],
    doors: [],
    rng,
  };

  // 1. Seed room, placed roughly centred so accretion can grow outward in all
  //    directions. Retry designing until one fits (a tiny cave can be empty).
  const interiorArea = (cols - 2) * (rows - 2);
  for (let attempt = 0; attempt < 30 && w.rooms.length === 0; attempt++) {
    const { shape, cells } = designRoom(rng);
    if (cells.length === 0) continue;
    let maxC = 0;
    let maxR = 0;
    for (const [c, r] of cells) {
      if (c > maxC) maxC = c;
      if (r > maxR) maxR = r;
    }
    // Centre the bounding box, jittered a little.
    const offC = Math.max(1, Math.floor((cols - maxC) / 2) + rng.int(-3, 3));
    const offR = Math.max(1, Math.floor((rows - maxR) / 2) + rng.int(-2, 2));
    const placed: LocalCells = cells.map(([c, r]) => [c + offC, r + offR]);
    if (placed.every(([c, r]) => isInterior(c, r, cols, rows))) {
      stampRoom(w, shape, placed, undefined);
    }
  }
  // Guaranteed fallback: a small central rectangle (keeps the function total
  // even in the pathological case where every candidate was rejected).
  if (w.rooms.length === 0) {
    const cc = Math.floor(cols / 2);
    const cr = Math.floor(rows / 2);
    const placed: LocalCells = [];
    for (let r = -1; r <= 1; r++) for (let c = -2; c <= 2; c++) placed.push([cc + c, cr + r]);
    stampRoom(w, 'seed', placed, undefined);
  }
  w.rooms[0].shape = 'seed';

  // 2. Accrete rooms until we hit the open-fraction target or exhaust attempts.
  const targetOpen = interiorArea * TARGET_OPEN_FRACTION;
  let openCount = w.rooms[0].cells.length;
  for (let a = 0; a < MAX_ACCRETION_ATTEMPTS && openCount < targetOpen; a++) {
    const { shape, cells } = designRoom(rng);
    if (cells.length === 0) continue;
    const room = tryAccrete(w, shape, cells);
    if (room) openCount += room.cells.length + 1; // +1 for the doorway
  }

  // 3. Add loops (tree → graph).
  addLoops(w);

  // 4. Build terrain cells from the floor mask (border + unfilled = wall).
  const cells: TerrainCell[] = new Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = makeCell(w.floor[i] ? 'floor' : 'wall');

  // 5. Entry + down-stairs, placed far apart by BFS distance (as dungeon.ts).
  //    Entry prefers the seed room's centre (a natural arrival point); the
  //    farthest floor from it hosts the down-stairs.
  let entryIdx = -1;
  for (let i = 0; i < w.floor.length && entryIdx < 0; i++) if (w.floor[i]) entryIdx = i;
  const seedCenter = w.rooms[0].center;
  const seedIdx = cellIndex(seedCenter.col, seedCenter.row, cols);
  if (w.floor[seedIdx]) entryIdx = seedIdx;

  const dist = bfsAll(w.floor, cols, rows, entryIdx);
  let downIdx = entryIdx;
  let far = -1;
  for (const [idx, d] of dist) if (d > far) ((far = d), (downIdx = idx));

  const entry = { col: entryIdx % cols, row: Math.floor(entryIdx / cols) };
  const stairsUp = entry;
  const stairsDown = isLast ? undefined : { col: downIdx % cols, row: Math.floor(downIdx / cols) };

  cells[entryIdx] = makeCell('stairsUp');
  if (stairsDown) cells[downIdx] = makeCell('stairsDown');

  const finalOpen = cells.reduce((n, c) => (c.kind !== 'wall' ? n + 1 : n), 0);

  return {
    cols,
    rows,
    cells,
    entry,
    stairsUp,
    stairsDown,
    depth,
    openCount: finalOpen,
    rooms: w.rooms,
    doors: w.doors,
  };
}
