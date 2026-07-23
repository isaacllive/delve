<script lang="ts">
  import type { GameClient } from '$lib/net.svelte.ts';
  import { compassLabel } from '$lib/game/protocol.ts';
  import { makeIdentities, displayName } from '$lib/game/items.ts';
  import { gearDisplayName } from '$lib/game/gear.ts';
  import { hungerLevel } from '$lib/game/character.ts';
  import type { InteractPrompt } from '$lib/game/interactions.ts';

  let {
    client,
    cameraYaw = 0,
    biome,
    subBiome,
    interactPrompt = null,
    traveling = false,
    onChat,
  }: {
    client: GameClient;
    cameraYaw?: number;
    biome?: string;
    subBiome?: string;
    /** Action available on the player's current tile (stairs / exit), or null. */
    interactPrompt?: InteractPrompt | null;
    /** True while an auto-travel route is being walked (shows a stop hint). */
    traveling?: boolean;
    onChat: (text: string) => void;
  } = $props();

  let chatText = $state('');
  let showHelp = $state(false);
  const me = $derived(client.me);
  const facing = $derived(me?.facing ?? Math.PI);
  const heading = $derived(compassLabel(facing));
  const rose = $derived(cameraYaw);

  // Vitals.
  const hpPct = $derived(me ? Math.max(0, Math.min(1, me.hp / Math.max(1, me.hpMax))) : 0);
  const HUNGER_UI: Record<string, { glyph: string; label: string; cls: string }> = {
    full: { glyph: '', label: '', cls: '' },
    hungry: { glyph: '🍖', label: 'Hungry', cls: 'warn' },
    weak: { glyph: '🍖', label: 'Weak', cls: 'warn' },
    faint: { glyph: '🥴', label: 'Faint', cls: 'bad' },
    starving: { glyph: '💀', label: 'Starving', cls: 'bad' },
  };
  const hunger = $derived(HUNGER_UI[hungerLevel(me?.nutrition ?? 2150)]);

  // Active conditions. One chip per status, driven by the status vocabulary
  // rather than a hand-written check per kind, so a newly-resolved condition
  // shows up here without a change. `bad: false` marks the boons. (The full
  // sidebar treatment — monster statuses, health bars — is gap G17.)
  const STATUS_LOOK: Record<string, { glyph: string; hint: string; bad?: boolean }> = {
    poisoned: { glyph: '🤢', hint: 'Poisoned — losing health each turn' },
    confused: { glyph: '💫', hint: 'Confused — your steps veer astray' },
    entangled: { glyph: '🕸', hint: 'Entangled — a turn spent tearing free' },
    paralyzed: { glyph: '🧊', hint: 'Paralyzed — you cannot act' },
    slowed: { glyph: '🐌', hint: 'Slowed — everything else moves twice' },
    darkened: { glyph: '🌑', hint: 'Darkened — your light is smothered' },
    nauseous: { glyph: '🤮', hint: 'Nauseous' },
    discordant: { glyph: '🌀', hint: 'Discordant' },
    negated: { glyph: '🚫', hint: 'Negated — magic suppressed' },
    hallucinating: { glyph: '🍄', hint: 'Hallucinating — trust nothing you see' },
    hasted: { glyph: '⚡', hint: 'Hasted — you act twice as often', bad: false },
    levitating: { glyph: '🎈', hint: 'Levitating — floating over what lies below', bad: false },
    shielded: { glyph: '🛡', hint: 'Shielded — damage absorbed', bad: false },
    fireImmune: { glyph: '🔥', hint: 'Fire immune', bad: false },
    telepathic: { glyph: '👁', hint: 'Telepathic', bad: false },
  };

  // Inventory (consumables) — appearance until discovered, keyed to the seed.
  const identities = $derived(client.seed ? makeIdentities(client.seed) : null);
  const discovered = $derived(new Set(client.discovered));
  const items = $derived(
    (me?.inventory ?? []).map((s, i) => ({
      slot: i + 1,
      kindId: s.kindId,
      count: s.count,
      name: identities ? displayName(s.kindId, identities, discovered) : String(s.kindId),
    })),
  );

  // Equipment: the equipped weapon/armor, plus any other carried gear to swap in.
  const equippedWeapon = $derived(me?.gear.find((g) => g.instId === me?.equippedWeapon) ?? null);
  const equippedArmor = $derived(me?.gear.find((g) => g.instId === me?.equippedArmor) ?? null);
  const carriedGear = $derived(
    (me?.gear ?? []).filter((g) => g.instId !== me?.equippedWeapon && g.instId !== me?.equippedArmor),
  );

  function submitChat(e: Event) {
    e.preventDefault();
    if (!chatText.trim()) return;
    onChat(chatText);
    chatText = '';
  }
