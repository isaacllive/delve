// Procedural CAVE generation, biome-aware and lazy. The 100-floor descent is
// generated one floor at a time, on demand (see getLevel): each floor's
// geometry is deterministic from `seed#depth`, so the server and every client
// produce the same floor without shipping geometry or building all 100 up
// front. Biomes (every 25 floors) and their sub-biomes vary the caves — see
// biomes.ts.
//
// Organic caverns via cellular automata: random-fill → smooth (4-5 rule) →
// keep the largest connected region. Then decorate with verticality — raised
// rock shelves (height) and pits/chasms/water pools (depth) — plus stairs
// linking levels, scattered light fixtures, an uneven ceiling, and (on the
// bottom floor) a boss + exit portal.

import { biomeForDepth, subBiomeForDepth, type BiomePalette, type SubBiome } from './biomes.ts';
import { cellIndex } from './grid.ts';
import { makeLight, type LightSource } from './lighting.ts';
import {
  CEIL_MAX,
  CEIL_MIN,
  makeCell,
  type Level,
  type TerrainCell,
  type TerrainKind,
} from './terrain.ts';
import { makeRng, type Rng } from './rng.ts';
import { generateRoomLevel, type Room } from './roomgen.ts';

// Architectural biomes are carved with the room-accretion generator (roomgen.ts)
// instead of cellular-automata caves — Ruins and the Ancient City read as built
// spaces, not caverns. Other biomes stay caves. The bottom (boss) floor always
// uses caves so its far-cell boss/exit placement is unchanged.
const ROOM_BIOMES = new Set(['Ruins', 'Ancient City']);
function usesRoomGen(depth: number, isLast: boolean): boolean {
  return !isLast && ROOM_BIOMES.has(biomeForDepth(depth).name);
}

export interface DungeonLevel extends Level {
  lights: LightSource[];
  depth: number; // 0-based level index
  openCount: number;
  palette: BiomePalette;
  biomeName: string;
  subBiomeName: string;
  /** Commutation altar location (some floors) — a machine that swaps the enchant
   *  of the player's equipped weapon and armor. One use per altar. */
  altar?: { col: number; row: number };
  /** A guardian vault (some room-biome floors): a reward sealed behind a
   *  portcullis `gate`, opened by pulling the `lever`. `reward` marks the
   *  guaranteed loot inside; `guardians` are mirror-movement statues (initial
   *  positions) that copy the delver's every step (see guardians.ts). */
  vault?: {
    gate: { col: number; row: number };
    lever: { col: number; row: number };
    reward: { col: number; row: number };
    guardians: { col: number; row: number }[];
  };
  /** Boss location (bottom floor only). */
  boss?: { col: number; row: number };
  /** Exit-portal location (bottom floor only; same cell as the boss). */
  exit?: { col: number; row: number };
  /** True for the base camp (depth -1) — a safe hub, no monsters. */
  camp?: boolean;
  /** Camp descent portal → floor 0 (camp only). */
  portal?: { col: number; row: number };
  /** Camp shops (camp only). */
  shops?: { col: number; row: number; name: string }[];
}

/** A lazily-generated dungeon: floors are produced on demand and cached. */
export interface Dungeon {
  seed: string;
  levelCount: number;
  opts: ResolvedOptions;
  cache: Map<number, DungeonLevel>;
}

export interface DungeonOptions {
  cols?: number;
  rows?: number;
  levelCount?: number;
}
type ResolvedOptions = Required<DungeonOptions>;

// Base (floor-0) map size. Floors grow larger the deeper you go (see
// sizeForDepth) so the descent feels ever more sprawling.
const DEFAULTS: ResolvedOptions = {
  cols: 72,
  rows: 52,
  // Brogue-faithful depth: 26 levels, the Amulet of Yendor on the deepest.
  levelCount: 26,
};
const COL_GROW = 0.8; // cells added per floor of depth
const ROW_GROW = 0.6;
const MAX_COLS = 170;
const MAX_ROWS = 124;

/** Map dimensions for a floor — base size plus depth-based growth, capped. */
function sizeForDepth(depth: number, opts: ResolvedOptions): { cols: number; rows: number } {
  return {
    cols: Math.min(MAX_COLS, Math.round(opts.cols + depth * COL_GROW)),
    rows: Math.min(MAX_ROWS, Math.round(opts.rows + depth * ROW_GROW)),
  };
}

