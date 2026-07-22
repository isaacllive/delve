// Authoritative multiplayer game server. Mounts a WebSocket endpoint at /ws.
// A "run" is an in-memory game keyed by a join code; the first client to join a
// code creates it (seeding the dungeon), later clients join it. The server owns
// all movement validation, level transitions, and pit-fall resolution, then
// broadcasts live player state to everyone in the run. Static geometry never
// crosses the wire — clients regenerate it from the seed (see protocol.ts).

import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  CAMP_DEPTH,
  generateDungeon,
  getLevel,
  type Dungeon,
  type DungeonLevel,
} from '../game/dungeon.ts';
import { blocksMove, cellAt, hazardAt, occluderHeight } from '../game/terrain.ts';
import { hasLineOfSight } from '../game/los.ts';
import { getClass } from '../game/classes.ts';
import { STARTING_STRENGTH, potionOfLife, potionOfStrength } from '../game/character.ts';
import {
  isUnaware,
  nextAwareness,
  spawnMonsters,
  type Monster,
} from '../game/monsters.ts';
import { runUntilPlayer, TICKS_PER_TURN, type Scheduled } from '../game/energy.ts';
import {
  netEnchant,
  rollDamage,
  rollHit,
  sneakMultiplier,
  weaponAccuracy,
  type DamageRange,
} from '../game/combat.ts';
import { dartDamage, spawnTraps, trapAt, type Trap } from '../game/traps.ts';
import {
  isItemKind,
  monsterReward,
  POTION_COST,
  randomPotionKind,
  spawnLoot,
  type Loot,
} from '../game/loot.ts';
import { makeRng, type Rng } from '../game/rng.ts';
import {
  displayName,
  ITEM_KIND_BY_ID,
  makeIdentities,
  type ItemKindId,
  type RunIdentities,
} from '../game/items.ts';
import {
  headingOf,
  MAX_CHAT_LEN,
  MAX_NAME_LEN,
  type ClientMsg,
  type LootState,
  type MonsterState,
  type PlayerState,
  type ServerMsg,
  type TrapState,
} from '../game/protocol.ts';

/** Aggro range (cells) within which a monster chases a player. */
const AGGRO = 9;

// ── combat model (Brogue via combat.ts) ──────────────────────────────────────
// Unarmed, the delver's "weapon" has a strength requirement equal to the
// starting strength, so a fresh delver is neutral (net enchant 0 → accuracy 100)
// and every Potion of Strength thereafter is a small, real edge. Player defense
// is 0 until armor exists, so monsters land blows at their raw accuracy for now.
const UNARMED_STR_REQ = STARTING_STRENGTH;
const PLAYER_DEFENSE = 0;
/** Turns of continuous rest for a full-health regeneration (Brogue baseline). */
const TURNS_FOR_FULL_REGEN = 300;

/** Bite/blow damage rolls as a range up to the listed value, clumped to the mean. */
function damageRange(max: number, clumpFactor: number): DamageRange {
  return { min: Math.max(1, Math.round(max * 0.7)), max: Math.max(1, max), clumpFactor };
}

interface Player {
  state: PlayerState;
  ws: WebSocket;
  /** Fractional regeneration accumulator (see maybeRegen). */
  regenAcc: number;
}

interface Run {
  code: string;
  seed: string;
  dungeon: Dungeon;
  players: Map<string, Player>;
  tick: number;
  /** True once the bottom-floor boss has been defeated (opens the exit). */
  bossDefeated: boolean;
  /** Monsters per floor index, spawned lazily when a player first enters. */
  monsters: Map<number, Monster[]>;
  /** Loot per floor index, spawned lazily alongside monsters. */
  loot: Map<number, Loot[]>;
  /** Hidden traps per floor index, spawned lazily alongside monsters. */
  traps: Map<number, Trap[]>;
  /** Per-run item appearances (disguises), derived from the seed. */
  identities: RunIdentities;
  /** Item kinds the party has identified this run (shared knowledge). */
  discovered: Set<ItemKindId>;
  /** Count of Provisioner purchases, so each mystery potion is deterministic. */
  purchases: number;
  /** Stateful RNG for live combat rolls (hit/damage). Server-only. */
  combatRng: Rng;
}

// Run state lives in globalThis so an in-flight game survives HMR. We do NOT
// cache the WebSocketServer/handler there — caching it would pin the OLD
// connection handler (and its captured game logic) across a reload, silently
// serving stale code. Instead we build a fresh server each attach and wire it
// to whatever HTTP server Vite hands us.
const g = globalThis as unknown as { __delveRuns?: Map<string, Run> };
const runs: Map<string, Run> = (g.__delveRuns ??= new Map());

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(run: Run, msg: ServerMsg): void {
  for (const p of run.players.values()) send(p.ws, msg);
}

