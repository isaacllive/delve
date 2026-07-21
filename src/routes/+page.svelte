<script lang="ts">
  import { goto } from '$app/navigation';
  import { randomSeed } from '$lib/game/rng.ts';
  import { CLASSES, randomClassId, roleLabel } from '$lib/game/classes.ts';

  let screen = $state<'title' | 'create'>('title');
  let name = $state('');
  let code = $state('');
  let seed = $state('');
  let classId = $state(CLASSES[0].id);
  const chosen = $derived(CLASSES.find((c) => c.id === classId) ?? CLASSES[0]);

  // Deterministic ember decoration (index-based so SSR + client hydration match).
  const embers = Array.from({ length: 14 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 7) * 0.9,
    dur: 5 + (i % 5),
    size: 2 + (i % 3),
  }));

  function randCode(): string {
    const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += cs[Math.floor(Math.random() * cs.length)];
    return s;
  }

  function surprise() {
    classId = randomClassId();
    if (!name.trim()) name = randomName();
  }
  function randomName(): string {
    const a = ['Bram', 'Sela', 'Tor', 'Vex', 'Rune', 'Kael', 'Mira', 'Dusk', 'Fenn', 'Wren'];
    return a[Math.floor(Math.random() * a.length)];
  }

  function play(joinCode: string) {
    const n = name.trim() || 'Delver';
    const params = new URLSearchParams({ name: n, class: classId });
    if (seed.trim()) params.set('seed', seed.trim());
    goto(`/play/${joinCode.toUpperCase()}?${params.toString()}`);
  }

  function host() {
    if (!seed.trim()) seed = randomSeed();
    play(randCode());
  }
  function join() {
    if (code.trim()) play(code.trim());
  }
</script>