// ── cellular-automata cave carving ──────────────────────────────────────────

function wallNeighbors(map: boolean[], cols: number, rows: number, c: number, r: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nc = c + dx;
      const nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) n++;
      else if (map[nr * cols + nc]) n++;
    }
  }
  return n;
}

function smooth(map: boolean[], cols: number, rows: number): boolean[] {
  const out = new Array<boolean>(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c === 0 || r === 0 || c === cols - 1 || r === rows - 1) {
        out[r * cols + c] = true;
        continue;
      }
      out[r * cols + c] = wallNeighbors(map, cols, rows, c, r) >= 5;
    }
  }
  return out;
}

function largestRegion(map: boolean[], cols: number, rows: number): Set<number> {
  const seen = new Uint8Array(cols * rows);
  let best: number[] = [];
  for (let i = 0; i < map.length; i++) {
    if (map[i] || seen[i]) continue;
    const region: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      region.push(idx);
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const nbrs = [
        c > 0 ? idx - 1 : -1,
        c < cols - 1 ? idx + 1 : -1,
        r > 0 ? idx - cols : -1,
        r < rows - 1 ? idx + cols : -1,
      ];
      for (const n of nbrs) {
        if (n >= 0 && !map[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (region.length > best.length) best = region;
  }
  const keep = new Set(best);
  for (let i = 0; i < map.length; i++) if (!keep.has(i)) map[i] = true;
  return keep;
}

// ── decoration (height + depth) ─────────────────────────────────────────────

function growBlob(region: Set<number>, cols: number, start: number, size: number, rng: Rng): number[] {
  const out = [start];
  const seen = new Set([start]);
  const frontier = [start];
  while (out.length < size && frontier.length) {
    const fi = rng.int(0, frontier.length - 1);
    const idx = frontier[fi];
    const c = idx % cols;
    const nbrs = [idx - 1, idx + 1, idx - cols, idx + cols].filter(
      (n) => region.has(n) && !seen.has(n) && Math.abs((n % cols) - c) <= 1,
    );
    if (nbrs.length === 0) {
      frontier.splice(fi, 1);
      continue;
    }
    const pick = rng.pick(nbrs);
    seen.add(pick);
    out.push(pick);
    frontier.push(pick);
  }
  return out;
}

function decorate(
  cells: TerrainCell[],
  region: Set<number>,
  cols: number,
  reserved: Set<number>,
  sb: SubBiome,
  rng: Rng,
): void {
  const openList = [...region];
  const area = region.size;
  const paint = (kind: TerrainKind, blobs: number, min: number, max: number) => {
    for (let b = 0; b < blobs; b++) {
      const seed = openList[rng.int(0, openList.length - 1)];
      if (reserved.has(seed)) continue;
      for (const idx of growBlob(region, cols, seed, rng.int(min, max), rng)) {
        if (reserved.has(idx)) continue;
        cells[idx] = makeCell(kind);
      }
    }
  };
  // Blob counts scale with area × the sub-biome's feature multipliers.
  paint('ledge', Math.max(0, Math.round((area / 260) * sb.ledgeMul)), 6, 16);
  paint('pit', Math.max(0, Math.round((area / 380) * sb.pitMul)), 3, 9);
  paint('water', Math.max(0, Math.round((area / 340) * sb.waterMul)), 4, 14);
  // Flammable grass patches — fuel for the fire simulation (hazards.ts). A few
  // per floor; they read as floor for movement but catch and spread fire.
  paint('grass', Math.max(0, Math.round(area / 300)), 8, 20);
}

// ── uneven cave ceiling (in unison with the floor) ──────────────────────────

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const tl = hash2(xi, yi);
  const tr = hash2(xi + 1, yi);
  const bl = hash2(xi, yi + 1);
  const br = hash2(xi + 1, yi + 1);
  return (tl * (1 - u) + tr * u) * (1 - v) + (bl * (1 - u) + br * u) * v;
}

const ARCH_DIST = 6;
const BUMP_AMP = 0.8;

function computeCeilings(cells: TerrainCell[], cols: number, rows: number, depth: number): void {
  const dist = new Int16Array(cols * rows).fill(-1);
  const q: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].kind === 'wall') {
      dist[i] = 0;
      q.push(i);
    }
  }
  for (let head = 0; head < q.length; head++) {
    const idx = q[head];
    const d = dist[idx];
    if (d >= ARCH_DIST) continue;
    const c = idx % cols;
    const nbrs = [c > 0 ? idx - 1 : -1, c < cols - 1 ? idx + 1 : -1, idx - cols, idx + cols];
    for (const n of nbrs) {
      if (n >= 0 && n < cells.length && dist[n] < 0) {
        dist[n] = d + 1;
        q.push(n);
      }
    }
  }
  const off = depth * 17.3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const open = Math.min(1, Math.max(0, dist[i]) / ARCH_DIST);
      const floorRef = cells[i].kind === 'ledge' ? cells[i].elevation : 0;
      const gapBase = CEIL_MIN + (CEIL_MAX - CEIL_MIN) * open;
      const n =
        valueNoise(c * 0.16 + off, r * 0.16 + off) * 0.7 +
        valueNoise(c * 0.55 + off, r * 0.55 + off) * 0.3;
      const bump = (n * 2 - 1) * BUMP_AMP;
      const gap = Math.max(CEIL_MIN - 0.3, Math.min(CEIL_MAX + BUMP_AMP, gapBase + bump));
      // Quantize to integer voxel steps (blocky roof), clamped to keep headroom
      // above the floor and stay below the top of the rock volume (VOX_TOP).
      cells[i].ceiling = Math.min(12, Math.max(floorRef + 2, Math.round(floorRef + gap)));
    }
  }
}