function monstersOn(run: Run, floor: number): Monster[] {
  return run.monsters.get(floor) ?? [];
}
function lootOn(run: Run, floor: number): Loot[] {
  return run.loot.get(floor) ?? [];
}
function trapsOn(run: Run, floor: number): Trap[] {
  return run.traps.get(floor) ?? [];
}

/** Spawn a floor's monsters + loot + traps on first visit (never for the
 *  camp). */
function ensureMonsters(run: Run, floor: number): void {
  if (floor < 0 || run.monsters.has(floor)) return;
  const level = getLevel(run.dungeon, floor);
  run.monsters.set(floor, spawnMonsters(run.seed, level));
  run.loot.set(floor, spawnLoot(run.seed, level));
  run.traps.set(floor, spawnTraps(run.seed, level));
}

function toMonsterState(m: Monster, floor: number): MonsterState {
  return { id: m.id, name: m.name, color: m.color, level: floor, col: m.col, row: m.row, hp: m.hp, hpMax: m.hpMax, boss: m.boss, state: m.state };
}
function toLootState(l: Loot, floor: number): LootState {
  return { id: l.id, kind: l.kind, category: l.category, col: l.col, row: l.row, level: floor };
}
function toTrapState(t: Trap, floor: number): TrapState {
  return { id: t.id, kind: t.kind, col: t.col, row: t.row, level: floor, sprung: t.sprung };
}

function stateMsg(run: Run, youId: string): ServerMsg {
  // Only send the monsters + loot on the recipient's own floor.
  const floor = run.players.get(youId)?.state.level ?? 0;
  return {
    t: 'state',
    you: youId,
    tick: run.tick,
    players: [...run.players.values()].map((p) => p.state),
    monsters: monstersOn(run, floor).map((m) => toMonsterState(m, floor)),
    loot: lootOn(run, floor).map((l) => toLootState(l, floor)),
    // Only reveal traps that are sprung or have been spotted — armed, unnoticed
    // traps stay secret so the client can't map them out.
    traps: trapsOn(run, floor).filter((t) => t.revealed).map((t) => toTrapState(t, floor)),
    discovered: [...run.discovered],
    bossDefeated: run.bossDefeated,
  };
}

function broadcastState(run: Run): void {
  run.tick++;
  for (const p of run.players.values()) send(p.ws, stateMsg(run, p.state.id));
}

/** Elevation a player has when standing on a given cell (ledges raise them). */
function elevationOn(level: DungeonLevel, col: number, row: number): number {
  const c = cellAt(level, col, row);
  if (c && c.kind === 'ledge') return c.elevation;
  return 0;
}

/** Nearest non-wall, non-pit cell to (col,row) on a level — where a falling
 *  player lands. BFS outward; falls back to the level entry. */
function nearestLanding(level: DungeonLevel, col: number, row: number): { col: number; row: number } {
  const seen = new Set<number>();
  const q: Array<{ col: number; row: number }> = [{ col, row }];
  while (q.length) {
    const { col: c, row: r } = q.shift()!;
    if (c < 0 || r < 0 || c >= level.cols || r >= level.rows) continue;
    const key = r * level.cols + c;
    if (seen.has(key)) continue;
    seen.add(key);
    const cell = cellAt(level, c, r);
    if (cell && cell.kind !== 'wall' && cell.kind !== 'pit') return { col: c, row: r };
    q.push({ col: c + 1, row: r }, { col: c - 1, row: r }, { col: c, row: r + 1 }, { col: c, row: r - 1 });
  }
  return { ...level.entry };
}

function joinRun(
  code: string,
  seed: string | undefined,
  name: string,
  classId: string | undefined,
  ws: WebSocket,
): { run: Run; player: Player } {
  let run = runs.get(code);
  if (!run) {
    const s = seed && seed.trim() ? seed.trim() : code;
    run = {
      code,
      seed: s,
      dungeon: generateDungeon(s),
      players: new Map(),
      tick: 0,
      bossDefeated: false,
      monsters: new Map(),
      loot: new Map(),
      traps: new Map(),
      identities: makeIdentities(s),
      discovered: new Set(),
      purchases: 0,
      combatRng: makeRng(`${s}#combat`),
    };
    runs.set(code, run);
  }
  const id = randomUUID();
  const cls = getClass(classId);
  const color = cls.accent;
  // Everyone starts in the base camp (depth -1) and descends on an expedition.
  const camp = getLevel(run.dungeon, CAMP_DEPTH);
  const state: PlayerState = {
    id,
    name: name.slice(0, MAX_NAME_LEN) || 'Delver',
    color,
    classId: cls.id,
    level: CAMP_DEPTH,
    col: camp.entry.col,
    row: camp.entry.row,
    elevation: elevationOn(camp, camp.entry.col, camp.entry.row),
    torchRadius: cls.torchRadius,
    hp: cls.hp,
    hpMax: cls.hp,
    // Brogue-faithful: everyone starts at Strength 12, regardless of class.
    // (Starting HP is still class-driven pending the classless refocus.)
    strength: STARTING_STRENGTH,
    gold: 0,
    inventory: [],
    facing: 0, // face north — toward the camp's descent portal
    alive: true,
  };
  const player: Player = { state, ws, regenAcc: 0 };
  run.players.set(id, player);
  return { run, player };
}

