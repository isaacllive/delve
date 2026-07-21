<script lang="ts">
  import { generateDungeon, getLevel } from '$lib/game/dungeon.ts';
  import { cellIndex } from '$lib/game/grid.ts';

  let seed = $state('crypt-of-ash-42');
  let levelIdx = $state(0);
  const dungeon = $derived(generateDungeon(seed));
  const level = $derived(getLevel(dungeon, Math.max(0, Math.min(levelIdx, dungeon.levelCount - 1))));

  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const colorFor = (p: typeof level.palette, kind: string): number => {
    const map: Record<string, number> = {
      floor: p.floor, wall: p.wall, ledge: p.ledge, pit: p.pit,
      water: p.water, stairsDown: p.stairsDown, stairsUp: p.stairsUp,
    };
    return map[kind] ?? p.floor;
  };

  const CELL = 7;
  let canvas = $state<HTMLCanvasElement | null>(null);

  $effect(() => {
    const l = level;
    const cv = canvas;
    if (!cv) return;
    cv.width = l.cols * CELL;
    cv.height = l.rows * CELL;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let r = 0; r < l.rows; r++) {
      for (let c = 0; c < l.cols; c++) {
        const cell = l.cells[cellIndex(c, r, l.cols)];
        ctx.fillStyle = hex(colorFor(l.palette, cell.kind));
        ctx.fillRect(c * CELL, r * CELL, CELL - 1, CELL - 1);
        // Height hint: brighten raised ledges, mark stairs.
        if (cell.kind === 'ledge') {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(c * CELL, r * CELL, CELL - 1, 3);
        }
      }
    }
    // Lights.
    for (const li of l.lights) {
      ctx.beginPath();
      ctx.arc(li.col * CELL + CELL / 2, li.row * CELL + CELL / 2, 3, 0, Math.PI * 2);
      ctx.fillStyle = li.color;
      ctx.fill();
    }
    // Entry marker.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(l.entry.col * CELL, l.entry.row * CELL, CELL - 1, CELL - 1);
    // Boss / exit (bottom floor).
    if (l.boss) {
      ctx.fillStyle = '#ff3838';
      ctx.fillRect(l.boss.col * CELL, l.boss.row * CELL, CELL - 1, CELL - 1);
    }
  });

  const counts = $derived.by(() => {
    const m: Record<string, number> = {};
    for (const c of level.cells) m[c.kind] = (m[c.kind] ?? 0) + 1;
    return m;
  });
</script>

<main>
  <header>
    <a href="/">← Delve</a>
    <a href="/debug/models">Model gallery →</a>
    <a href="/debug/view3d">3D view →</a>
    <label>seed <input bind:value={seed} /></label>
    <div class="levels">
      <button onclick={() => (levelIdx = Math.max(0, levelIdx - 1))}>◀</button>
      <label>floor <input type="number" min="1" max={dungeon.levelCount} value={levelIdx + 1}
        oninput={(e) => (levelIdx = (+(e.currentTarget as HTMLInputElement).value || 1) - 1)}
        style="width:64px" /></label>
      <button onclick={() => (levelIdx = Math.min(dungeon.levelCount - 1, levelIdx + 1))}>▶</button>
      <span class="biome">{level.biomeName} · <em>{level.subBiomeName}</em></span>
    </div>
  </header>

  <div class="wrap"><canvas bind:this={canvas}></canvas></div>

  <footer>
    <span><i style="background:{hex(level.palette.floor)}"></i>floor</span>
    <span><i style="background:{hex(level.palette.ledge)}"></i>ledge (height)</span>
    <span><i style="background:{hex(level.palette.pit)}"></i>pit (depth)</span>
    <span><i style="background:{hex(level.palette.water)}"></i>water</span>
    <span><i style="background:{hex(level.palette.stairsDown)}"></i>stairs↓</span>
    <span><i style="background:#ff3838"></i>boss</span>
    <span class="stats">
      {level.cols}×{level.rows} · open {level.openCount} · {Object.entries(counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ')}
    </span>
  </footer>
</main>

<style>
  main {
    padding: 16px 20px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }
  header a {
    color: #ffb047;
    text-decoration: none;
    font-weight: 600;
  }
  label {
    color: #9aa0aa;
    font-size: 13px;
  }
  input {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 7px;
    padding: 6px 9px;
    color: #eee;
    margin-left: 6px;
  }
  .levels {
    display: flex;
    gap: 6px;
  }
  .levels button {
    background: #1c1f27;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #cfd3db;
    border-radius: 7px;
    padding: 5px 11px;
    cursor: pointer;
  }
  .biome {
    color: #d8c48a;
    font-size: 13px;
  }
  .biome em {
    color: #9aa0aa;
    font-style: normal;
  }
  .wrap {
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    display: inline-block;
    max-width: 100%;
    background: #06070a;
  }
  canvas {
    display: block;
    image-rendering: pixelated;
  }
  footer {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 12px;
    color: #9aa0aa;
    font-size: 12px;
  }
  footer span {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  footer i {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    display: inline-block;
  }
  .stats {
    color: #6b7079;
  }
</style>