// ── level assembly ──────────────────────────────────────────────────────────

function bfsDistances(region: Set<number>, cols: number, start: number): Map<number, number> {
  const dist = new Map<number, number>([[start, 0]]);
  const q = [start];
  while (q.length) {
    const idx = q.shift()!;
    const c = idx % cols;
    const d = dist.get(idx)!;
    for (const n of [idx - 1, idx + 1, idx - cols, idx + cols]) {
      if (!region.has(n) || dist.has(n)) continue;
      if (Math.abs((n % cols) - c) > 1) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return dist;
}

/** Generate a single floor deterministically from `seed#depth`. */
function generateCaveLevel(seed: string, depth: number, opts: ResolvedOptions): DungeonLevel {
  const levelCount = opts.levelCount;
  const { cols, rows } = sizeForDepth(depth, opts);
  const isLast = depth === levelCount - 1;
  const sb = subBiomeForDepth(seed, depth);
  const biome = biomeForDepth(depth).name;

  // Carve the level — architectural biomes use room accretion, the rest use
  // cellular-automata caves. Both produce the same `cells`/`region`/entry/down
  // shape; the decoration + fixtures below are shared. `rng` drives that shared
  // decoration (a fresh stream for the room path, whose carve uses its own seed).
  let cells: TerrainCell[];
  let region: Set<number>;
  let entryIdx: number;
  let downIdx: number;
  let rng: Rng;
  let rooms: Room[] | null = null;

  if (usesRoomGen(depth, isLast)) {
    const rl = generateRoomLevel(seed, depth, { cols, rows, levelCount });
    cells = rl.cells;
    rooms = rl.rooms;
    region = new Set<number>();
    for (let i = 0; i < cells.length; i++) if (cells[i].kind !== 'wall') region.add(i);
    const up = rl.stairsUp ?? rl.entry;
    entryIdx = cellIndex(up.col, up.row, cols);
    downIdx = rl.stairsDown ? cellIndex(rl.stairsDown.col, rl.stairsDown.row, cols) : entryIdx;
    rng = makeRng(`${seed}#${depth}#decor`);
  } else {
    rng = makeRng(`${seed}#${depth}`);
    // Random fill (border always rock) → smooth → keep the largest region.
    let map: boolean[] = new Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        map[r * cols + c] =
          c === 0 || r === 0 || c === cols - 1 || r === rows - 1 ? true : rng.chance(sb.fillProb);
      }
    }
    for (let s = 0; s < sb.smoothSteps; s++) map = smooth(map, cols, rows);
    region = largestRegion(map, cols, rows);
    cells = map.map((w) => makeCell(w ? 'wall' : 'floor'));
    // Entry + far-apart down-stairs.
    const caveOpen = [...region];
    entryIdx = caveOpen[rng.int(0, caveOpen.length - 1)];
    const dist = bfsDistances(region, cols, entryIdx);
    downIdx = entryIdx;
    let far = -1;
    for (const [idx, d] of dist) if (d > far) ((far = d), (downIdx = idx));
  }

  const openList = [...region];
  const entry = { col: entryIdx % cols, row: Math.floor(entryIdx / cols) };
  // Every floor's up-stair returns to the floor above; floor 0's returns to the
  // base camp (so you can retreat and bank the expedition).
  const stairsUp = entry;
  const stairsDown = isLast ? undefined : { col: downIdx % cols, row: Math.floor(downIdx / cols) };

  const reserved = new Set<number>([entryIdx, downIdx]);

  // Guardian vault (room biomes only): seal a dead-end room behind a portcullis
  // opened by a lever, with a guaranteed reward inside. Built before decoration
  // so its cells are reserved from terrain blobs.
  let vault: DungeonLevel['vault'];
  if (rooms) {
    const roomOf = (idx: number) => rooms!.find((rm) => rm.cells.includes(idx));
    const entryRoom = roomOf(entryIdx);
    const downRoom = roomOf(downIdx);
    // A good vault is a one-door dead-end that isn't the seed room, the entry, or
    // the stairs room — sealing it can't cut off the critical path.
    const candidates = rooms.filter(
      (rm) => rm.doors.length === 1 && rm.id !== 0 && rm.id !== entryRoom?.id && rm.id !== downRoom?.id,
    );
    if (candidates.length > 0) {
      const vroom = candidates[rng.int(0, candidates.length - 1)];
      const door = vroom.doors[0];
      const gateIdx = cellIndex(door.col, door.row, cols);
      // Lever sits just OUTSIDE the door (opposite the direction into the room).
      const leverCol = door.col - door.dir.col;
      const leverRow = door.row - door.dir.row;
      const leverIdx = cellIndex(leverCol, leverRow, cols);
      // Reward on a floor cell inside the room (prefer its centre).
      const centerIdx = cellIndex(vroom.center.col, vroom.center.row, cols);
      const rewardIdx =
        cells[centerIdx]?.kind === 'floor' && centerIdx !== gateIdx
          ? centerIdx
          : (vroom.cells.find((i) => i !== gateIdx && cells[i]?.kind === 'floor') ?? centerIdx);
      // Only build it if the lever lands on a real, distinct floor cell.
      if (cells[leverIdx]?.kind === 'floor' && leverIdx !== gateIdx && leverIdx !== rewardIdx) {
        cells[gateIdx] = makeCell('gate');
        region.delete(gateIdx); // no longer walkable floor for decoration/spawns
        reserved.add(gateIdx);
        reserved.add(leverIdx);
        reserved.add(rewardIdx);
        // One guardian statue inside, on a floor cell that isn't the reward or
        // door — a mirror-movement obstacle between you and the loot.
        const guardIdx = vroom.cells.find(
          (i) => i !== gateIdx && i !== rewardIdx && cells[i]?.kind === 'floor',
        );
        const guardians = guardIdx !== undefined ? [{ col: guardIdx % cols, row: Math.floor(guardIdx / cols) }] : [];
        if (guardIdx !== undefined) reserved.add(guardIdx);
        vault = {
          gate: { col: door.col, row: door.row },
          lever: { col: leverCol, row: leverRow },
          reward: { col: rewardIdx % cols, row: Math.floor(rewardIdx / cols) },
          guardians,
        };
      }
    }
  }

  decorate(cells, region, cols, reserved, sb, rng);

  if (stairsUp) cells[entryIdx] = makeCell('stairsUp');
  if (stairsDown) cells[cellIndex(stairsDown.col, stairsDown.row, cols)] = makeCell('stairsDown');

  // Bottom floor: the far cell hosts the boss (and, once beaten, the exit).
  let boss: { col: number; row: number } | undefined;
  let exit: { col: number; row: number } | undefined;
  if (isLast) {
    cells[downIdx] = makeCell('floor'); // ensure walkable
    boss = { col: downIdx % cols, row: Math.floor(downIdx / cols) };
    exit = { ...boss };
  }

  // Light fixtures (biome-flavoured), spaced out.
  const lights: LightSource[] = [];
  const lightBudget = Math.max(3, Math.round(region.size / 240));
  const placed: number[] = [];
  let tries = 0;
  while (lights.length < lightBudget && tries < lightBudget * 30) {
    tries++;
    const idx = openList[rng.int(0, openList.length - 1)];
    if (reserved.has(idx) || cells[idx].kind !== 'floor') continue;
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    if (placed.some((p) => Math.abs((p % cols) - c) + Math.abs(Math.floor(p / cols) - r) < 8)) continue;
    placed.push(idx);
    lights.push(makeLight(rng.pick(sb.lights), c, r));
  }

  // Commutation altar (a machine): appears on some mid-run floors, set well away
  // from the entry. Deterministic; one such altar per eligible floor.
  let altar: { col: number; row: number } | undefined;
  if (!isLast && depth >= 3 && depth % 3 === 0) {
    for (let t = 0; t < 40 && !altar; t++) {
      const idx = openList[rng.int(0, openList.length - 1)];
      if (reserved.has(idx) || cells[idx].kind !== 'floor') continue;
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      if (Math.abs(c - entry.col) + Math.abs(r - entry.row) < 10) continue;
      altar = { col: c, row: r };
    }
  }

  computeCeilings(cells, cols, rows, depth);

  return {
    cols,
    rows,
    cells,
    entry,
    stairsUp,
    stairsDown,
    depth,
    lights,
    openCount: region.size,
    palette: sb.palette,
    biomeName: biome,
    altar,
    vault,
    subBiomeName: sb.name,
    boss,
    exit,
  };
}