/** A living monster occupying (col,row) on a floor, if any. */
function monsterAt(run: Run, floor: number, col: number, row: number): Monster | undefined {
  return monstersOn(run, floor).find((m) => m.hp > 0 && m.col === col && m.row === row);
}

/** Player bump-attacks a monster (Brogue combat via combat.ts): an accuracy roll
 *  vs the monster's defense, then a clumped, enchant-/strength-scaled damage roll,
 *  tripled against an unaware target (sneak attack). On kill, remove it + drop
 *  gold; the boss opens the exit. Does NOT broadcast — the caller ends the turn. */
function attackMonster(run: Run, player: Player, floor: number, m: Monster): void {
  const st = player.state;
  // Striking an unaware monster (sleeping / wandering) lands a sneak attack; the
  // blow then wakes it regardless.
  const sneak = isUnaware(m.state);
  const attack = getClass(st.classId).attack;
  const net = netEnchant(0, st.strength, UNARMED_STR_REQ);
  m.state = 'hunting';

  if (!rollHit(weaponAccuracy(net), m.defense, run.combatRng)) {
    send(player.ws, { t: 'log', text: `You miss the ${m.name}.` });
    return;
  }
  let dmg = rollDamage(damageRange(attack, 2), net, run.combatRng);
  if (sneak) dmg *= sneakMultiplier(false);
  m.hp -= dmg;

  if (m.hp <= 0) {
    m.hp = 0;
    const list = run.monsters.get(floor);
    if (list) run.monsters.set(floor, list.filter((x) => x !== m));
    const reward = monsterReward(m.damage, m.boss);
    st.gold += reward;
    if (m.boss) {
      run.bossDefeated = true;
      broadcast(run, { t: 'log', text: `${st.name} slays the ${m.name}! An exit shimmers open. (+${reward}g)` });
    } else {
      const how = sneak ? 'ambush' : 'slay';
      send(player.ws, { t: 'log', text: `You ${how} the ${m.name} (−${dmg}). (+${reward}g)` });
    }
  } else {
    send(player.ws, { t: 'log', text: `You hit the ${m.name} for ${dmg}.${sneak ? ' (ambush!)' : ''}` });
  }
}

/** Add one item of a kind to a player's inventory (stacking by kind). */
function addToInventory(st: PlayerState, kindId: ItemKindId): void {
  const stack = st.inventory.find((s) => s.kindId === kindId);
  if (stack) stack.count += 1;
  else st.inventory.push({ kindId, count: 1 });
}

/** Remove one item of a kind; returns false if the player had none. */
function removeFromInventory(st: PlayerState, kindId: ItemKindId): boolean {
  const idx = st.inventory.findIndex((s) => s.kindId === kindId);
  if (idx < 0) return false;
  const stack = st.inventory[idx];
  stack.count -= 1;
  if (stack.count <= 0) st.inventory.splice(idx, 1);
  return true;
}

/** How this item is named to the player right now (disguise or true name). */
function itemLabel(run: Run, kindId: ItemKindId): string {
  return displayName(kindId, run.identities, run.discovered);
}

/** Collect any loot on the player's current cell. */
function collectLootHere(run: Run, player: Player): void {
  const st = player.state;
  const list = run.loot.get(st.level);
  if (!list) return;
  const idx = list.findIndex((l) => l.col === st.col && l.row === st.row);
  if (idx < 0) return;
  const [l] = list.splice(idx, 1);
  if (l.kind === 'gold') {
    st.gold += l.amount;
    send(player.ws, { t: 'log', text: `You pocket ${l.amount} gold.` });
  } else if (l.kindId) {
    addToInventory(st, l.kindId);
    send(player.ws, { t: 'log', text: `You find ${itemLabel(run, l.kindId)}.` });
  }
}

