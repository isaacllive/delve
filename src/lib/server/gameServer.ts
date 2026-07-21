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
import { blocksMove, cellAt, hazardAt } from '../game/terrain.ts';
import { getClass } from '../game/classes.ts';
import { spawnMonsters, type Monster } from '../game/monsters.ts';
import {
  monsterReward,
  POTION_COST,
  POTION_HEAL,
  spawnLoot,
  type Loot,
} from '../game/loot.ts';
import {
  headingOf,
  MAX_CHAT_LEN,
  MAX_NAME_LEN,
  type ClientMsg,
  type LootState,
  type MonsterState,
  type PlayerState,
  type ServerMsg,
} from '../game/protocol.ts';

/** Aggro range (cells) within which a monster chases a player. */
const AGGRO = 9;

interface Player {
  state: PlayerState;
  ws: WebSocket;
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

/** Spawn a floor's monsters + loot on first visit (never for the camp). */
function ensureMonsters(run: Run, floor: number): void {
  if (floor < 0 || run.monsters.has(floor)) return;
  const level = getLevel(run.dungeon, floor);
  run.monsters.set(floor, spawnMonsters(run.seed, level));
  run.loot.set(floor, spawnLoot(run.seed, level));
}

function toMonsterState(m: Monster, floor: number): MonsterState {
  return { id: m.id, name: m.name, color: m.color, level: floor, col: m.col, row: m.row, hp: m.hp, hpMax: m.hpMax, boss: m.boss };
}
function toLootState(l: Loot, floor: number): LootState {
  return { id: l.id, kind: l.kind, col: l.col, row: l.row, level: floor };
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
    gold: 0,
    potions: 1,
    facing: 0, // face north — toward the camp's descent portal
    alive: true,
  };
  const player: Player = { state, ws };
  run.players.set(id, player);
  return { run, player };
}

/** A living monster occupying (col,row) on a floor, if any. */
function monsterAt(run: Run, floor: number, col: number, row: number): Monster | undefined {
  return monstersOn(run, floor).find((m) => m.hp > 0 && m.col === col && m.row === row);
}

/** Player bump-attacks a monster. On kill, remove it, drop gold; the boss opens
 *  the exit. */
