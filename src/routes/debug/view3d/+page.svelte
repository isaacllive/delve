<script lang="ts">
  // Standalone 3D-view debug harness: mounts DungeonView3D with a generated
  // level and a synthetic player, with NO websocket/server — so terrain
  // rendering (instanced boxes vs the voxel mesh) can be inspected and compared
  // in isolation. Toggles mirror the in-game debug menu's render flags.
  import { browser } from '$app/environment';
  import DungeonView3D from '$lib/components/DungeonView3D.svelte';
  import Minimap from '$lib/components/Minimap.svelte';
  import { generateDungeon, getLevel } from '$lib/game/dungeon.ts';
  import { cellIndex } from '$lib/game/grid.ts';
  import type { PlayerState, MonsterState } from '$lib/game/protocol.ts';

  let seed = $state('crypt-of-ash-42');
  let depth = $state(0);
  // Initial terrain mode from ?vox=0|1 (default voxel on) so each renderer can
  // be loaded fresh for side-by-side comparison without a runtime toggle.
  let voxel = $state(browser ? new URLSearchParams(location.search).get('vox') !== '0' : true);
  let figures = $state(true);
  let showAll = $state(true);
  let hideCeiling = $state(false);

  const dungeon = $derived(generateDungeon(seed));
  const level = $derived(getLevel(dungeon, Math.max(0, Math.min(depth, dungeon.levelCount - 1))));

  // A synthetic delver standing on the level entry (no server needed — the
  // component renders purely from props).
  const you = $derived.by<PlayerState>(() => {
    const entry = level.entry;
    const cell = level.cells[cellIndex(entry.col, entry.row, level.cols)];
    return {
      id: 'dbg', name: 'Debug Warden', color: '#ffb047', classId: 'warden',
      level: level.depth, col: entry.col, row: entry.row,
      elevation: Math.max(0, cell?.elevation ?? 0), torchRadius: 9,
      hp: 20, hpMax: 20, strength: 12, gold: 0, inventory: [], facing: 0, alive: true,
    };
  });

  // A couple of foes near the entry so figure rendering is visible too.
  const monsters = $derived.by<MonsterState[]>(() => {
    const e = level.entry;
    return [
      { id: 'm1', name: 'Goblin', color: 0x6aa84f, level: level.depth, col: e.col + 2, row: e.row, hp: 6, hpMax: 6, boss: false, state: 'hunting' },
      { id: 'm2', name: 'Skeleton', color: 0xd9d2c0, level: level.depth, col: e.col, row: e.row + 2, hp: 8, hpMax: 8, boss: false, state: 'sleeping' },
    ];
  });
</script>

<svelte:head><title>Delve · 3D view debug</title></svelte:head>

<div class="wrap">
  <div class="bar">
    <a href="/debug">← debug</a>
    <label>seed <input bind:value={seed} /></label>
    <label>depth <input type="number" min="0" max={dungeon.levelCount - 1} bind:value={depth} style="width:56px" /></label>
    <label><input type="checkbox" bind:checked={voxel} /> voxel terrain</label>
    <label><input type="checkbox" bind:checked={figures} /> figures</label>
    <label><input type="checkbox" bind:checked={showAll} /> show all</label>
    <label><input type="checkbox" bind:checked={hideCeiling} /> hide ceiling</label>
    <span class="tag">{level.biomeName} · {level.cols}×{level.rows} · {voxel ? 'VOXEL MESH' : 'instanced'}</span>
  </div>

  <div class="stage">
    {#if browser}
      {#key `${seed}:${level.depth}`}
        <DungeonView3D
          {level}
          players={[you]}
          {monsters}
          youId={you.id}
          tick={0}
          useVoxelTerrain={voxel}
          useFigures={figures}
          debugShowAllTerrain={showAll}
          debugHideCeiling={hideCeiling}
        />
      {/key}
      <Minimap {level} players={[you]} {monsters} youId={you.id} tick={0} />
    {/if}
  </div>
</div>

<style>
  .wrap { position: fixed; inset: 0; display: flex; flex-direction: column; background: #06070a; }
  .bar {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 8px 14px; background: #0d0f14; color: #cfd4dc;
    font: 12px/1.4 ui-monospace, monospace; border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .bar a { color: #ffb047; text-decoration: none; }
  .bar label { display: flex; align-items: center; gap: 5px; }
  .bar input:not([type]), .bar input[type='number'] { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); color: #e6e9ee; border-radius: 5px; padding: 3px 6px; }
  .bar input[type='checkbox'] { accent-color: #ffb047; }
  .tag { margin-left: auto; color: #8a909a; }
  .stage { position: relative; flex: 1; }
</style>