function handleMove(run: Run, player: Player, dcol: number, drow: number): void {
  const st = player.state;
  if (!st.alive) return; // the fallen do not move
  const level = getLevel(run.dungeon, st.level);
  const dx = Math.sign(dcol);
  const dy = Math.sign(drow);
  if (dx === 0 && dy === 0) return;
  // Face the way we're heading even if the step is blocked (turn in place).
  st.facing = headingOf(dx, dy);
  const nc = st.col + dx;
  const nr = st.row + dy;

  // Bump-to-attack: moving into a monster strikes it instead of moving. The
  // strike is your turn, so the world then advances.
  const foe = monsterAt(run, st.level, nc, nr);
  if (foe) {
    attackMonster(run, player, st.level, foe);
    endPlayerTurn(run, player);
    return;
  }
  if (blocksMove(level, nc, nr)) {
    // Bumping a wall spends no turn (Brogue-faithful) — just re-face.
    broadcastState(run);
    return;
  }

  st.col = nc;
  st.row = nr;
  st.elevation = elevationOn(level, nc, nr);

  // Hidden traps spring on entry. They sit on floor cells, so they never
  // coincide with a natural pit/water hazard — resolve them first.
  const trap = trapAt(trapsOn(run, st.level), nc, nr);
  if (trap && !trap.sprung) {
    springTrap(run, player, level, trap);
  } else {
    // Natural hazard resolution on entry.
    const haz = hazardAt(level, nc, nr);
    if (haz === 'pit') {
      fallThrough(
        run,
        player,
        level,
        nc,
        nr,
        (n) => `You plunge into the chasm and land on level ${n + 1}.`,
        `The pit is bottomless — you barely scramble clear.`,
      );
    } else if (haz === 'water') {
      send(player.ws, { t: 'log', text: `You wade through cold water.` });
    }
  }
  if (st.alive) {
    spotTraps(run, player);
    collectLootHere(run, player);
  }
  // A completed step is a turn — advance the world (monsters act, you regen).
  endPlayerTurn(run, player);
}

/** Drop a player through a hole at (nc,nr) — a chasm or a sprung trap door — to
 *  the floor below, landing on the nearest safe cell. With no floor beneath
 *  (deepest level), they scramble back to the level entry rather than die. */
function fallThrough(
  run: Run,
  player: Player,
  level: DungeonLevel,
  nc: number,
  nr: number,
  fellMsg: (landLevel: number) => string,
  bottomlessMsg: string,
): void {
  const st = player.state;
  const below = st.level + 1 < run.dungeon.levelCount ? getLevel(run.dungeon, st.level + 1) : null;
  if (below) {
    const land = nearestLanding(below, nc, nr);
    st.level += 1;
    st.col = land.col;
    st.row = land.row;
    st.elevation = elevationOn(below, land.col, land.row);
    ensureMonsters(run, st.level);
    send(player.ws, { t: 'log', text: fellMsg(st.level) });
  } else {
    const e = level.entry;
    st.col = e.col;
    st.row = e.row;
    st.elevation = elevationOn(level, e.col, e.row);
    send(player.ws, { t: 'log', text: bottomlessMsg });
  }
}

/** Trigger a hidden trap the player just stepped on (marks it spent + shown).
 *  A pit trap drops them a floor; a dart trap deals damage (potentially fatal
 *  — permadeath, mirroring monster kills). */
function springTrap(run: Run, player: Player, level: DungeonLevel, trap: Trap): void {
  const st = player.state;
  trap.sprung = true;
  trap.revealed = true;
  if (trap.kind === 'pit') {
    fallThrough(
      run,
      player,
      level,
      trap.col,
      trap.row,
      (n) => `A trap door drops open beneath you — you fall to level ${n + 1}!`,
      `The trap shaft is bottomless — you barely scramble clear.`,
    );
    return;
  }
  const dmg = dartDamage(st.level);
  st.hp -= dmg;
  if (st.hp <= 0) {
    st.hp = 0;
    st.alive = false;
    broadcast(run, { t: 'log', text: `☠ ${st.name} was skewered by a dart trap on level ${st.level + 1}.` });
  } else {
    send(player.ws, { t: 'log', text: `Darts hiss from the wall! (−${dmg} HP)` });
  }
}

/** Reveal (without springing) any armed traps adjacent to the player's new
 *  cell — you notice the pressure plate before your weight settles on it. */
function spotTraps(run: Run, player: Player): void {
  const st = player.state;
  for (const t of trapsOn(run, st.level)) {
    if (t.revealed) continue;
    if (Math.max(Math.abs(t.col - st.col), Math.abs(t.row - st.row)) <= 1) {
      t.revealed = true;
      send(player.ws, { t: 'log', text: `You spot ${t.kind === 'pit' ? 'a trap door' : 'a dart trap'} nearby.` });
    }
  }
}

