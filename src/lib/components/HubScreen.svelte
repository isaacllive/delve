<script lang="ts">
  // The out-of-dungeon HUB: a dedicated 2D screen shown whenever the local
  // player is at CAMP_DEPTH (the safe surface camp). No 3D dungeon, no monsters
  // here — it's a menu for staging the party, restocking, and descending. All
  // actions are server-authoritative intents (client.descend / client.buy);
  // this screen never mutates game state directly.
  import type { GameClient } from '$lib/net.svelte.ts';
  import { getClass } from '$lib/game/classes.ts';
  import { CAMP_DEPTH } from '$lib/game/dungeon.ts';
  import { POTION_COST } from '$lib/game/loot.ts';

  let {
    client,
    onChat,
  }: {
    client: GameClient;
    onChat: (text: string) => void;
  } = $props();

  let chatText = $state('');
  const me = $derived(client.me);
  const myClass = $derived(getClass(me?.classId));
  const canAfford = $derived((me?.gold ?? 0) >= POTION_COST);
  const potionTotal = $derived(me ? Object.values(me.potions).reduce((n, c) => n + c, 0) : 0);

  function submitChat(e: Event) {
    e.preventDefault();
    if (!chatText.trim()) return;
    onChat(chatText);
    chatText = '';
  }

  function statusOf(level: number): string {
    return level <= CAMP_DEPTH ? 'In camp' : `Delving · L${level + 1}`;
  }
</script>

