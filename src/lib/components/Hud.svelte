<script lang="ts">
  import type { GameClient } from '$lib/net.svelte.ts';
  import { compassLabel } from '$lib/game/protocol.ts';
  import { getClass } from '$lib/game/classes.ts';
  import type { InteractPrompt } from '$lib/game/interactions.ts';

  let {
    client,
    cameraYaw = 0,
    biome,
    subBiome,
    interactPrompt = null,
    onChat,
  }: {
    client: GameClient;
    cameraYaw?: number;
    biome?: string;
    subBiome?: string;
    /** Action available on the player's current tile (stairs / exit), or null. */
    interactPrompt?: InteractPrompt | null;
    onChat: (text: string) => void;
  } = $props();

  let chatText = $state('');
  const me = $derived(client.me);
  const myClass = $derived(getClass(me?.classId));
  const facing = $derived(me?.facing ?? Math.PI);
  const heading = $derived(compassLabel(facing));
  // The compass rose is oriented to the camera: its "up" is the direction the
  // camera looks, so N/E/S/W and the facing needle read relative to the view.
  const rose = $derived(cameraYaw); // radians to rotate the rose
  const needle = $derived(facing + cameraYaw); // player facing, relative to view

  function submitChat(e: Event) {
    e.preventDefault();
    if (!chatText.trim()) return;
    onChat(chatText);
    chatText = '';
  }
</script>

