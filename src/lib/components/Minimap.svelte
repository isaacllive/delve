<script lang="ts">
  // Corner minimap: a north-up, top-down window of the current floor centred on
  // the local delver. Terrain is drawn from the biome palette; cells beyond the
  // torch radius dim toward the dark (a light fog-of-war cue), the delver shows
  // its heading, teammates and nearby foes are dots, and stairs/exit are marked.
  // Purely presentational — it reads the same broadcast state the 3D view does.
  import type { DungeonLevel } from '$lib/game/dungeon.ts';
  import type { MonsterState, PlayerState } from '$lib/game/protocol.ts';
  import { cellIndex } from '$lib/game/grid.ts';

  let {
    level,
    players,
    monsters = [],
    youId,
    tick,
  }: {
    level: DungeonLevel;
    players: PlayerState[];
    monsters?: MonsterState[];
    youId: string | null;
    /** Redraw trigger — the server tick advances as the world moves. */
    tick: number;
  } = $props();

  const SIZE = 168; // canvas px (square)
  const RADIUS = 19; // cells shown out from the centre (window = 2R+1 per side)
  let canvas = $state<HTMLCanvasElement | null>(null);

  const me = $derived(players.find((p) => p.id === youId) ?? null);

  const hex = (n: number) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');

  /** Base RGB (0..255 triplet) for a cell kind from the level palette. */
  function kindColor(p: DungeonLevel['palette'], kind: string): [number, number, number] {
    const map: Record<string, number> = {
      floor: p.floor, wall: p.wall, ledge: p.ledge, pit: p.pit,
      water: p.water, stairsDown: p.stairsDown, stairsUp: p.stairsUp,
    };
    const n = map[kind] ?? p.floor;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  $effect(() => {
    void tick; // redraw as the world moves
    const cv = canvas;
    const l = level;
    if (!cv || !l) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    // Centre on the delver (fall back to the level entry pre-spawn).
    const cx = me ? me.col : l.entry.col;
    const cy = me ? me.row : l.entry.row;
    const torch = me ? Math.max(4, me.torchRadius) : 8;
    const span = RADIUS * 2 + 1;
    const cell = SIZE / span;
    const px = (col: number) => (col - (cx - RADIUS)) * cell;
    const py = (row: number) => (row - (cy - RADIUS)) * cell;

    ctx.clearRect(0, 0, SIZE, SIZE);
    // Dark backdrop (unseen void).
    ctx.fillStyle = hex(l.palette.bg);
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Terrain window, dimmed by distance from the delver (fog cue).
    for (let dr = -RADIUS; dr <= RADIUS; dr++) {
      for (let dc = -RADIUS; dc <= RADIUS; dc++) {
        const col = cx + dc, row = cy + dr;
        if (col < 0 || row < 0 || col >= l.cols || row >= l.rows) continue;
        const kind = l.cells[cellIndex(col, row, l.cols)].kind;
        const [r, g, b] = kindColor(l.palette, kind);
        // Full brightness within the torch, easing to a dim memory past it.
        const dist = Math.hypot(dc, dr);
        const lit = dist <= torch ? 1 : Math.max(0.28, 1 - (dist - torch) / RADIUS);
        ctx.fillStyle = `rgb(${r * lit}, ${g * lit}, ${b * lit})`;
        ctx.fillRect(px(col), py(row), Math.ceil(cell), Math.ceil(cell));
      }
    }

    const dot = (col: number, row: number, color: string, rad: number, ring = false) => {
      const x = px(col) + cell / 2, y = py(row) + cell / 2;
      if (x < -rad || y < -rad || x > SIZE + rad || y > SIZE + rad) return;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      if (ring) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    };

    // Stairs / exit landmarks (drawn under actors).
    if (l.boss) dot(l.boss.col, l.boss.row, '#ff5a5a', 4, true);
    if (l.exit) dot(l.exit.col, l.exit.row, '#8affff', 4, true);

    // Nearby foes only (within a hair past torch range) — no wall-hack reveal.
    for (const mo of monsters) {
      if (Math.hypot(mo.col - cx, mo.row - cy) > torch * 1.3) continue;
      dot(mo.col, mo.row, mo.boss ? '#ff3838' : '#ff7a6a', mo.boss ? 4 : 2.4);
    }

    // Teammates, then the local delver on top with a heading tick.
    for (const p of players) {
      if (p.id === youId) continue;
      dot(p.col, p.row, p.color, 2.8);
    }
    if (me) {
      dot(me.col, me.row, me.color, 3.4);
      const x = px(me.col) + cell / 2, y = py(me.row) + cell / 2;
      // facing 0 = North (−row); dir = (sin, −cos) in (col,row) space.
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(me.facing) * 9, y - Math.cos(me.facing) * 9);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
</script>

<div class="minimap" aria-label="Minimap">
  <canvas bind:this={canvas} width={SIZE} height={SIZE}></canvas>
  <span class="depth">{level.biomeName} · {me ? `${me.col},${me.row}` : '—'}</span>
</div>

<style>
  .minimap {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 30;
    padding: 6px;
    border-radius: 10px;
    background: rgba(10, 12, 16, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    line-height: 0;
  }
  canvas {
    display: block;
    border-radius: 6px;
    image-rendering: pixelated;
  }
  .depth {
    display: block;
    margin-top: 4px;
    text-align: center;
    line-height: 1.2;
    font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #8a909a;
    letter-spacing: 0.3px;
  }
</style>