function cheb(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function goTo(run: Run, player: Player, level: number, at: { col: number; row: number }): void {
  const lvl = getLevel(run.dungeon, level);
  const st = player.state;
  st.level = level;
  st.col = at.col;
  st.row = at.row;
  st.elevation = elevationOn(lvl, at.col, at.row);
  ensureMonsters(run, level);
}

/** Move a hub-bound (camp) player onto dungeon floor 0. Shared by the spatial
 *  portal interact and the hub screen's explicit 'descend' intent, so both
 *  paths stay identical and server-authoritative. No-op unless in the camp. */
function descendFromCamp(run: Run, player: Player): void {
  const st = player.state;
  if (!st.alive || st.level !== CAMP_DEPTH) return;
  const f0 = getLevel(run.dungeon, 0);
  goTo(run, player, 0, f0.entry);
  broadcast(run, { t: 'log', text: `${st.name} descends into the dungeon.` });
  broadcastState(run);
}

/** Buy one sealed, UNIDENTIFIED potion from the camp Provisioner (Brogue has no
 *  labelled shop stock — you gamble on the disguise). Deterministic per purchase
 *  via the run's purchase counter. No-op unless in the camp. */
function buyPotion(run: Run, player: Player): void {
  const st = player.state;
  if (!st.alive || st.level !== CAMP_DEPTH) return;
  if (st.gold >= POTION_COST) {
    st.gold -= POTION_COST;
    const kindId = randomPotionKind(`${run.seed}#shop#${run.purchases++}`);
    addToInventory(st, kindId);
    send(player.ws, { t: 'log', text: `Provisioner: "A sealed flask, ${POTION_COST}g. What's inside? Who knows."` });
    broadcastState(run);
  } else {
    send(player.ws, { t: 'log', text: `Provisioner: "A potion runs ${POTION_COST}g — you're short."` });
  }
}

function handleInteract(run: Run, player: Player): void {
  const st = player.state;
  if (!st.alive) return;
  const level = getLevel(run.dungeon, st.level);

  // ── Base camp: descent portal + shops. ──────────────────────────────────
  if (level.camp) {
    if (level.portal && cheb(st, level.portal) <= 1) {
      descendFromCamp(run, player);
      return;
    }
    const shop = level.shops?.find((s) => cheb(st, s) <= 1);
    if (shop) {
      // The Provisioner sells sealed mystery potions; the Smith isn't stocked yet.
      if (shop.name === 'Provisioner') buyPotion(run, player);
      else send(player.ws, { t: 'log', text: `${shop.name}: "Not stocked yet, delver — soon."` });
      return;
    }
    return;
  }

  // ── Exit portal (bottom floor, after the boss falls) → escape. ───────────
  if (level.exit && st.col === level.exit.col && st.row === level.exit.row) {
    if (run.bossDefeated) {
      broadcast(run, { t: 'victory', by: st.name });
      const camp = getLevel(run.dungeon, CAMP_DEPTH);
      goTo(run, player, CAMP_DEPTH, camp.entry);
      send(player.ws, { t: 'log', text: `You escape to the surface, victorious!` });
      broadcastState(run);
    } else {
      send(player.ws, { t: 'log', text: `The portal is sealed — the Warden still stirs.` });
    }
    return;
  }

  // ── Stairs. Floor 0's up-stair retreats to the base camp. ────────────────
  const cell = cellAt(level, st.col, st.row);
  if (!cell) return;
  if (cell.kind === 'stairsDown' && st.level + 1 < run.dungeon.levelCount) {
    const below = getLevel(run.dungeon, st.level + 1);
    goTo(run, player, st.level + 1, below.stairsUp ?? below.entry);
    send(player.ws, { t: 'log', text: `You descend to level ${st.level + 2}.` });
    broadcastState(run);
  } else if (cell.kind === 'stairsUp') {
    if (st.level === 0) {
      const camp = getLevel(run.dungeon, CAMP_DEPTH);
      goTo(run, player, CAMP_DEPTH, camp.entry);
      broadcast(run, { t: 'log', text: `${st.name} retreats to the base camp.` });
      broadcastState(run);
    } else {
      const above = getLevel(run.dungeon, st.level - 1);
      goTo(run, player, st.level - 1, above.stairsDown ?? above.entry);
      send(player.ws, { t: 'log', text: `You climb to level ${st.level + 1}.` });
      broadcastState(run);
    }
  }
}

/** A random walkable (non-hazard) cell on a floor — the destination for a Scroll
 *  of Teleportation. Seeded by the tick so it varies between reads but stays
 *  reproducible. Returns null if the floor has no open cell. */
function randomWalkable(run: Run, level: DungeonLevel, floor: number): { col: number; row: number } | null {
  const rng = makeRng(`${run.seed}#tp#${floor}#${run.tick}`);
  const open: number[] = [];
  for (let i = 0; i < level.cells.length; i++) {
    const k = level.cells[i].kind;
    if (k === 'floor' || k === 'ledge' || k === 'stairsUp' || k === 'stairsDown') open.push(i);
  }
  if (open.length === 0) return null;
  const idx = open[rng.int(0, open.length - 1)];
  return { col: idx % level.cols, row: Math.floor(idx / level.cols) };
}

/** Apply a used item's world effect. Returns true if it actually fired (so the
 *  caller consumes it + identifies the kind); false to decline (e.g. a Scroll of
 *  Identify with nothing left to reveal). Effect resolution is server-authoritative. */
function applyItemEffect(run: Run, player: Player, kindId: ItemKindId): boolean {
  const st = player.state;
  const level = getLevel(run.dungeon, st.level);
  switch (kindId) {
    case 'life': {
      const { hp, hpMax } = potionOfLife(st.hpMax);
      st.hpMax = hpMax;
      st.hp = hp;
      send(player.ws, { t: 'log', text: `Warmth floods you — your maximum health rises to ${hpMax}.` });
      return true;
    }
    case 'strength': {
      st.strength = potionOfStrength(st.strength);
      send(player.ws, { t: 'log', text: `Power surges through your muscles. (Strength ${st.strength})` });
      return true;
    }
    case 'descent': {
      send(player.ws, { t: 'log', text: `The floor dissolves beneath you!` });
      fallThrough(
        run,
        player,
        level,
        st.col,
        st.row,
        (n) => `You sink through the dark to level ${n + 1}.`,
        `The floor reknits — there is nowhere deeper to fall.`,
      );
      return true;
    }
    case 'teleportation': {
      const dest = randomWalkable(run, level, st.level);
      if (dest) {
        st.col = dest.col;
        st.row = dest.row;
        st.elevation = elevationOn(level, dest.col, dest.row);
      }
      send(player.ws, { t: 'log', text: `Reality folds — you blink to somewhere else on the level.` });
      return true;
    }
    case 'aggravateMonsters': {
      for (const m of monstersOn(run, st.level)) m.state = 'hunting';
      send(player.ws, { t: 'log', text: `A shrill alarm rings out — every monster on the level is now hunting you!` });
      return true;
    }
    case 'identify': {
      // Reveal the first carried, still-unknown kind other than the scroll itself.
      const target = st.inventory.find((s) => s.kindId !== 'identify' && !run.discovered.has(s.kindId));
      if (target) {
        run.discovered.add(target.kindId);
        send(player.ws, { t: 'log', text: `The scroll reveals: ${ITEM_KIND_BY_ID[target.kindId].name}.` });
      } else {
        send(player.ws, { t: 'log', text: `You read the scroll of identify.` });
      }
      return true; // always consumed; reading also self-IDs the scroll (use-ID)
    }
  }
  return false;
}

/** Use (quaff/read) one carried item by kind. Validates possession, applies the
 *  effect, then consumes it and — via use-ID — reveals the kind to the party. */
function handleUseItem(run: Run, player: Player, kindId: string): void {
  const st = player.state;
  if (!st.alive || !isItemKind(kindId)) return;
  const stack = st.inventory.find((s) => s.kindId === kindId);
  if (!stack || stack.count <= 0) return;

  const wasUnknown = !run.discovered.has(kindId);
  if (!applyItemEffect(run, player, kindId)) return; // declined → not consumed
  removeFromInventory(st, kindId);
  run.discovered.add(kindId); // use-ID: using an item teaches its kind
  if (wasUnknown) {
    broadcast(run, { t: 'log', text: `${st.name} learns it was ${ITEM_KIND_BY_ID[kindId].name}.` });
  }
  // Quaffing/reading is a turn — advance the world.
  endPlayerTurn(run, player);
}

/** Pass a turn in place (rest): the world advances, you regenerate, and nearby
 *  monsters close in. No-op if dead. */
function handleWait(run: Run, player: Player): void {
  if (!player.state.alive) return;
  endPlayerTurn(run, player);
}

// ── Turn engine (energy scheduler) ───────────────────────────────────────────
// Time is turn-based: it advances ONLY when a delver acts. A player action costs
// a number of ticks (a normal turn = 100); the world then runs every monster on
// that floor whose energy comes due within that window (energy.ts). Fast monsters
// would get extra turns, slow ones fewer — the decoupled timing Brogue is built
// on (all current monsters act at the normal rate; per-kind speeds land with the
// monster-catalog port).

/** One monster bites an adjacent delver: an accuracy roll vs the player's
 *  defense, then a clumped damage roll. Player HP reaching 0 is permadeath. */
function monsterBite(run: Run, floor: number, m: Monster, target: Player): void {
  const st = target.state;
  if (!rollHit(m.accuracy, PLAYER_DEFENSE, run.combatRng)) {
    send(target.ws, { t: 'log', text: `The ${m.name} lunges — and misses.` });
    return;
  }
  const dmg = rollDamage(damageRange(m.damage, 1), 0, run.combatRng);
  st.hp -= dmg;
  if (st.hp <= 0 && st.alive) {
    st.hp = 0;
    st.alive = false;
    broadcast(run, { t: 'log', text: `☠ ${st.name} was slain by a ${m.name} on level ${floor + 1}.` });
  } else {
    send(target.ws, { t: 'log', text: `The ${m.name} hits you for ${dmg}.` });
  }
}

/** Run a single monster's turn: update awareness (sleep → wander → hunt off
 *  proximity + line of sight to the nearest delver), then bite an adjacent
 *  target or step toward it. Returns the ticks the action costs (its next-turn
 *  delay). A sleeper simply passes. */
function actMonster(
  run: Run,
  floor: number,
  level: DungeonLevel,
  m: Monster,
  occupied: Set<number>,
  targets: Player[],
): number {
  if (m.hp <= 0) return TICKS_PER_TURN;
  let best: Player | null = null;
  let bd = Infinity;
  for (const t of targets) {
    if (!t.state.alive) continue;
    const d = cheb(m, t.state);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  if (!best) return TICKS_PER_TURN;

  // Update awareness. The boss is a fixed guardian — always hunting.
  if (!m.boss) {
    const los = hasLineOfSight(m, best.state, (c, r) => occluderHeight(level, c, r), 0, best.state.elevation);
    m.state = nextAwareness(m.state, { dist: bd, los, aggro: AGGRO });
  }
  if (m.state === 'sleeping') return TICKS_PER_TURN; // dozing: pass the turn

  if (bd <= 1) {
    monsterBite(run, floor, m, best);
  } else if (bd <= AGGRO) {
    // Pursue: prefer the diagonal, then a single axis.
    const dx = Math.sign(best.state.col - m.col);
    const dy = Math.sign(best.state.row - m.row);
    const tryStep = (cc: number, rr: number): boolean => {
      if (cc === m.col && rr === m.row) return false;
      if (blocksMove(level, cc, rr)) return false;
      const key = rr * level.cols + cc;
      if (occupied.has(key)) return false;
      if (targets.some((t) => t.state.col === cc && t.state.row === rr)) return false;
      occupied.delete(m.row * level.cols + m.col);
      m.col = cc;
      m.row = rr;
      occupied.add(key);
      return true;
    };
    tryStep(m.col + dx, m.row + dy) || tryStep(m.col + dx, m.row) || tryStep(m.col, m.row + dy);
  }
  return TICKS_PER_TURN;
}

/** Advance the monsters on `floor` by `elapsed` ticks (the cost of the player's
 *  action): each monster whose energy comes due acts, in scheduler order, until
 *  the player's next turn arrives. The player is a placeholder actor at index 0
 *  so `runUntilPlayer` stops once `elapsed` has passed. */
function takeMonsterTurns(run: Run, floor: number, elapsed: number): void {
  if (floor < 0) return; // camp is safe
  ensureMonsters(run, floor);
  const level = getLevel(run.dungeon, floor);
  const monsters = monstersOn(run, floor).filter((m) => m.hp > 0);
  const targets = [...run.players.values()].filter((p) => p.state.alive && p.state.level === floor);
  if (monsters.length === 0 || targets.length === 0) return;

  const occupied = new Set(monsters.map((m) => m.row * level.cols + m.col));
  const playerProxy: Scheduled = { ticksUntilTurn: elapsed };
  const actors: Scheduled[] = [playerProxy, ...monsters];
  runUntilPlayer(actors, 0, (i) => actMonster(run, floor, level, monsters[i - 1], occupied, targets));
}

/** Passive regeneration: a delver heals `maxHP` over TURNS_FOR_FULL_REGEN turns
 *  of rest. Accumulated fractionally so small maxHP still heals eventually. */
function maybeRegen(player: Player): void {
  const st = player.state;
  if (!st.alive || st.hp >= st.hpMax) {
    player.regenAcc = 0;
    return;
  }
  player.regenAcc += st.hpMax;
  while (player.regenAcc >= TURNS_FOR_FULL_REGEN && st.hp < st.hpMax) {
    st.hp += 1;
    player.regenAcc -= TURNS_FOR_FULL_REGEN;
  }
}

/** Context handed to each per-turn world system. */
interface TurnContext {
  run: Run;
  player: Player;
  /** Ticks the player's action cost — the amount of time that elapses. */
  cost: number;
}

/** A per-turn world system: one slice of "what happens when time passes".
 *  Extension seam — new time-based systems (terrain spread, hunger drain,
 *  status-effect decay, scent diffusion) register here as one line each, instead
 *  of being woven into `endPlayerTurn`. Systems run in order, before the state
 *  broadcast. */
type WorldSystem = (ctx: TurnContext) => void;

const WORLD_SYSTEMS: WorldSystem[] = [
  // Monsters on the delver's floor act, spending the elapsed time.
  ({ run, player, cost }) => takeMonsterTurns(run, player.state.level, cost),
  // The delver regenerates a sliver of health.
  ({ player }) => maybeRegen(player),
];

/** End a player's turn: the action is done, so time passes — every world system
 *  runs, then the new state is broadcast. Transitions (stairs/portals/camp) do
 *  NOT call this — they broadcast directly, since you're leaving the floor. */
function endPlayerTurn(run: Run, player: Player, cost: number = TICKS_PER_TURN): void {
  const ctx: TurnContext = { run, player, cost };
  for (const system of WORLD_SYSTEMS) system(ctx);
  broadcastState(run);
}

/** Attach the game WebSocket server to an HTTP server (dev, preview, or prod).
 *  The WebSocketServer + its connection handler are a process singleton (so
 *  run state survives HMR), but the `upgrade` listener is (re)wired onto every
 *  HTTP server passed in — Vite hands us a NEW http server on each config
 *  restart, and that server needs its own listener or `/ws` goes dead. */
export function attachGameWSS(httpServer: HttpServer): WebSocketServer {
  const marked = httpServer as HttpServer & { __delveWss?: WebSocketServer };
  // One wss per HTTP server. A fresh HTTP server (new process, or Vite's
  // in-process restart after a server-code edit) gets a fresh wss built from
  // the current module — so server logic never goes stale.
  if (marked.__delveWss) return marked.__delveWss;
  const wss = createWss();
  marked.__delveWss = wss;
  // No wall-clock heartbeat: the game is turn-based. Monsters act only when a
  // delver spends a turn (see endPlayerTurn / takeMonsterTurns).
  httpServer.on('upgrade', (req, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    } catch {
      return;
    }
    if (pathname !== '/ws') return; // leave HMR / other sockets alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  return wss;
}

// ── Intent registry ──────────────────────────────────────────────────────────
// Post-join client intents → their authoritative handlers. Extension seam: a new
// intent is declared in protocol.ts and registered here as ONE entry, instead of
// growing a switch. ('join' is handled separately, before a player exists.)

interface IntentContext {
  run: Run;
  player: Player;
}
type IntentHandler<K extends ClientMsg['t']> = (ctx: IntentContext, msg: Extract<ClientMsg, { t: K }>) => void;
type IntentRegistry = { [K in ClientMsg['t']]?: IntentHandler<K> };

const INTENTS: IntentRegistry = {
  move: ({ run, player }, msg) => handleMove(run, player, msg.dcol, msg.drow),
  interact: ({ run, player }) => handleInteract(run, player),
  'use-item': ({ run, player }, msg) => handleUseItem(run, player, msg.kindId),
  wait: ({ run, player }) => handleWait(run, player),
  descend: ({ run, player }) => descendFromCamp(run, player),
  // Only the potion shop is stocked; guard the item so an unknown value can't be honoured.
  buy: ({ run, player }, msg) => {
    if (msg.item === 'potion') buyPotion(run, player);
  },
  chat: ({ run, player }, msg) => {
    const text = String(msg.text || '').slice(0, MAX_CHAT_LEN).trim();
    if (text) broadcast(run, { t: 'chat', from: player.state.id, name: player.state.name, text, at: Date.now() });
  },
  ping: ({ player }) => send(player.ws, { t: 'pong' }),
};

/** Route one post-join intent to its registered handler (no-op for an unknown or
 *  unregistered message type). The cast bridges the runtime discriminant to the
 *  per-variant handler; each handler body is still type-checked against its
 *  specific message shape via the registry's mapped type. */
function dispatchIntent(run: Run, player: Player, msg: ClientMsg): void {
  const handler = INTENTS[msg.t] as ((ctx: IntentContext, msg: ClientMsg) => void) | undefined;
  handler?.({ run, player }, msg);
}

/** Build the singleton WebSocketServer (noServer: we drive handleUpgrade
 *  ourselves so we never touch Vite's HMR socket) and wire its message loop. */
function createWss(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket) => {
    let joined: { run: Run; player: Player } | null = null;

    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!joined) {
        if (msg.t !== 'join') return;
        const code = String(msg.code || '').trim().toUpperCase().slice(0, 12);
        if (!code) {
          send(ws, { t: 'error', message: 'Missing join code.' });
          return;
        }
        joined = joinRun(code, msg.seed, String(msg.name || ''), msg.classId, ws);
        send(ws, {
          t: 'welcome',
          playerId: joined.player.state.id,
          seed: joined.run.seed,
          levelCount: joined.run.dungeon.levelCount,
        });
        broadcastState(joined.run);
        broadcast(joined.run, { t: 'log', text: `${joined.player.state.name} entered the dungeon.` });
        return;
      }

      dispatchIntent(joined.run, joined.player, msg);
    });

    ws.on('close', () => {
      if (!joined) return;
      const { run, player } = joined;
      run.players.delete(player.state.id);
      broadcast(run, { t: 'log', text: `${player.state.name} left.` });
      if (run.players.size === 0) runs.delete(run.code);
      else broadcastState(run);
    });
  });

  return wss;
}