<main>
  <div class="embers" aria-hidden="true">
    {#each embers as e, i (i)}
      <span
        style="left:{e.left}%; width:{e.size}px; height:{e.size}px; animation-delay:{e.delay}s; animation-duration:{e.dur}s"
      ></span>
    {/each}
  </div>

  {#if screen === 'title'}
    <div class="title">
      <div class="glyph">⛏</div>
      <h1 class="big">DELVE</h1>
      <p class="tag">A co-op descent into a procedural dark.</p>
      <button class="descend" onclick={() => (screen = 'create')}>Descend ▾</button>
      <div class="feats">100 floors · 5 biomes · permadeath · co-op</div>
      <a class="debug" href="/debug">▸ dungeon generator preview</a>
    </div>
  {:else}
    <div class="card">
      <button class="back" onclick={() => (screen = 'title')}>← title</button>
      <h1>DELVE</h1>
      <p class="tag">A co-op descent into a procedural dark.</p>

      <label>Your name<input bind:value={name} placeholder="Delver" maxlength="24" /></label>

    <div class="class-head">
      <span>Choose your delver</span>
      <button class="ghost" onclick={surprise}>🎲 Surprise me</button>
    </div>
    <div class="classes">
      {#each CLASSES as c (c.id)}
        <button
          class="class-card"
          class:sel={c.id === classId}
          style="--accent:{c.accent}"
          onclick={() => (classId = c.id)}
        >
          <b>{c.name}</b>
          <em>{roleLabel(c.role)}</em>
        </button>
      {/each}
    </div>
    <div class="class-detail" style="--accent:{chosen.accent}">
      <p class="blurb">{chosen.blurb}</p>
      <div class="stats"><span>♥ {chosen.hp} HP</span><span>👁 {chosen.torchRadius} vision</span></div>
      <ul>
        {#each chosen.abilities as ab (ab.name)}
          <li><b>{ab.name}</b> — {ab.desc}</li>
        {/each}
      </ul>
    </div>

    <div class="row">
      <button class="primary" onclick={host}>Host a new run</button>
    </div>

    <details>
      <summary>Options</summary>
      <label>Seed (optional)<input bind:value={seed} placeholder="leave blank for random" /></label>
    </details>

    <div class="sep"><span>or join</span></div>

    <form
      class="join"
      onsubmit={(e) => {
        e.preventDefault();
        join();
      }}
    >
      <input bind:value={code} placeholder="JOIN CODE" maxlength="12" style="text-transform:uppercase" />
      <button type="submit">Join</button>
    </form>

      <a class="debug" href="/debug">▸ dungeon generator preview</a>
    </div>
  {/if}
</main>

<style>
  main {
    position: relative;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px;
    overflow: hidden;
    background: radial-gradient(120% 90% at 50% -10%, #16110a 0%, #08090c 55%);
  }

  /* Drifting embers */
  .embers {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .embers span {
    position: absolute;
    bottom: -10px;
    border-radius: 50%;
    background: #ff9a3d;
    box-shadow: 0 0 6px 1px rgba(255, 140, 50, 0.6);
    opacity: 0;
    animation-name: rise;
    animation-iteration-count: infinite;
    animation-timing-function: ease-in;
  }
  @keyframes rise {
    0% {
      transform: translateY(0) translateX(0);
      opacity: 0;
    }
    12% {
      opacity: 0.9;
    }
    80% {
      opacity: 0.5;
    }
    100% {
      transform: translateY(-70vh) translateX(20px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .embers span {
      animation: none;
      display: none;
    }
  }

  /* Title screen */
  .title {
    position: relative;
    text-align: center;
    display: grid;
    justify-items: center;
    gap: 14px;
  }
  .title .glyph {
    font-size: 44px;
    filter: drop-shadow(0 0 18px rgba(255, 150, 60, 0.5));
  }
  h1.big {
    margin: 0;
    font-size: clamp(64px, 16vw, 132px);
    letter-spacing: 16px;
    line-height: 1;
    background: linear-gradient(180deg, #ffe6a8 0%, #ff9f43 60%, #d9711f 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    text-shadow: 0 0 60px rgba(255, 140, 50, 0.25);
  }
  .descend {
    margin-top: 8px;
    padding: 14px 40px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 1px;
    border: none;
    border-radius: 11px;
    cursor: pointer;
    color: #201404;
    background: linear-gradient(180deg, #ffbe55, #ff9a3d);
    box-shadow: 0 10px 34px rgba(255, 140, 50, 0.3);
    animation: pulse 2.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 10px 34px rgba(255, 140, 50, 0.25);
    }
    50% {
      box-shadow: 0 10px 44px rgba(255, 140, 50, 0.55);
    }
  }
  .descend:hover {
    filter: brightness(1.08);
  }
  .feats {
    color: #8a8f99;
    font-size: 12px;
    letter-spacing: 1px;
  }
  .back {
    background: transparent;
    border: none;
    color: #8a8f99;
    font-size: 12px;
    cursor: pointer;
    padding: 0 0 10px;
  }
  .back:hover {
    color: #cfd3db;
  }
  .card {
    width: 100%;
    max-width: 440px;
    background: rgba(16, 18, 24, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 28px 26px 22px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  }
  h1 {
    margin: 0;
    font-size: 40px;
    letter-spacing: 8px;
    background: linear-gradient(180deg, #ffd98a, #ff9f43);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .tag {
    margin: 4px 0 22px;
    color: #9aa0aa;
    font-size: 13px;
  }
  label {
    display: block;
    font-size: 12px;
    color: #9aa0aa;
    margin-bottom: 14px;
  }
  input {
    width: 100%;
    margin-top: 5px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9px;
    padding: 10px 12px;
    color: #eee;
    font-size: 15px;
  }
  input:focus {
    outline: none;
    border-color: #ffb04788;
  }
  .class-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    color: #9aa0aa;
    font-size: 12px;
  }
  .ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #cfd3db;
    padding: 5px 9px;
    font-size: 12px;
    font-weight: 500;
  }
  .classes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7px;
    margin-bottom: 10px;
  }
  .class-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 9px 4px;
    background: #191c24;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 9px;
    cursor: pointer;
    color: #cfd3db;
  }
  .class-card b {
    color: var(--accent);
    font-size: 13px;
  }
  .class-card em {
    font-style: normal;
    font-size: 10px;
    color: #8a8f99;
  }
  .class-card.sel {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent) inset;
  }
  .class-detail {
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-left: 3px solid var(--accent);
    border-radius: 9px;
    padding: 11px 13px;
    margin-bottom: 14px;
  }
  .class-detail .blurb {
    margin: 0 0 8px;
    color: #dfe2e8;
    font-size: 13px;
  }
  .class-detail .stats {
    display: flex;
    gap: 14px;
    color: #9aa0aa;
    font-size: 12px;
    margin-bottom: 8px;
  }
  .class-detail ul {
    margin: 0;
    padding-left: 16px;
    color: #b6bbc4;
    font-size: 12px;
    line-height: 1.5;
  }
  .class-detail ul b {
    color: #e6e8ec;
  }
  .row {
    margin: 6px 0 12px;
  }
  button {
    border: none;
    border-radius: 9px;
    padding: 11px 16px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    background: #232733;
    color: #e8eaef;
  }
  button.primary {
    width: 100%;
    background: linear-gradient(180deg, #ffbe55, #ff9a3d);
    color: #201404;
  }
  button:hover {
    filter: brightness(1.08);
  }
  details {
    margin-bottom: 6px;
  }
  summary {
    cursor: pointer;
    color: #8a8f99;
    font-size: 12px;
    margin-bottom: 8px;
  }
  .sep {
    display: flex;
    align-items: center;
    text-align: center;
    color: #6b7079;
    font-size: 11px;
    margin: 14px 0;
  }
  .sep::before,
  .sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
  }
  .sep span {
    padding: 0 10px;
  }
  .join {
    display: flex;
    gap: 8px;
  }
  .join input {
    margin-top: 0;
    letter-spacing: 2px;
  }
  .debug {
    display: block;
    margin-top: 18px;
    text-align: center;
    color: #6b7079;
    font-size: 12px;
    text-decoration: none;
  }
  .debug:hover {
    color: #9aa0aa;
  }
</style>
