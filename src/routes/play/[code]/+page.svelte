<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { GameClient } from '$lib/net.svelte.ts';
  import { generateDungeon, getLevel, CAMP_DEPTH, type Dungeon } from '$lib/game/dungeon.ts';
  import { interactablePrompt } from '$lib/game/interactions.ts';
  import DungeonView3D from '$lib/components/DungeonView3D.svelte';
  import Hud from '$lib/components/Hud.svelte';
  import HubScreen from '$lib/components/HubScreen.svelte';
  import DebugMenu, { type DebugFlags } from '$lib/components/DebugMenu.svelte';

  let { data } = $props();

  const client = new GameClient();
  let dungeon = $state<Dungeon | null>(null);
  let cameraYaw = $state(0);

  // In-game debug menu (toggle with the backtick key). `flags` is a shared
  // reactive object handed straight to DungeonView3D — the menu mutates it and
  // the scene re-renders. Defaults preserve the current dev view (fog off).
  let debugOpen = $state(false);
  let debugFlags = $state<DebugFlags>({
    showAllTerrain: true,
    hideCeiling: false,
    useFigures: true,
    voxelTerrain: false,
    ambient: 0.4,
  });

  // Regenerate geometry client-side once the server confirms the seed.
  $effect(() => {
    const seed = client.seed;
    if (seed && (!dungeon || dungeon.seed !== seed)) {
      dungeon = generateDungeon(seed);
    }
  });

  const me = $derived(client.me);
  // At CAMP_DEPTH the player is on the surface: show the 2D hub, not the 3D
  // dungeon (so no geometry or enemies render here — the camp is a safe zone).
  const atHub = $derived(!!me && me.level <= CAMP_DEPTH);
  const currentLevel = $derived(
    dungeon && me ? getLevel(dungeon, Math.min(me.level, dungeon.levelCount - 1)) : null,
  );
  // The action available on the tile the player stands on (stairs / exit),
  // driving the HUD interaction indicator. Hub actions are buttons, not tiles.
  const interactPrompt = $derived(
    !atHub && currentLevel && me && dungeon
      ? interactablePrompt(currentLevel, me.col, me.row, client.bossDefeated, dungeon.levelCount)
      : null,
  );

  function typingInField(): boolean {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  // Movement is CAMERA-RELATIVE: keys map to an on-screen heading (0 = up /
  // into the screen, clockwise), which we rotate by the camera yaw and snap to
  // the 8 grid directions — so "forward" is always where the character faces
  // (the camera sits behind them). WASD / arrows / vi-keys (hjkl) + yubn diags.
  const SCREEN_DIR: Record<string, number> = {
    arrowup: 0, w: 0, k: 0,
    u: Math.PI / 4,
    arrowright: Math.PI / 2, d: Math.PI / 2, l: Math.PI / 2,
    n: (3 * Math.PI) / 4,
    arrowdown: Math.PI, s: Math.PI, j: Math.PI,
    b: (5 * Math.PI) / 4,
    arrowleft: (3 * Math.PI) / 2, a: (3 * Math.PI) / 2, h: (3 * Math.PI) / 2,
    y: (7 * Math.PI) / 4,
  };

  /** Snap a world heading (0 = N/−row, clockwise) to an 8-way grid step. */
  function stepFor(worldHeading: number): [number, number] {
    const k = ((Math.round(worldHeading / (Math.PI / 4)) % 8) + 8) % 8;
    const a = (k * Math.PI) / 4;
    return [Math.round(Math.sin(a)), Math.round(-Math.cos(a))];
  }

  function onKey(e: KeyboardEvent) {
    if (typingInField()) return;
    // Backtick toggles the debug menu anywhere (hub or dungeon).
    if (e.key === '`') {
      e.preventDefault();
      debugOpen = !debugOpen;
      return;
    }
    // In the hub, all actions are UI buttons — dungeon movement/interact keys
    // are inert so stray keystrokes can't shuffle the camp token.
    if (atHub) return;
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'e') {
      e.preventDefault();
      client.interact();
      return;
    }
    if (key === 'q') {
      e.preventDefault();
      client.usePotion();
      return;
    }
    const screen = SCREEN_DIR[key];
    if (screen !== undefined) {
      e.preventDefault();
      // world heading appears on screen at (heading + cameraYaw) → invert.
      const [dc, dr] = stepFor(screen - cameraYaw);
      client.move(dc, dr);
    }
  }

  onMount(() => {
    client.connect(data.code, data.name, data.seed, data.classId);
    window.addEventListener('keydown', onKey);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', onKey);
    client.disconnect();
  });
