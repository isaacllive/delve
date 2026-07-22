// Reactive WebSocket client for a run. Runes-based ($state) so components can
// read `players` / `log` / `chat` directly and re-render on server updates.
// The server (src/lib/server/gameServer.ts) is authoritative; this client
// sends intents and mirrors the broadcast state.

import type { ClientMsg, HazardCell, LootState, MonsterState, PlayerState, ServerMsg, TrapState } from './game/protocol.ts';
import type { ItemKindId } from './game/items.ts';

export interface ChatLine {
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

export class GameClient {
  players = $state<PlayerState[]>([]);
  monsters = $state<MonsterState[]>([]);
  loot = $state<LootState[]>([]);
  /** Revealed traps (sprung or spotted) on the local delver's floor. */
  traps = $state<TrapState[]>([]);
  /** Item kinds the party has identified this run (shared knowledge). */
  discovered = $state<ItemKindId[]>([]);
  /** Live fire/gas cells on the local delver's floor. */
  hazards = $state<HazardCell[]>([]);
  youId = $state<string | null>(null);
  seed = $state<string | null>(null);
  levelCount = $state(0);
  chat = $state<ChatLine[]>([]);
  connected = $state(false);
  error = $state<string | null>(null);
  /** Bumped on every 'state' broadcast so renderers can cheaply detect change. */
  tick = $state(0);
  /** True once the bottom-floor boss has been beaten (opens the exit portal). */
  bossDefeated = $state(false);
  /** Set to the winner's name when someone completes the run. */
  won = $state<string | null>(null);

  private ws?: WebSocket;
  private code = '';
  private name = '';
  private seedReq?: string;
  private classId?: string;
  private retry = 0;

  get me(): PlayerState | undefined {
    return this.players.find((p) => p.id === this.youId);
  }

  /** True once the local character has been slain (permadeath). */
  get dead(): boolean {
    const m = this.me;
    return !!m && !m.alive;
  }

  connect(code: string, name: string, seed?: string, classId?: string): void {
    this.code = code;
    this.name = name;
    this.seedReq = seed;
    this.classId = classId;
    this.open();
  }

  private open(): void {
    if (typeof window === 'undefined') return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.send({ t: 'join', code: this.code, name: this.name, seed: this.seedReq, classId: this.classId });
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerMsg);
    ws.onclose = () => {
      this.connected = false;
      // Reconnect with a small backoff (dev HMR, flaky links).
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => this.open(), 300 * this.retry);
    };
    ws.onerror = () => ws.close();
  }

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.youId = msg.playerId;
        this.seed = msg.seed;
        this.levelCount = msg.levelCount;
        break;
      case 'state':
        this.youId = msg.you;
        this.players = msg.players;
        this.monsters = msg.monsters;
        this.loot = msg.loot;
        this.traps = msg.traps;
        this.discovered = msg.discovered;
        this.hazards = msg.hazards;
        this.tick = msg.tick;
        this.bossDefeated = msg.bossDefeated;
        break;
      case 'chat':
        this.pushChat({ name: msg.name, text: msg.text, at: msg.at });
        break;
      case 'log':
        this.pushChat({ name: '', text: msg.text, at: Date.now(), system: true });
        break;
      case 'victory':
        this.won = msg.by;
        this.pushChat({ name: '', text: `${msg.by} conquered the dungeon!`, at: Date.now(), system: true });
        break;
      case 'error':
        this.error = msg.message;
        break;
      case 'pong':
        break;
    }
  }

  private pushChat(line: ChatLine): void {
    this.chat = [...this.chat.slice(-80), line];
  }

  private send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  move(dcol: number, drow: number): void {
    this.send({ t: 'move', dcol, drow });
  }
  interact(): void {
    this.send({ t: 'interact' });
  }
  /** Use (quaff/read) a carried item by its kind. */
  useItem(kindId: ItemKindId): void {
    this.send({ t: 'use-item', kindId });
  }
  /** Equip (or unequip) a carried gear instance by id. */
  equip(instId: string): void {
    this.send({ t: 'equip', instId });
  }
  /** Hurl a carried potion in the facing direction. */
  throwItem(kindId: ItemKindId): void {
    this.send({ t: 'throw', kindId });
  }
  /** Pass a turn in place (rest). */
  wait(): void {
    this.send({ t: 'wait' });
  }
  /** Leave the out-of-dungeon hub and drop into floor 0. */
  descend(): void {
    this.send({ t: 'descend' });
  }
  /** Buy an item from a hub shop (menu-driven, no walking to the stall). */
  buy(item: 'potion'): void {
    this.send({ t: 'buy', item });
  }
  sendChat(text: string): void {
    const t = text.trim();
    if (t) this.send({ t: 'chat', text: t });
  }
  disconnect(): void {
    const ws = this.ws;
    this.ws = undefined;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    this.connected = false;
  }
}