const CAMP_PALETTE: BiomePalette = {
  floor: 0x6a5a44,
  wall: 0x3a2f22,
  ledge: 0x8a7658,
  pit: 0x140f08,
  water: 0x2f5f80,
  stairsDown: 0xffd070,
  stairsUp: 0x35866a,
  rock: 0x2a2016,
  bg: 0x0a0806,
};

/** The base camp (depth -1): a small torch-lit safe room with a descent portal
 *  and a couple of shop stalls. No monsters, no hazards. */
function makeCamp(_seed: string): DungeonLevel {
  const cols = 22;
  const rows = 15;
  const cells: TerrainCell[] = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const border = c === 0 || r === 0 || c === cols - 1 || r === rows - 1;
      cells[r * cols + c] = makeCell(border ? 'wall' : 'floor');
    }
  }
  const entry = { col: Math.floor(cols / 2), row: rows - 3 };
  const portal = { col: Math.floor(cols / 2), row: 3 };
  const shops = [
    { col: 4, row: 7, name: 'Provisioner' },
    { col: cols - 5, row: 7, name: 'Smith' },
  ];
  const lights: LightSource[] = [
    makeLight('campfire', Math.floor(cols / 2), Math.floor(rows / 2)),
    makeLight('lantern', 3, 3),
    makeLight('lantern', cols - 4, 3),
  ];
  computeCeilings(cells, cols, rows, 0);
  return {
    cols,
    rows,
    cells,
    entry,
    stairsUp: undefined,
    stairsDown: undefined,
    depth: -1,
    lights,
    openCount: (cols - 2) * (rows - 2),
    palette: CAMP_PALETTE,
    biomeName: 'Base Camp',
    subBiomeName: 'Expedition Hub',
    camp: true,
    portal,
    shops,
  };
}

/** Create a lazy dungeon handle. Floors are generated on first access. */
export function generateDungeon(seed: string, options: DungeonOptions = {}): Dungeon {
  const opts = { ...DEFAULTS, ...options };
  return { seed, levelCount: opts.levelCount, opts, cache: new Map() };
}

/** Get (generating + caching on demand) the floor at `depth`. Depth -1 is the
 *  base camp. */
export function getLevel(d: Dungeon, depth: number): DungeonLevel {
  let lvl = d.cache.get(depth);
  if (!lvl) {
    lvl = depth < 0 ? makeCamp(d.seed) : generateCaveLevel(d.seed, depth, d.opts);
    d.cache.set(depth, lvl);
  }
  return lvl;
}

/** Depth index of the base camp. */
export const CAMP_DEPTH = -1;