</script>

<svelte:head><title>Delve · {data.code}</title></svelte:head>

<div class="stage">
  {#if client.won}
    <div class="overlay victory">
      <h1>VICTORY</h1>
      <p><b>{client.won}</b> conquered the depths and escaped.</p>
      <a href="/">← back to lobby</a>
    </div>
  {:else if client.dead}
    <div class="overlay death">
      <h1>YOU DIED</h1>
      <p>Your delver has fallen in the dark. Permadeath is final.</p>
      <a href="/">← forge a new character</a>
    </div>
  {:else if atHub}
    <HubScreen {client} onChat={(t) => client.sendChat(t)} />
  {:else if currentLevel && dungeon}
    <DungeonView3D
      level={currentLevel}
      players={client.players}
      monsters={client.monsters}
      loot={client.loot}
      youId={client.youId}
      tick={client.tick}
      bossDefeated={client.bossDefeated}
      onYaw={(y) => (cameraYaw = y)}
      debugShowAllTerrain={debugFlags.showAllTerrain}
      debugHideCeiling={debugFlags.hideCeiling}
      debugAmbient={debugFlags.ambient}
      useFigures={debugFlags.useFigures}
      useVoxelTerrain={debugFlags.voxelTerrain}
    />
    <Hud
      {client}
      {cameraYaw}
      {interactPrompt}
      biome={currentLevel?.biomeName}
      subBiome={currentLevel?.subBiomeName}
      onChat={(t) => client.sendChat(t)}
    />
  {:else}
    <div class="loading">
      <div class="spinner"></div>
      <p>{client.error ?? (client.connected ? 'Generating the dungeon…' : 'Connecting…')}</p>
      <a href="/">← back</a>
    </div>
  {/if}

  {#if debugOpen}
    <DebugMenu
      {client}
      bind:flags={debugFlags}
      level={currentLevel}
      seed={client.seed}
      onClose={() => (debugOpen = false)}
    />
  {/if}
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #06070a;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    color: #9aa0aa;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    text-align: center;
    backdrop-filter: blur(2px);
  }
  .overlay h1 {
    margin: 0;
    font-size: 64px;
    letter-spacing: 12px;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
  }
  .overlay p {
    color: #dfe2e8;
  }
  .overlay a {
    margin-top: 10px;
  }
  .victory {
    background: radial-gradient(60% 50% at 50% 45%, rgba(255, 190, 85, 0.18), rgba(6, 7, 10, 0.86));
  }
  .victory h1 {
    background-image: linear-gradient(180deg, #ffe6a8, #ff9f43);
  }
  .victory a {
    color: #ffb047;
  }
  .death {
    background: radial-gradient(60% 50% at 50% 45%, rgba(200, 40, 40, 0.2), rgba(6, 7, 10, 0.9));
  }
  .death h1 {
    background-image: linear-gradient(180deg, #ff9a9a, #c11a1a);
  }
  .death a {
    color: #ff8a8a;
  }
  .loading a {
    color: #6b7079;
    font-size: 13px;
  }
  .spinner {
    width: 34px;
    height: 34px;
    border: 3px solid rgba(255, 255, 255, 0.12);
    border-top-color: #ffb047;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