function attackMonster(run: Run, player: Player, floor: number, m: Monster): void {
  const dmg = getClass(player.state.classId).attack;
  m.hp -= dmg;
  if (m.hp <= 0) {
    m.hp = 0;
    const list = run.monsters.get(floor);
    if (list) run.monsters.set(floor, list.filter((x) => x !== m));
    const reward = monsterReward(m.damage, m.boss);
    player.state.gold += reward;
    if (m.boss) {
      run.bossDefeated = true;
      broadcast(run, { t: 'log', text: `${player.state.name} slays the ${m.name}! An exit shimmers open. (+${reward}g)` });
    } else {
      send(player.ws, { t: 'log', text: `You strike down the ${m.name}. (+${reward}g)` });
    }
  }
  broadcastState(run);
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
  } else {
    st.potions += 1;
    send(player.ws, { t: 'log', text: `You find a healing potion.` });
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

  // Bump-to-attack: moving into a monster strikes it instead of moving.
  const foe = monsterAt(run, st.level, nc, nr);
  if (foe) {
    attackMonster(run, player, st.level, foe);
    return;
  }
  if (blocksMove(level, nc, nr)) {
    broadcastState(run); // still broadcast the turn-in-place
    return;
  }

  st.col = nc;
  st.row = nr;
  st.elevation = elevationOn(level, nc, nr);

  // Hazard resolution on entry.
  const haz = hazardAt(level, nc, nr);
  if (haz === 'pit') {
    const below = st.level + 1 < run.dungeon.levelCount ? getLevel(run.dungeon, st.level + 1) : null;
    if (below) {
      const land = nearestLanding(below, nc, nr);
      st.level += 1;
      st.col = land.col;
      st.row = land.row;
      st.elevation = elevationOn(below, land.col, land.row);
      ensureMonsters(run, st.level);
      send(player.ws, { t: 'log', text: `You plunge into the chasm and land on level ${st.level + 1}.` });
    } else {
      // No level below — scramble back to the level entry rather than die.
      const e = level.entry;
      st.col = e.col;
      st.row = e.row;
      st.elevation = elevationOn(level, e.col, e.row);
      send(player.ws, { t: 'log', text: `The pit is bottomless — you barely scramble clear.` });
    }
  } else if (haz === 'water') {
    send(player.ws, { t: 'log', text: `You wade through cold water.` });
  }
  collectLootHere(run, player);
  broadcastState(run);
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

function handleInteract(run: Run, player: Player): void {
  const st = player.state;
  if (!st.alive) return;
  const level = getLevel(run.dungeon, st.level);

  // ── Base camp: descent portal + shops. ──────────────────────────────────
  if (level.camp) {
    if (level.portal && cheb(st, level.portal) <= 1) {
      const f0 = getLevel(run.dungeon, 0);
      goTo(run, player, 0, f0.entry);
      broadcast(run, { t: 'log', text: `${st.name} descends into the dungeon.` });
      broadcastState(run);
      return;
    }
    const shop = level.shops?.find((s) => cheb(st, s) <= 1);
    if (shop) {
      // The Provisioner sells healing potions; the Smith isn't stocked yet.
      if (shop.name === 'Provisioner') {
        if (st.gold >= POTION_COST) {
          st.gold -= POTION_COST;
          st.potions += 1;
          send(player.ws, { t: 'log', text: `Provisioner: "A potion, ${POTION_COST}g. Stay alive down there."` });
          broadcastState(run);
        } else {
          send(player.ws, { t: 'log', text: `Provisioner: "A potion runs ${POTION_COST}g — you're short."` });
        }
      } else {
        send(player.ws, { t: 'log', text: `${shop.name}: "Not stocked yet, delver — soon."` });
      }
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

/** Quaff a healing potion (no-op if none, dead, or already at full HP). */
function handleUsePotion(run: Run, player: Player): void {
  const st = player.state;
  if (!st.alive || st.potions <= 0 || st.hp >= st.hpMax) return;
  st.potions -= 1;
  st.hp = Math.min(st.hpMax, st.hp + POTION_HEAL);
  send(player.ws, { t: 'log', text: `You quaff a potion (+${POTION_HEAL} HP).` });
  broadcastState(run);
}

// ── Monster AI tick ─────────────────────────────────────────────────────────

/** Advance one run's monsters: chase the nearest living player on their floor
 *  and bite when adjacent. Player HP hitting 0 is permadeath. */
function tickRun(run: Run): void {
  let changed = false;
  const floors = new Set(
    [...run.players.values()].filter((p) => p.state.level >= 0).map((p) => p.state.level),
  );
  for (const floor of floors) {
    ensureMonsters(run, floor);
    const level = getLevel(run.dungeon, floor);
    const mons = monstersOn(run, floor);
    const targets = [...run.players.values()].filter((p) => p.state.alive && p.state.level === floor);
    if (targets.length === 0 || mons.length === 0) continue;

    const occupied = new Set(mons.map((m) => m.row * level.cols + m.col));
    for (const m of mons) {
      if (m.hp <= 0) continue;
      let best: Player | null = null;
      let bd = Infinity;
      for (const t of targets) {
        const d = cheb(m, t.state);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (!best) continue;
      if (bd <= 1) {
        // Attack.
        best.state.hp -= m.damage;
        changed = true;
        if (best.state.hp <= 0 && best.state.alive) {
          best.state.hp = 0;
          best.state.alive = false;
          broadcast(run, { t: 'log', text: `☠ ${best.state.name} was slain by a ${m.name} on level ${floor + 1}.` });
        }
      } else if (bd <= AGGRO) {
        // Step toward the target (prefer the diagonal, then a single axis).
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
        if (tryStep(m.col + dx, m.row + dy) || tryStep(m.col + dx, m.row) || tryStep(m.col, m.row + dy)) {
          changed = true;
        }
      }
    }
  }
  if (changed) broadcastState(run);
}

/** Global monster-AI heartbeat, guarded so HMR doesn't stack intervals. */
function startTicker(): void {
  const gg = globalThis as unknown as { __delveTicker?: ReturnType<typeof setInterval> };
  if (gg.__delveTicker) clearInterval(gg.__delveTicker);
  gg.__delveTicker = setInterval(() => {
    for (const run of runs.values()) tickRun(run);
  }, 500);
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
  startTicker();
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

      const { run, player } = joined;
      switch (msg.t) {
        case 'move':
          handleMove(run, player, msg.dcol, msg.drow);
          break;
        case 'interact':
          handleInteract(run, player);
          break;
        case 'use':
          handleUsePotion(run, player);
          break;
        case 'chat': {
          const text = String(msg.text || '').slice(0, MAX_CHAT_LEN).trim();
          if (text) broadcast(run, { t: 'chat', from: player.state.id, name: player.state.name, text, at: Date.now() });
          break;
        }
        case 'ping':
          send(ws, { t: 'pong' });
          break;
      }
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
