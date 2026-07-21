<script lang="ts">
  // Model gallery — a debug tool that renders every imported procedural model
  // (props + creature minis) as a small 3D thumbnail so you can browse the
  // library, verify the import, and see which id/keywords a token would match.
  // All thumbnails come from ONE shared offscreen WebGL context (thumbnail.ts),
  // so hundreds of previews cost a single context, not one per tile.
  import { onMount } from 'svelte';
  import { MODEL_LIBRARY } from '$lib/models3d/index.ts';
  import { modelThumbnail } from '$lib/models3d/thumbnail.ts';
  import type { ModelDef } from '$lib/models3d/types.ts';

  type Kind = 'all' | 'props' | 'minis';
  let kind = $state<Kind>('all');
  let query = $state('');
  // Model id → rendered PNG data URL (filled progressively on mount).
  let thumbs = $state<Record<string, string>>({});
  let rendered = $state(0);

  const filtered = $derived(
    MODEL_LIBRARY.filter((m) => {
      if (kind === 'props' && m.creature) return false;
      if (kind === 'minis' && !m.creature) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        m.id.includes(q) ||
        m.label.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        (m.keywords ?? []).some((k) => k.includes(q))
      );
    }),
  );

  // Group the filtered set by category for readable sections.
  const groups = $derived.by(() => {
    const map = new Map<string, ModelDef[]>();
    for (const m of filtered) {
      const arr = map.get(m.category) ?? [];
      arr.push(m);
      map.set(m.category, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  onMount(async () => {
    // Render every model once, sequentially, into the cache-backed map. The
    // shared renderer processes these one at a time; awaiting each keeps the UI
    // responsive and fills the grid top-to-bottom.
    for (const m of MODEL_LIBRARY) {
      try {
        const url = await modelThumbnail({ id: m.id, color: m.color });
        thumbs[m.id] = url;
      } catch (e) {
        // A single bad builder shouldn't blank the gallery — leave its tile
        // as a placeholder and keep going.
        console.error(`[gallery] ${m.id} failed`, e);
      }
      rendered += 1;
    }
  });
</script>

<svelte:head><title>Delve · Model gallery</title></svelte:head>

<div class="page">
  <header>
    <div>
      <h1>Model gallery</h1>
      <p class="sub">
        {MODEL_LIBRARY.length} models imported from RealmQuest · rendered {rendered}/{MODEL_LIBRARY.length}
      </p>
    </div>
    <a class="back" href="/debug">← debug</a>
  </header>

  <div class="controls">
    <div class="tabs">
      <button class:active={kind === 'all'} onclick={() => (kind = 'all')}>All</button>
      <button class:active={kind === 'props'} onclick={() => (kind = 'props')}>Props</button>
      <button class:active={kind === 'minis'} onclick={() => (kind = 'minis')}>Minis</button>
    </div>
    <input placeholder="filter by name / keyword / category…" bind:value={query} />
    <span class="count">{filtered.length} shown</span>
  </div>

  {#each groups as [category, models] (category)}
    <section>
      <h2>{category} <span>({models.length})</span></h2>
      <div class="grid">
        {#each models as m (m.id)}
          <figure title={(m.keywords ?? []).join(', ')}>
            <div class="thumb">
              {#if thumbs[m.id]}
                <img src={thumbs[m.id]} alt={m.label} />
              {:else}
                <span class="ph">{m.icon}</span>
              {/if}
            </div>
            <figcaption>
              <span class="label">{m.icon} {m.label}</span>
              <code>{m.id}</code>
            </figcaption>
          </figure>
        {/each}
      </div>
    </section>
  {/each}

  {#if filtered.length === 0}
    <p class="empty">No models match “{query}”.</p>
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 20px 24px 60px;
    background: #0a0c10;
    color: #cfd4dc;
    font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    color: #ffb047;
  }
  .sub {
    margin: 2px 0 0;
    color: #7c828c;
    font-size: 12px;
  }
  .back {
    color: #6ab0ff;
    text-decoration: none;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tabs button {
    padding: 5px 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: transparent;
    color: #aeb4bd;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }
  .tabs button.active {
    background: #ffb047;
    color: #1a1206;
    border-color: #ffb047;
    font-weight: 600;
  }
  input {
    flex: 1;
    min-width: 200px;
    padding: 6px 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.04);
    color: #e6e9ee;
    border-radius: 6px;
    font: inherit;
  }
  .count {
    color: #7c828c;
    font-size: 12px;
  }
  section {
    margin-bottom: 26px;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #8a909a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 6px;
  }
  h2 span {
    color: #565b64;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }
  figure {
    margin: 0;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    overflow: hidden;
  }
  .thumb {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    background: radial-gradient(60% 60% at 50% 40%, rgba(255, 255, 255, 0.06), transparent);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .ph {
    font-size: 34px;
    opacity: 0.5;
  }
  figcaption {
    padding: 6px 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .label {
    font-size: 12px;
    color: #e6e9ee;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  code {
    font-size: 10px;
    color: #6f757e;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    color: #7c828c;
    text-align: center;
    padding: 40px;
  }
</style>