<div class="hub">
  <div class="frame">
    <header>
      <h1>🏕 Base Camp</h1>
      <p class="safe">A safe haven on the surface — no monsters stalk here. Rest, restock, then descend together.</p>
      <div class="seed">seed: {client.seed ?? '…'} · run {client.levelCount} floors deep</div>
    </header>

    <div class="cols">
      <!-- Party staging ------------------------------------------------------->
      <section class="party">
        <h2>Party <span class="count">{client.players.length}</span></h2>
        <ul>
          {#each client.players as p (p.id)}
            <li class:me={p.id === client.youId}>
              <i class="dot" style="background:{p.color}"></i>
              <span class="pname">{p.name}</span>
              <span class="pclass">{getClass(p.classId).name}</span>
              <span class="pstatus" class:delving={p.level > CAMP_DEPTH}>{statusOf(p.level)}</span>
            </li>
          {/each}
        </ul>
      </section>

      <!-- Your delver + shop -------------------------------------------------->
      <section class="you">
        {#if me}
          <div class="sheet" style="--accent:{myClass.accent}">
            <div class="sheet-head">
              <b>{myClass.name}</b>
              <span class="role">{myClass.role}</span>
            </div>
            <p class="blurb">{myClass.blurb}</p>
            <div class="stats">
              <span class="stat hp">♥ {me.hp}/{me.hpMax}</span>
              <span class="stat">🪙 {me.gold}g</span>
              <span class="stat">🧪 {potionTotal}</span>
            </div>
            <div class="abilities">
              {#each myClass.abilities as ab (ab.name)}
                <span class="chip" title={ab.desc}>{ab.name}</span>
              {/each}
            </div>
          </div>

          <div class="shop">
            <h2>Provisioner</h2>
            <button class="buy" disabled={!canAfford} onclick={() => client.buy('potion')}>
              Buy Healing Potion
              <span class="price" class:short={!canAfford}>{POTION_COST}g</span>
            </button>
            {#if !canAfford}<p class="hint">Not enough gold — bring back more from the depths.</p>{/if}
          </div>
        {:else}
          <p class="hint">Joining the camp…</p>
        {/if}
      </section>
    </div>

    <footer>
      <button class="descend" disabled={!me?.alive} onclick={() => client.descend()}>
        ⛓ Descend into the Dungeon
      </button>
      <a class="leave" href="/">← leave run</a>
    </footer>

    <!-- Camp chat ------------------------------------------------------------->
    <div class="chat">
      <div class="log">
        {#each client.chat.slice(-6) as line (line.at + line.text)}
          <div class="line" class:sys={line.system}>
            {#if !line.system}<b style="color:{client.players.find((p) => p.name === line.name)?.color ?? '#bbb'}">{line.name}:</b> {/if}{line.text}
          </div>
        {/each}
      </div>
      <form onsubmit={submitChat}>
        <input placeholder="say something to the party…" bind:value={chatText} maxlength="300" />
      </form>
    </div>
  </div>
</div>

<style>
  .hub {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    padding: 24px;
    overflow: auto;
    background: radial-gradient(70% 60% at 50% 30%, rgba(255, 190, 85, 0.08), rgba(6, 7, 10, 0.98));
    color: #dfe2e8;
  }
  .frame {
    width: min(720px, 100%);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  header h1 {
    margin: 0;
    font-size: 34px;
    letter-spacing: 3px;
    color: #ffcf5a;
  }
  header .safe {
    margin: 6px 0 2px;
    color: #b7bcc6;
    font-size: 14px;
    line-height: 1.5;
  }
  header .seed {
    color: #6b7079;
    font-size: 11px;
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  @media (max-width: 560px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  section {
    background: rgba(10, 12, 16, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 14px;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #9aa0aa;
  }
  h2 .count {
    color: #ffcf5a;
    margin-left: 4px;
  }
  .party ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .party li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .party li.me .pname {
    font-weight: 700;
    color: #fff;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .pclass {
    color: #8a8f99;
    font-size: 12px;
  }
  .pstatus {
    margin-left: auto;
    font-size: 11px;
    color: #6b7079;
  }
  .pstatus.delving {
    color: #ff8a5a;
  }
  .sheet {
    border-left: 3px solid var(--accent);
    padding: 4px 0 4px 10px;
    margin-bottom: 14px;
  }
  .sheet-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .sheet-head b {
    color: var(--accent);
    font-size: 16px;
  }
  .sheet-head .role {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #6b7079;
  }
  .blurb {
    margin: 4px 0 8px;
    color: #b7bcc6;
    font-size: 12px;
    line-height: 1.45;
  }
  .stats {
    display: flex;
    gap: 12px;
    font-size: 13px;
  }
  .stat.hp {
    color: #ff8a8a;
  }
  .abilities {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  }
  .chip {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    padding: 2px 7px;
    font-size: 10px;
    color: #cfd3db;
  }
  .buy {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 9px;
    border: 1px solid rgba(255, 207, 90, 0.35);
    background: rgba(255, 207, 90, 0.08);
    color: #ffcf5a;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .buy:hover:not(:disabled) {
    background: rgba(255, 207, 90, 0.16);
  }
  .buy:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .buy .price.short {
    color: #ff8a8a;
  }
  .hint {
    margin: 8px 0 0;
    color: #8a8f99;
    font-size: 11px;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .descend {
    flex: 1;
    padding: 14px;
    border-radius: 11px;
    border: 1px solid rgba(255, 160, 71, 0.5);
    background: linear-gradient(180deg, rgba(255, 160, 71, 0.22), rgba(255, 120, 40, 0.14));
    color: #ffd7a8;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 1px;
    cursor: pointer;
  }
  .descend:hover:not(:disabled) {
    background: linear-gradient(180deg, rgba(255, 160, 71, 0.34), rgba(255, 120, 40, 0.2));
  }
  .descend:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .leave {
    color: #6b7079;
    font-size: 12px;
    white-space: nowrap;
  }
  .chat .log {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 40px;
    font-size: 12px;
    line-height: 1.4;
  }
  .chat .line.sys {
    color: #8fa4c4;
    font-style: italic;
  }
  .chat input {
    margin-top: 6px;
    width: 100%;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 8px 10px;
    color: #eee;
    font-size: 13px;
  }
  .chat input:focus {
    outline: none;
    border-color: #ffcf5a66;
  }
</style>