<div class="hud">
  <div class="top-left panel">
    {#if (me?.level ?? 0) < 0}
      <div class="depth">🏕 <b>Base Camp</b></div>
    {:else}
      <div class="depth">Depth <b>{(me?.level ?? 0) + 1}</b> / {client.levelCount}</div>
    {/if}
    {#if biome}<div class="biome">{biome}{#if subBiome} · <em>{subBiome}</em>{/if}</div>{/if}
    <div class="seed">seed: {client.seed ?? '…'}</div>

    {#if me}
      <div class="me-class" style="--accent:{myClass.accent}">
        <b>{myClass.name}</b>
        <span class="hp">♥ {me.hp}/{me.hpMax}</span>
        <span class="purse">🪙 {me.gold} · 🧪 {me.potions}</span>
        <div class="abilities">
          {#each myClass.abilities as ab (ab.name)}<span class="chip" title={ab.desc}>{ab.name}</span>{/each}
        </div>
      </div>
    {/if}

    <div class="roster">
      {#each client.players as p (p.id)}
        <span class="who" class:me={p.id === client.youId}>
          <i class="dot" style="background:{p.color}"></i>{p.name}
          <em>{getClass(p.classId).name} · L{p.level + 1}{p.elevation > 0 ? ` ▲${p.elevation}` : ''}</em>
        </span>
      {/each}
    </div>
  </div>

  <div class="top-right">
    <div class="compass" title="Facing {heading}">
      <div class="rose" style="transform: rotate({rose}rad)">
        <span class="tick n" style="transform: translate(-50%, -50%) rotate({-rose}rad)">N</span>
        <span class="tick e" style="transform: translate(-50%, -50%) rotate({-rose}rad)">E</span>
        <span class="tick s" style="transform: translate(-50%, -50%) rotate({-rose}rad)">S</span>
        <span class="tick w" style="transform: translate(-50%, -50%) rotate({-rose}rad)">W</span>
        <span class="needle" style="transform: rotate({facing}rad)"></span>
      </div>
      <span class="heading">{heading}</span>
    </div>
    <div class="panel hint">
      <div><b>Move</b> WASD / arrows · <b>attack</b> into foes</div>
      <div><b>Use</b> Space / E · <b>Potion</b> Q</div>
      <div><b>Look</b> drag · <b>Zoom</b> wheel</div>
    </div>
  </div>

  {#if interactPrompt}
    <div class="interact" class:blocked={interactPrompt.blocked} aria-live="polite">
      <kbd>{interactPrompt.key}</kbd>
      <span>{interactPrompt.label}</span>
    </div>
  {/if}

  <div class="bottom-left panel log">
    {#each client.chat.slice(-8) as line (line.at + line.text)}
      <div class="line" class:sys={line.system}>
        {#if !line.system}<b style="color:{client.players.find((p) => p.name === line.name)?.color ?? '#bbb'}">{line.name}:</b> {/if}{line.text}
      </div>
    {/each}
    <form onsubmit={submitChat}>
      <input placeholder="say something…" bind:value={chatText} maxlength="300" />
    </form>
  </div>
</div>

<style>
  .hud {
    position: absolute;
    inset: 0;
    pointer-events: none;
    font-size: 13px;
  }
  .panel {
    position: absolute;
    background: rgba(10, 12, 16, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px 12px;
    backdrop-filter: blur(6px);
    color: #dfe2e8;
  }
  .top-left {
    top: 12px;
    left: 12px;
    min-width: 190px;
  }
  .top-right {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }
  .top-right .hint {
    position: static;
    text-align: right;
    line-height: 1.5;
  }
  .compass {
    position: relative;
    width: 84px;
    height: 84px;
    border-radius: 50%;
    background: rgba(10, 12, 16, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(6px);
    pointer-events: auto;
  }
  .compass .rose {
    position: absolute;
    inset: 0;
    transform-origin: center;
  }
  .compass .tick {
    position: absolute;
    font-size: 10px;
    color: #8a8f99;
    font-weight: 600;
    transform: translate(-50%, -50%);
  }
  .compass .tick.n {
    left: 50%;
    top: 11px;
    color: #ff8a5a;
  }
  .compass .tick.s {
    left: 50%;
    top: calc(100% - 11px);
  }
  .compass .tick.e {
    left: calc(100% - 10px);
    top: 50%;
  }
  .compass .tick.w {
    left: 10px;
    top: 50%;
  }
  .compass .needle {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 3px;
    height: 30px;
    margin-left: -1.5px;
    margin-top: -30px;
    transform-origin: bottom center;
    background: linear-gradient(180deg, #ff8a5a, #ff8a5a 55%, transparent 55%, transparent);
    border-radius: 2px;
  }
  .compass .heading {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 15px;
    font-weight: 700;
    color: #ffcf5a;
  }
  .bottom-left {
    bottom: 12px;
    left: 12px;
    width: 320px;
    max-width: calc(100vw - 24px);
    pointer-events: auto;
  }
  /* Interaction indicator: a centred action pill that appears when the player
     stands on an interactable tile (stairs / exit), telling them the key. */
  .interact {
    position: absolute;
    bottom: 88px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 14px;
    background: rgba(10, 12, 16, 0.82);
    border: 1px solid rgba(255, 207, 90, 0.5);
    border-radius: 999px;
    color: #ffe6a8;
    font-size: 14px;
    box-shadow: 0 0 22px rgba(255, 190, 85, 0.18);
    animation: prompt-pulse 1.6s ease-in-out infinite;
  }
  .interact.blocked {
    border-color: rgba(255, 255, 255, 0.16);
    color: #9aa0aa;
    box-shadow: none;
    animation: none;
  }
  .interact kbd {
    background: rgba(255, 207, 90, 0.16);
    border: 1px solid rgba(255, 207, 90, 0.5);
    border-radius: 6px;
    padding: 1px 8px;
    font-size: 13px;
    font-weight: 700;
    color: #ffcf5a;
  }
  .interact.blocked kbd {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.16);
    color: #9aa0aa;
  }
  @keyframes prompt-pulse {
    0%, 100% {
      box-shadow: 0 0 18px rgba(255, 190, 85, 0.14);
    }
    50% {
      box-shadow: 0 0 26px rgba(255, 190, 85, 0.3);
    }
  }
  .depth b {
    color: #ffcf5a;
    font-size: 16px;
  }
  .biome {
    color: #d8c48a;
    font-size: 12px;
    margin-top: 2px;
  }
  .biome em {
    color: #9aa0aa;
    font-style: normal;
  }
  .seed {
    color: #8a8f99;
    font-size: 11px;
    margin: 2px 0 8px;
  }
  .me-class {
    margin: 8px 0;
    padding: 7px 9px;
    background: rgba(0, 0, 0, 0.3);
    border-left: 3px solid var(--accent);
    border-radius: 7px;
  }
  .me-class b {
    color: var(--accent);
    font-size: 13px;
  }
  .me-class .hp {
    color: #ff8a8a;
    font-size: 12px;
    margin-left: 8px;
  }
  .me-class .purse {
    color: #cfd3db;
    font-size: 12px;
    margin-left: 8px;
  }
  .me-class .abilities {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .me-class .chip {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    padding: 2px 6px;
    font-size: 10px;
    color: #cfd3db;
  }
  .roster {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .who.me {
    font-weight: 600;
  }
  .who em {
    color: #8a8f99;
    font-style: normal;
    margin-left: auto;
    font-size: 11px;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
  }
  .hint b {
    color: #cfd3db;
  }
  .hint div {
    color: #9aa0aa;
  }
  .log .line {
    margin-bottom: 2px;
    line-height: 1.35;
  }
  .log .line.sys {
    color: #8fa4c4;
    font-style: italic;
  }
  .log input {
    margin-top: 6px;
    width: 100%;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    padding: 6px 8px;
    color: #eee;
    font-size: 13px;
  }
  .log input:focus {
    outline: none;
    border-color: #ffcf5a66;
  }
</style>