</script>

<div class="hud">
  <!-- ── Top-left: run info + vitals + party ──────────────────────────────── -->
  <div class="top-left">
    <div class="run">
      {#if (me?.level ?? 0) < 0}
        <span class="depth">🏕 Base Camp</span>
      {:else}
        <span class="depth">Depth <b>{(me?.level ?? 0) + 1}</b><i>/ {client.levelCount}</i></span>
      {/if}
      {#if biome}<span class="biome">{biome}{#if subBiome} · {subBiome}{/if}</span>{/if}
    </div>

    {#if me}
      <div class="vitals">
        <div class="hpbar" title="Health">
          <div class="fill" style="width:{hpPct * 100}%"></div>
          <span class="hptext">♥ {me.hp} / {me.hpMax}</span>
        </div>
        <div class="chips">
          <span class="chip str" title="Strength — raised only by a Potion of Strength">💪 {me.strength}</span>
          <span class="chip gold" title="Gold">🪙 {me.gold}</span>
          {#each me.statuses as s (s.kind)}
            <span class="chip {STATUS_LOOK[s.kind]?.bad === false ? 'good' : 'bad'}" title="{STATUS_LOOK[s.kind]?.hint ?? s.kind} — {s.turns} turns left">
              {STATUS_LOOK[s.kind]?.glyph ?? '✦'} {s.turns}
            </span>
          {/each}
          {#if hunger.label}<span class="chip {hunger.cls}" title="Eat a ration before you starve">{hunger.glyph} {hunger.label}</span>{/if}
          {#if client.hasAmulet}<span class="chip amulet" title="You bear the Amulet of Yendor — escape to the surface!">🏆 Amulet</span>{/if}
        </div>
      </div>
    {/if}

    {#if client.players.length > 1}
      <div class="roster">
        {#each client.players as p (p.id)}
          <span class="who" class:me={p.id === client.youId}>
            <i class="dot" style="background:{p.color}"></i>{p.name}
            <em>L{p.level + 1}</em>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Top-right: compass + help toggle ─────────────────────────────────── -->
  <div class="top-right">
    <div class="compass" title="Facing {heading}">
      <div class="rose" style="transform: rotate({rose}rad)">
        <span class="tick n" style="transform: translate(-50%, -50%) rotate({-rose}rad)">N</span>
        <span class="tick e" style="transform: translate(-50%, -50%) rotate({-rose}rad)">E</span>
        <span class="tick s" style="transform: translate(-50%, -50%) rotate({-rose}rad)">S</span>
        <span class="tick w" style="transform: translate(-50%, -50%) rotate({-rose}rad)">W</span>
        <span class="needle" style="transform: rotate({facing}rad)"></span>
      </div>
      <span class="hlabel">{heading}</span>
    </div>
    <button class="help-toggle" title="Controls" onclick={() => (showHelp = !showHelp)}>?</button>
    {#if showHelp}
      <div class="help panel">
        <div><kbd>WASD</kbd>/<kbd>↑↓←→</kbd>/<kbd>hjkl</kbd> move · <kbd>yubn</kbd> diagonals</div>
        <div>move into a foe to <b>attack</b> · <kbd>Space</kbd>/<kbd>E</kbd> interact</div>
        <div><kbd>Z</kbd>/<kbd>.</kbd> rest a turn</div>
        <div><kbd>1</kbd>–<kbd>9</kbd> use item · <kbd>Shift</kbd>+# throw · click gear to equip</div>
        <div><kbd>X</kbd> auto-explore · <kbd>G</kbd> go to stairs · click a tile to travel</div>
        <div>drag to look · wheel to zoom</div>
      </div>
    {/if}
  </div>

  <!-- ── Interact prompt + travel status (above the action bar) ───────────── -->
  <div class="cues">
    {#if traveling}
      <div class="travel">🥾 travelling… <kbd>X</kbd> to stop</div>
    {/if}
    {#if interactPrompt}
      <div class="interact" class:blocked={interactPrompt.blocked} aria-live="polite">
        <kbd>{interactPrompt.key}</kbd><span>{interactPrompt.label}</span>
      </div>
    {/if}
  </div>

  <!-- ── Bottom action bar: consumables + equipment ───────────────────────── -->
  {#if me && (me.level ?? 0) >= 0}
    <div class="actionbar">
      <div class="group items" title="1–9 or click to use · Shift+# to throw">
        {#if items.length}
          {#each items as it (it.kindId)}
            <button class="slot" onclick={() => client.useItem(it.kindId)}>
              <span class="key">{it.slot}</span>
              <span class="name">{it.name}</span>
              {#if it.count > 1}<span class="qty">×{it.count}</span>{/if}
            </button>
          {/each}
        {:else}
          <span class="empty">— pack empty —</span>
        {/if}
      </div>

      <div class="divider"></div>

      <div class="group gear" title="Click to equip / unequip">
        <button class="eq weapon" class:filled={!!equippedWeapon} onclick={() => equippedWeapon && client.equip(equippedWeapon.instId)}>
          <span class="glyph">⚔</span>
          <span class="name">{equippedWeapon ? gearDisplayName(equippedWeapon) : '— unarmed —'}</span>
        </button>
        <button class="eq armor" class:filled={!!equippedArmor} onclick={() => equippedArmor && client.equip(equippedArmor.instId)}>
          <span class="glyph">🛡</span>
          <span class="name">{equippedArmor ? gearDisplayName(equippedArmor) : '— no armor —'}</span>
        </button>
        {#each carriedGear as g (g.instId)}
          <button class="slot carried" onclick={() => client.equip(g.instId)} title="Equip {gearDisplayName(g)}">
            <span class="glyph">{g.category === 'weapon' ? '⚔' : '🛡'}</span>
            <span class="name">{gearDisplayName(g)}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Bottom-left: message log + chat ──────────────────────────────────── -->
  <div class="log panel">
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
    font: 13px/1.4 system-ui, sans-serif;
    color: #dfe2e8;
  }
  .hud button,
  .hud input,
  .hud .log {
    pointer-events: auto;
  }
  .panel {
    background: rgba(10, 12, 16, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    backdrop-filter: blur(3px);
  }

  /* ── Top-left ── */
  .top-left {
    position: absolute;
    top: 14px;
    left: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 260px;
  }
  .run {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .run .depth {
    font-size: 18px;
    letter-spacing: 0.5px;
    text-shadow: 0 1px 4px #000;
  }
  .run .depth b {
    color: #ffcf5a;
  }
  .run .depth i {
    color: #8a8f99;
    font-style: normal;
    font-size: 13px;
    margin-left: 3px;
  }
  .run .biome {
    font-size: 12px;
    color: #9aa0aa;
    text-shadow: 0 1px 3px #000;
  }

  .vitals {
    background: rgba(10, 12, 16, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    backdrop-filter: blur(3px);
    padding: 8px 9px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .hpbar {
    position: relative;
    height: 20px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.45);
    overflow: hidden;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }
  .hpbar .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(180deg, #ff6a6a, #c0392b);
    transition: width 0.25s ease;
  }
  .hpbar .hptext {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 600;
    text-shadow: 0 1px 2px #000;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chip {
    background: rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    padding: 2px 7px;
    font-size: 12px;
    white-space: nowrap;
  }
  .chip.str {
    color: #cfd3db;
  }
  .chip.gold {
    color: #ffcf5a;
  }
  .chip.warn {
    color: #ffb454;
    background: rgba(255, 160, 60, 0.14);
  }
  .chip.bad {
    color: #ff7a7a;
    background: rgba(255, 80, 80, 0.16);
  }
  /* Boons read cool/green so a glance separates them from afflictions. */
  .chip.good {
    color: #7ce0a8;
    background: rgba(90, 220, 150, 0.15);
  }
  .chip.amulet {
    color: #ffe08a;
    background: rgba(255, 200, 80, 0.18);
    box-shadow: 0 0 0 1px rgba(255, 208, 112, 0.4);
  }

  .roster {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 6px;
    text-shadow: 0 1px 3px #000;
  }
  .who.me {
    font-weight: 600;
  }
  .who em {
    color: #8a8f99;
    font-style: normal;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex: none;
  }

  /* ── Top-right ── */
  .top-right {
    position: absolute;
    top: 14px;
    right: 14px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  .compass {
    position: relative;
    width: 74px;
    height: 74px;
    display: grid;
    place-items: center;
  }
  .rose {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(10, 12, 16, 0.66);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(3px);
  }
  .tick {
    position: absolute;
    left: 50%;
    top: 50%;
    font-size: 10px;
    color: #9aa0aa;
  }
  .tick.n {
    margin-top: -30px;
    color: #ff8a5a;
  }
  .tick.s {
    margin-top: 30px;
  }
  .tick.e {
    margin-left: 30px;
  }
  .tick.w {
    margin-left: -30px;
  }
  .needle {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 3px;
    height: 26px;
    margin: -26px 0 0 -1.5px;
    transform-origin: bottom center;
    background: linear-gradient(#ffcf5a, #ff8a3a);
    border-radius: 2px;
  }
  .hlabel {
    font-size: 12px;
    font-weight: 700;
    color: #ffcf5a;
    text-shadow: 0 1px 3px #000;
  }
  .help-toggle {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(10, 12, 16, 0.72);
    color: #cfd3db;
    font-weight: 700;
    cursor: pointer;
  }
  .help-toggle:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .help {
    padding: 9px 11px;
    font-size: 12px;
    color: #cfd3db;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 300px;
  }
  .help b {
    color: #fff;
  }
  kbd {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    padding: 0 4px;
    font: 11px/1.5 ui-monospace, monospace;
    border: 1px solid rgba(255, 255, 255, 0.14);
  }

  /* ── Center cues (interact + travel) ── */
  .cues {
    position: absolute;
    left: 50%;
    bottom: 108px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .travel {
    background: rgba(10, 12, 16, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 12px;
    color: #b6bbc4;
  }
  .interact {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 207, 90, 0.14);
    border: 1px solid rgba(255, 207, 90, 0.4);
    border-radius: 999px;
    padding: 6px 14px 6px 8px;
    font-size: 14px;
    color: #ffe0a0;
  }
  .interact.blocked {
    background: rgba(120, 120, 130, 0.14);
    border-color: rgba(160, 160, 170, 0.3);
    color: #9aa0aa;
  }
  .interact kbd {
    background: #ffcf5a;
    color: #201404;
    font-weight: 700;
    border: none;
  }

  /* ── Bottom action bar ── */
  .actionbar {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    display: flex;
    align-items: stretch;
    gap: 8px;
    max-width: min(94vw, 900px);
    padding: 6px;
    background: rgba(10, 12, 16, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    backdrop-filter: blur(4px);
  }
  .group {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    align-items: center;
  }
  .divider {
    width: 1px;
    background: rgba(255, 255, 255, 0.12);
    margin: 2px 2px;
  }
  .actionbar .empty {
    color: #6a6f79;
    font-style: italic;
    font-size: 12px;
    padding: 0 8px;
  }
  .slot,
  .eq {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 8px;
    color: #dfe3ea;
    font-size: 12px;
    cursor: pointer;
    max-width: 190px;
  }
  .slot:hover,
  .eq:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .slot .key {
    display: inline-grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    border-radius: 4px;
    background: #ffcf5a;
    color: #201404;
    font-weight: 700;
    font-size: 10px;
  }
  .slot .name,
  .eq .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .slot .qty {
    color: #9aa0aa;
  }
  .eq {
    border-left: 2px solid rgba(255, 255, 255, 0.14);
  }
  .eq.weapon.filled {
    border-left-color: #ff9a6a;
  }
  .eq.armor.filled {
    border-left-color: #7fb4ff;
  }
  .eq .glyph,
  .slot.carried .glyph {
    opacity: 0.9;
  }
  .slot.carried {
    opacity: 0.85;
  }

  /* ── Bottom-left log ── */
  .log {
    position: absolute;
    left: 14px;
    bottom: 14px;
    width: 340px;
    max-width: 40vw;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 190px;
    overflow: hidden;
  }
  .log .line {
    font-size: 12px;
    color: #cfd3db;
    text-shadow: 0 1px 2px #000;
  }
  .log .line.sys {
    color: #9aa0aa;
    font-style: italic;
  }
  .log form {
    margin-top: 4px;
  }
  .log input {
    width: 100%;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    padding: 5px 8px;
    color: #eee;
    font-size: 12px;
  }
  .log input:focus {
    outline: none;
    border-color: #ffb04788;
  }

  @media (max-width: 620px) {
    .log {
      display: none;
    }
    .actionbar {
      bottom: 8px;
    }
  }
</style>
