<script lang="ts">
  // In-game debug menu overlay. Toggled with the backtick (`) key during play.
  // Exposes the DungeonView3D render toggles live and shows the current run's
  // world state, so you can inspect/adjust the scene without editing source or
  // reconnecting. Purely a dev aid — it sends no intents and mutates no game
  // state (the server stays authoritative); it only flips client render flags.
  import type { GameClient } from '$lib/net.svelte.ts';
  import type { DungeonLevel } from '$lib/game/dungeon.ts';

  /** Client render flags. A shared $state object owned by the play route and
   *  passed straight into DungeonView3D — mutating a field here re-renders the
   *  scene reactively. */
  export interface DebugFlags {
    showAllTerrain: boolean;
    hideCeiling: boolean;
    useFigures: boolean;
    voxelTerrain: boolean;
    ambient: number;
  }

  let {
    client,
    flags = $bindable(),
    level,
    seed,
    onClose,
  }: {
    client: GameClient;
    flags: DebugFlags;
    level: DungeonLevel | null;
    seed: string | null;
    onClose: () => void;
  } = $props();

  const me = $derived(client.me);
</script>

<div class="debug" role="dialog" aria-label="Debug menu">
  <header>
    <span class="title">⌘ DEBUG</span>
    <button class="x" onclick={onClose} title="Close (`)">✕</button>
  </header>

  <section>
    <h4>Render</h4>
    <label><input type="checkbox" bind:checked={flags.showAllTerrain} /> Show all terrain (fog off)</label>
    <label><input type="checkbox" bind:checked={flags.hideCeiling} /> Hide ceiling</label>
    <label><input type="checkbox" bind:checked={flags.useFigures} /> Procedural figures</label>
    <label><input type="checkbox" bind:checked={flags.voxelTerrain} /> Voxel terrain mesh</label>
    <label class="slider">
      Ambient <input type="range" min="0" max="1" step="0.05" bind:value={flags.ambient} />
      <span class="num">{flags.ambient.toFixed(2)}</span>
    </label>
  </section>

  <section>
    <h4>World</h4>
    <dl>
      <dt>Seed</dt><dd>{seed ?? '—'}</dd>
      <dt>Depth</dt><dd>{me?.level ?? '—'}{level ? ` · ${level.biomeName}` : ''}</dd>
      <dt>Tick</dt><dd>{client.tick}</dd>
      <dt>You</dt><dd>{me ? `(${me.col}, ${me.row}) hp ${me.hp}/${me.hpMax}` : '—'}</dd>
      <dt>Players</dt><dd>{client.players.length}</dd>
      <dt>Monsters</dt><dd>{client.monsters.length}</dd>
      <dt>Loot</dt><dd>{client.loot.length}</dd>
    </dl>
  </section>

  <footer>
    <a href="/debug/models" target="_blank" rel="noopener">Model gallery ↗</a>
    <a href="/debug" target="_blank" rel="noopener">Dungeon map ↗</a>
  </footer>
</div>

<style>
  .debug {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 50;
    width: 250px;
    padding: 10px 12px 12px;
    border-radius: 10px;
    background: rgba(10, 12, 16, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    color: #cfd4dc;
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    backdrop-filter: blur(6px);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .title {
    font-weight: 700;
    letter-spacing: 2px;
    color: #ffb047;
  }
  .x {
    background: none;
    border: none;
    color: #8a909a;
    cursor: pointer;
    font-size: 13px;
    padding: 2px 4px;
  }
  .x:hover {
    color: #fff;
  }
  h4 {
    margin: 10px 0 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #7c828c;
  }
  label {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 0;
    cursor: pointer;
  }
  label.slider {
    gap: 6px;
  }
  input[type='range'] {
    flex: 1;
    accent-color: #ffb047;
  }
  input[type='checkbox'] {
    accent-color: #ffb047;
  }
  .num {
    color: #9aa0aa;
    min-width: 30px;
    text-align: right;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1px 10px;
    margin: 0;
  }
  dt {
    color: #7c828c;
  }
  dd {
    margin: 0;
    color: #dfe2e8;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  footer {
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  footer a {
    color: #6ab0ff;
    text-decoration: none;
    font-size: 11px;
  }
  footer a:hover {
    text-decoration: underline;
  }
</style>
