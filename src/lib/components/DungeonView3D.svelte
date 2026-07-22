<script lang="ts">
  // Fresh, focused Three.js renderer for a dungeon level. Reuses the PATTERNS
  // from RealmQuest's Scene3D.svelte (WebGLRenderer + PerspectiveCamera +
  // OrbitControls; 1 grid cell = 1 world unit; elevation → world Y; walls are
  // tall boxes; torches are lights), but is purpose-built for the roguelike:
  //
  //  • Terrain is ONE InstancedMesh of unit boxes — per-cell height gives real
  //    verticality (raised ledges, sunken pits/water, tall walls).
  //  • Fog of war is expressed in 3D: a cell you've never seen has zero scale
  //    (invisible), so the dungeon literally materializes around your torch as
  //    you explore. Revealed-but-unseen cells render dim from memory; currently
  //    lit cells are bright and warm-tinted.
  //  • Brightness per cell comes from the ported vision math (cellVisibility +
  //    hasLineOfSight + cellLitByLights) — the same model RealmQuest uses.

  import { onMount, onDestroy } from 'svelte';
  import type { DungeonLevel } from '$lib/game/dungeon.ts';
  import type { LootState, MonsterAwareness, MonsterState, PlayerState, TrapState } from '$lib/game/protocol.ts';
  import { cellIndex } from '$lib/game/grid.ts';
  import { occluderHeight, WALL_HEIGHT } from '$lib/game/terrain.ts';
  import { hasLineOfSight } from '$lib/game/los.ts';
  import { cellVisibility, type VisionSource } from '$lib/game/vision.ts';
  import { cellLitByLights } from '$lib/game/lighting.ts';
  import { MODEL_BY_ID, pickMiniId, makeKit, type ModelKit } from '$lib/models3d/index.ts';
  import { disposeObject3D } from '$lib/threeDispose.ts';
  import { VoxelTerrain } from '$lib/components/voxelTerrain.ts';
  import { buildTerrainAtlas, type UVRect } from '$lib/render/textures.ts';

  let {
    level,
    players,
    monsters = [],
    loot = [],
    traps = [],
    youId,
    tick,
    bossDefeated = false,
    onYaw,
    // ── DEBUG toggles ───────────────────────────────────────────────────────
    // Exposed as props so the in-game debug menu can flip them live. Defaults
    // preserve the current dev view: all terrain shown (no fog), ceiling on.
    // Set showAllTerrain=false + hideCeiling=false to restore fog-of-war under
    // an enclosed roof.
    debugShowAllTerrain = true,
    debugHideCeiling = false,
    debugAmbient = 0.4,
    // Render monsters/players as procedural figures (imported minis) instead of
    // the plain octahedron/capsule primitives. Toggle off to fall back.
    useFigures = true,
    // Render the floor/roof as a real face-culled VOXEL MESH (voxel engine)
    // instead of the per-cell InstancedMesh boxes. Same 2D vision/fog — it's
    // just fed to the voxel shader's per-cell light/alpha texture.
    useVoxelTerrain = false,
  }: {
    level: DungeonLevel;
    players: PlayerState[];
    monsters?: MonsterState[];
    loot?: LootState[];
    traps?: TrapState[];
    youId: string | null;
    tick: number;
    bossDefeated?: boolean;
    /** Reports the camera's azimuth (radians) whenever it changes, so the HUD
     *  compass can orient relative to the current view. */
    onYaw?: (yaw: number) => void;
    debugShowAllTerrain?: boolean;
    debugHideCeiling?: boolean;
    debugAmbient?: number;
    useFigures?: boolean;
    useVoxelTerrain?: boolean;
  } = $props();

  let host: HTMLDivElement;
  // Three.js handles (kept out of $state — no reactivity needed).
  let THREE: typeof import('three');
  let renderer: import('three').WebGLRenderer | null = null;
  let scene: import('three').Scene | null = null;
  let camera: import('three').PerspectiveCamera | null = null;
  let controls: any = null;
  let terrain: import('three').InstancedMesh | null = null;
  // Overhead rock. Rendered over every revealed cell so the cavern reads as
  // enclosed — except a torch-lit oculus punched open above each player so you
  // can still see down onto your character (the "visual hole", extended up).
  let ceiling: import('three').InstancedMesh | null = null;
  let ceilMatrix: import('three').Matrix4[] = [];
  // Neutral procedural rock atlas (floor | wall | ceiling), tinted per-cell by
  // the biome palette via instanceColor. Built once on first level, shared by
  // both terrain + ceiling materials, disposed on teardown.
  let terrainAtlas: import('three').Texture | null = null;
  let atlasRects: { floor: UVRect; wall: UVRect; ceiling: UVRect } | null = null;
  // Alternate face-culled voxel-mesh floor/roof (built lazily when
  // useVoxelTerrain is on). Fed the same per-cell brightness/reveal the
  // instanced path computes, via its light/alpha shader texture.
  let voxelTerrain: VoxelTerrain | null = null;
  let voxelBuiltKey = '';
  let voxBright = new Float32Array(0); // per-cell target brightness (0..1)
  let voxDirty = false; // light/alpha changed → re-upload next frame
  let avatarGroup: import('three').Group | null = null;
  let torchLights: import('three').PointLight[] = [];
  // Loot meshes registered for a slow spin/bob so treasure catches the eye at
  // the game's shallow camera angle. Rebuilt each refreshAvatars.
  let lootSpin: import('three').Mesh[] = [];
  // Procedural-figure toolkit (built once THREE loads) + a template cache. Each
  // distinct (modelId, tint) is built ONCE into a lit Group; per-instance
  // avatars are cheap clones sharing that geometry/material. Clones are tagged
  // userData.shared so the refresh teardown (disposeObject3D skipShared) frees
  // the throwaway primitives but never the cached templates.
  let kit: ModelKit | null = null;
  const figTemplates = new Map<string, import('three').Group>();
  // Billboard sprite materials for the monster awareness glyphs (💤 / ❓ / ‼️),
  // built once per state + reused. Marked shared on each Sprite so the avatar
  // refresh teardown leaves the cached material/texture intact.
  const awarenessMats = new Map<MonsterAwareness, import('three').SpriteMaterial>();
  let raf = 0;
  let disposed = false;
  // Flipped true once the async Three.js init finishes. It's $state so the
  // build/update $effect re-runs after init — otherwise a player who connects
  // and stays still would render a blank canvas (the effect's first run bails
  // out because THREE isn't loaded yet, and nothing re-triggers it).
  let ready = $state(false);

  // Per-cell "full" transform for the current level (position + box height),
  // and whether the cell has ever been revealed (fog memory).
  // Ground/wall terrain is an InstancedMesh of stacked blocks. A WALL column is
  // split into multiple blocks — a buried base plus one unit block per world-Y
  // level up to the roof — so the column dissolves block-by-block as the
  // camera→delver cutaway carves through it (rather than the whole wall popping
  // out at once). Floors/ledges stay a single block. `cellBlock{Start,Count}`
  // map each cell to its contiguous run of block instances; `blockCell/Y/H`
  // describe each block. The reveal/fog fade is per cell (a cell's blocks share
  // it); the occluder fade (`occFade`) is per block.
  let baseColor: import('three').Color[] = [];
  let cellBlockStart: Int32Array = new Int32Array(0);
  let cellBlockCount: Uint16Array = new Uint16Array(0);
  let blockCell: Int32Array = new Int32Array(0);
  let blockY: Float32Array = new Float32Array(0);
  let blockH: Float32Array = new Float32Array(0);
  let revealed: boolean[] = [];
  // Persistent fog memory per floor: once seen, terrain is dimly remembered even
  // after you leave and return (Brogue-style). Keyed by depth; `revealed` aliases
  // the current floor's array, so in-place reveals keep accumulating across
  // revisits instead of resetting every time the level is rebuilt.
  const revealedByFloor = new Map<number, boolean[]>();

  // ── fade state ──────────────────────────────────────────────────────────
  // Terrain and ceiling tiles fade their colour in/out over time instead of
  // popping, so the edge of your torchlight and the moving ceiling dome
  // dissolve smoothly. `*Target` = steady-state rgb, `*Show` = 0/1 desired
  // visibility, `*Fade` = current eased 0..1. Only cells mid-transition live in
  // the fade set (processed each frame); steady cells are written on tick.
  let terrTarget: Float32Array = new Float32Array(0);
  let terrShow: Uint8Array = new Uint8Array(0);
  let terrFade: Float32Array = new Float32Array(0);
  let ceilTarget: Float32Array = new Float32Array(0);
  let ceilShow: Uint8Array = new Uint8Array(0);
  let ceilFade: Float32Array = new Float32Array(0);
  const terrFadeSet = new Set<number>();
  const ceilFadeSet = new Set<number>();
  const FADE_SPEED = 3.2; // 1/seconds → ~0.3s fade
  let lastFrame = 0;

  // Per-cell base box extents (bottom + height), so occluding walls can be
  // shrunk (cut away) when they block the camera→character view.
  let occFade: Float32Array = new Float32Array(0); // 0 = solid, 1 = faded out
  let occFadeCeil: Float32Array = new Float32Array(0);
  let alphaAttr: import('three').InstancedBufferAttribute | null = null;
  let ceilAlphaAttr: import('three').InstancedBufferAttribute | null = null;
  const occActive = new Set<number>();
  const occActiveCeil = new Set<number>();
  let curCols = 1;
  const OCC_SPEED = 9;
  const OCC_MAX = 1.0; // fully invisible inside the clear circle
  // Screen-space clear circle (NDC radius) centred on the character: blocking
  // terrain vanishes inside R_IN and fades back to solid by R_OUT.
  const OCC_R_IN = 0.42;
  const OCC_R_OUT = 0.66;
  const OCC_SCAN = 24; // cells around the player to consider

  // Behind-the-character follow camera. After a move, the camera azimuth eases
  // to sit behind the player (facing their heading); when idle the user can
  // free-look, and the next move swings it back.
  const REALIGN_WINDOW = 900; // ms of easing triggered by each move/turn
  const ALIGN_EASE = 0.22; // snappier swing so turning clearly pivots the camera
  let desiredAz = 0; // = -facing
  let realignAt = -1e9;

  // Avatar turn-in-place: rather than snapping a figure to its new heading, we
  // ease its yaw toward the true facing so a turn sweeps through the intervening
  // angles — e.g. facing away → NE → East, or a side turn pivoting to face the
  // camera. `faceVis` holds each delver's current (eased) heading, keyed by id
  // and surviving the per-move figure rebuild; `turners` are the live figure +
  // arrow objects the animate loop nudges each frame. Framerate-independent
  // exponential ease at TURN_EASE_PER_SEC (higher = snappier).
  const TURN_EASE_PER_SEC = 14;
  const faceVis = new Map<string, number>();
  type Turner = {
    id: string;
    fig: import('three').Object3D | null;
    arrow: import('three').Object3D;
    col: number;
    row: number;
    elevation: number;
    target: number; // true heading (radians) to ease toward
  };
  let turners: Turner[] = [];
  let _turnUp: import('three').Vector3;
  let _turnDir: import('three').Vector3;

  // Point a figure + its ground arrow at heading `vis` (radians). Figures model
  // forward as +z and heading 0 = North (−z), so yaw = π − vis; the arrow points
  // along dir = (sin, 0, −cos) and sits half a cell ahead of the delver.
  function orientAvatar(t: Turner, vis: number) {
    if (!_turnUp) {
      _turnUp = new THREE.Vector3(0, 1, 0);
      _turnDir = new THREE.Vector3();
    }
    if (t.fig) t.fig.rotation.y = Math.PI - vis;
    const dir = _turnDir.set(Math.sin(vis), 0, -Math.cos(vis));
    t.arrow.quaternion.setFromUnitVectors(_turnUp, dir);
    t.arrow.position.set(t.col + dir.x * 0.5, t.elevation + 0.5, t.row + dir.z * 0.5);
  }
  let meCell = { col: 0, row: 0, elev: 0 };
  let builtLevelKey = '';

  // Close, third-person-ish camera that pivots around the character (the
  // OrbitControls target follows the player, so dragging orbits around them).
  const CAM_OFFSET = { x: 0, y: 5, z: 6.5 };
  const camTarget = { x: 0, y: 0, z: 0 };
  // Oculus = the opening punched in the roof above each delver; the ceiling
  // dome extends CEIL_R out from each player and fades into the dark at its
  // edge. Per-cell roof height comes from terrain generation (cell.ceiling).
  const OCULUS_R = 6.5;
  const CEIL_R = 20;
  const CEIL_FALLBACK = WALL_HEIGHT - 1;
  const CEIL_ROCK = 0x241f1b;
  // Previous look-target, so each frame we pan the camera POSITION by the same
  // delta the target moved — the whole rig travels with the player (preserving
  // the user's orbit/zoom), instead of the camera staying put and only
  // re-aiming (which made the player walk out of frame → felt like a move cap).
  const camPrev = { x: 0, y: 0, z: 0 };
  let camInit = false;

  // ── terrain palette (per biome; supplied by the level) ────────────────────
  function palColor(p: DungeonLevel['palette'], kind: string): number {
    switch (kind) {
      case 'wall': return p.wall;
      case 'ledge': return p.ledge;
      case 'pit': return p.pit;
      case 'water': return p.water;
      case 'stairsDown': return p.stairsDown;
      case 'stairsUp': return p.stairsUp;
      default: return p.floor;
    }
  }
  // Current level's ceiling-rock tint (set per build from the biome palette).
  let curRock = CEIL_ROCK;

  // ── voxel volume ──────────────────────────────────────────────────────────
  // The world is a solid rock mass with carved-out air (Minecraft-cave style):
  // per cell, rock fills from VOX_BASE up to the floor surface, and from the
  // roof up to VOX_TOP; walls are solid the whole column. The air pocket
  // between the floor and the roof is where you explore.
  const VOX_BASE = -3; // bottom of the floor rock mass
  const VOX_TOP = 15; // top of the roof rock mass (above the tallest ceiling)

  /** [bottom, top] extents of a cell's GROUND block: the solid floor mass up to
   *  the walkable surface (`elevation`), or the full solid column for a wall. */
  function groundExtents(kind: string, elevation: number): [number, number] {
    if (kind === 'wall') return [VOX_BASE, VOX_TOP]; // solid rock column
    return [VOX_BASE, elevation]; // floor mass up to the surface you stand on
  }

  /** Split a cell's GROUND mass into stacked [bottom, top] blocks. A wall
   *  becomes a buried base block (below the walkable level, never seen) plus one
   *  unit block per world-Y step up to the roof, so the visible column is made
   *  of individually-fadeable blocks. Floors/ledges stay a single block (they're
   *  short and never carved through). */
  function columnBlocks(kind: string, elevation: number): [number, number][] {
    const [gb, gt] = groundExtents(kind, elevation);
    if (kind !== 'wall') return [[gb, gt]];
    const GROUND = 0; // walkable reference level; below it is buried rock
    const blocks: [number, number][] = [[gb, GROUND]];
    for (let y = GROUND; y < gt - 1e-6; y += 1) blocks.push([y, Math.min(y + 1, gt)]);
    return blocks;
  }

  /** Small deterministic per-cell tone jitter so big rock faces aren't flat. */
  function jitter(i: number): number {
    const h = Math.sin(i * 12.9898) * 43758.5453;
    return (h - Math.floor(h) - 0.5) * 0.1;
  }

  /** A unit box with per-FACE vertex shading (top bright, sides mid, bottom
   *  dark) baked in, so instanced blocks read as lit voxels — combined with the
   *  per-instance colour, this is the Minecraft-cave look. Includes the
   *  `instanceAlpha` attribute for the occlusion fade. */
  function makeVoxelGeo(
    count: number,
    attr: import('three').InstancedBufferAttribute,
    faceRects?: readonly UVRect[],
  ) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    // BoxGeometry face order: +X, -X, +Y(top), -Y(bottom), +Z, -Z (4 verts each).
    const shade = [0.74, 0.74, 1.0, 0.6, 0.82, 0.68];
    const colors = new Float32Array(24 * 3);
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const s = shade[f];
        const o = (f * 4 + v) * 3;
        colors[o] = s;
        colors[o + 1] = s;
        colors[o + 2] = s;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('instanceAlpha', attr);
    // Remap each face's 0..1 UVs into its atlas sub-rect so the tile texture
    // samples the right tile per face (top→floor, sides→wall, etc.). Each face
    // shows exactly one tile; scaled instances stretch that tile (accepted —
    // floor tops are unit cells and tile perfectly; tall walls stretch).
    if (faceRects) {
      const uv = geo.attributes.uv as import('three').BufferAttribute;
      for (let f = 0; f < 6; f++) {
        const [u0, v0, u1, v1] = faceRects[f];
        for (let v = 0; v < 4; v++) {
          const idx = f * 4 + v;
          uv.setXY(idx, u0 + uv.getX(idx) * (u1 - u0), v0 + uv.getY(idx) * (v1 - v0));
        }
      }
      uv.needsUpdate = true;
    }
    return geo;
  }

  async function init() {
    THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    if (disposed) return;
    kit = makeKit(THREE);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06070a);
    scene.fog = new THREE.Fog(0x06070a, 22, 48);

    camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 3;
    controls.maxDistance = 24;

    // A dim ambient so revealed-but-dark memory isn't pure black; torches do
    // the real lighting on avatars/props.
    scene.add(new THREE.AmbientLight(0x223, 0.6));

    avatarGroup = new THREE.Group();
    scene.add(avatarGroup);

    resize();
    window.addEventListener('resize', resize);
    animate();
    ready = true; // signal the build/update effect to run now that THREE exists
  }

  function resize() {
    if (!renderer || !camera || !host) return;
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function levelKey(l: DungeonLevel): string {
    return `${l.depth}:${l.cols}x${l.rows}`;
  }

  /** A MeshBasicMaterial with per-instance `instanceAlpha` transparency, so
   *  individual cells can fade out (walls/roof between camera and character). */
  function alphaMat(map?: import('three').Texture | null): import('three').MeshBasicMaterial {
    // vertexColors → the baked per-face shading; instanceColor (per cell) and
    // instanceAlpha (occlusion fade) multiply on top in the shader. An optional
    // `map` adds the neutral rock tile detail (multiplied on top of all three).
    //
    // Occluder cutout uses HASHED alpha (dithered discard), not blended
    // transparency. Blended transparency would keep the mesh in the transparent
    // pass while still writing depth, so a faded-out wall cell would occlude the
    // cells *behind* it in the depth buffer — revealing the void background
    // instead of the deeper rock. Hashed alpha keeps the mesh opaque: discarded
    // (faded) fragments write no depth, so whatever stands behind them renders
    // normally, while solid cells (instanceAlpha 1) always pass and stay opaque.
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, map: map ?? null });
    m.alphaHash = true;
    m.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'attribute float instanceAlpha;\nvarying float vAlpha;\n' +
        shader.vertexShader.replace('void main() {', 'void main() {\n\tvAlpha = instanceAlpha;');
      // Fold the per-cell fade into diffuseColor.a *before* the hashed-alpha
      // discard reads it, so a low alpha dithers the cell away (and skips depth).
      shader.fragmentShader =
        'varying float vAlpha;\n' +
        shader.fragmentShader.replace(
          '#include <alphahash_fragment>',
          '\tdiffuseColor.a *= vAlpha;\n#include <alphahash_fragment>',
        );
    };
    return m;
  }

  /** Build (or rebuild) the InstancedMesh + per-cell caches for a level. */
  function buildLevel(l: DungeonLevel) {
    if (!scene || !THREE) return;
    // Repaint the world to this biome's palette.
    curRock = l.palette.rock;
    scene.background = new THREE.Color(l.palette.bg);
    if (scene.fog) (scene.fog as import('three').Fog).color.setHex(l.palette.bg);
    for (const mesh of [terrain, ceiling]) {
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as import('three').Material).dispose();
      }
    }
    // Build the neutral rock tile atlas once, then reuse it for every level.
    if (!terrainAtlas) {
      const atlas = buildTerrainAtlas();
      const tex = new THREE.CanvasTexture(atlas.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      // The atlas has no gutter, so clamp (not repeat) and skip mipmaps to keep
      // faces from bleeding into neighbouring tiles at distance.
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      terrainAtlas = tex;
      atlasRects = atlas.rects;
    }
    // Per-face atlas mapping. Face order: +X, -X, +Y(top), -Y(bottom), +Z, -Z.
    const { floor, wall, ceiling: ceil } = atlasRects!;
    const terrainRects: UVRect[] = [wall, wall, floor, wall, wall, wall]; // floor on top
    const ceilRects: UVRect[] = [ceil, ceil, ceil, ceil, ceil, ceil]; // roof rock all round

    const count = l.cols * l.rows;

    // First pass: split every cell's ground mass into stacked blocks and lay out
    // their contiguous instance ranges (walls → many blocks, others → one).
    cellBlockStart = new Int32Array(count);
    cellBlockCount = new Uint16Array(count);
    const perCell: [number, number][][] = new Array(count);
    let total = 0;
    for (let i = 0; i < count; i++) {
      const cell = l.cells[i];
      const blks = columnBlocks(cell.kind, cell.elevation);
      perCell[i] = blks;
      cellBlockStart[i] = total;
      cellBlockCount[i] = blks.length;
      total += blks.length;
    }
    blockCell = new Int32Array(total);
    blockY = new Float32Array(total);
    blockH = new Float32Array(total);

    // Two voxel layers: the GROUND rock mass (floor + solid walls, now stacked
    // blocks) and the ROOF rock mass hanging from the ceiling (one block/cell).
    // Per-instance alpha lets the camera→delver tunnel fade open.
    const alpha = new Float32Array(total).fill(1);
    alphaAttr = new THREE.InstancedBufferAttribute(alpha, 1);
    terrain = new THREE.InstancedMesh(makeVoxelGeo(total, alphaAttr, terrainRects), alphaMat(terrainAtlas), total);
    terrain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    terrain.frustumCulled = false;

    const calpha = new Float32Array(count).fill(1);
    ceilAlphaAttr = new THREE.InstancedBufferAttribute(calpha, 1);
    ceiling = new THREE.InstancedMesh(makeVoxelGeo(count, ceilAlphaAttr, ceilRects), alphaMat(terrainAtlas), count);
    ceiling.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ceiling.frustumCulled = false;
    ceilMatrix = new Array(count);

    baseColor = new Array(count);
    // Restore this floor's fog memory if we've visited before (dimensions are
    // deterministic per depth, so a cached array always matches); otherwise start
    // fresh. Store the reference so later reveals persist for the next revisit.
    const priorReveal = revealedByFloor.get(l.depth);
    revealed = priorReveal && priorReveal.length === count ? priorReveal : new Array(count).fill(false);
    revealedByFloor.set(l.depth, revealed);
    terrTarget = new Float32Array(count * 3);
    terrShow = new Uint8Array(count);
    terrFade = new Float32Array(count);
    ceilTarget = new Float32Array(count * 3);
    ceilShow = new Uint8Array(count);
    ceilFade = new Float32Array(count);
    occFade = new Float32Array(total); // per BLOCK now
    occFadeCeil = new Float32Array(count);
    voxBright = new Float32Array(count);
    curCols = l.cols;
    occActive.clear();
    occActiveCeil.clear();
    terrFadeSet.clear();
    ceilFadeSet.clear();

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let row = 0; row < l.rows; row++) {
      for (let col = 0; col < l.cols; col++) {
        const i = cellIndex(col, row, l.cols);
        const cell = l.cells[i];
        const roof = cell.ceiling ?? CEIL_FALLBACK;
        const c = new THREE.Color(palColor(l.palette, cell.kind));
        c.offsetHSL(0, 0, jitter(i));
        baseColor[i] = c;
        // GROUND: emit each stacked block. Adjacent cells at different heights
        // show their stepped side faces (blocky voxel floor); tall walls are now
        // a column of unit blocks that fade one at a time.
        const start = cellBlockStart[i];
        for (let k = 0; k < perCell[i].length; k++) {
          const [bb, bt] = perCell[i][k];
          const b = start + k;
          blockCell[b] = i;
          blockY[b] = (bb + bt) / 2;
          blockH[b] = Math.max(0.05, bt - bb);
          // Start hidden (zero scale) — unrevealed.
          terrain.setMatrixAt(b, ZERO_SCALE);
          terrain.setColorAt(b, BLACK);
        }
        // ROOF rock mass: solid from the ceiling up to the top of the volume,
        // so the roof is a hanging block, not a thin slab.
        const rh = Math.max(0.05, VOX_TOP - roof);
        pos.set(col, (roof + VOX_TOP) / 2, row);
        scl.set(1, rh, 1);
        m.compose(pos, quat, scl);
        ceilMatrix[i] = m.clone();
        ceiling.setMatrixAt(i, ZERO_SCALE);
        ceiling.setColorAt(i, BLACK);
      }
    }
    terrain.instanceMatrix.needsUpdate = true;
    ceiling.instanceMatrix.needsUpdate = true;
    if (terrain.instanceColor) terrain.instanceColor.needsUpdate = true;
    if (ceiling.instanceColor) ceiling.instanceColor.needsUpdate = true;
    scene.add(terrain);
    scene.add(ceiling);
    builtLevelKey = levelKey(l);
    // A fresh level invalidates any voxel mesh; syncTerrainMode rebuilds it for
    // the new floor if the voxel path is active.
    voxelBuiltKey = '';
    syncTerrainMode(l);
  }

  /** Reconcile which terrain renderer is visible with `useVoxelTerrain`. When
   *  the voxel path is on, hide the instanced floor/roof and (lazily) build +
   *  show the voxel mesh for this level; when off, hide the voxel mesh and show
   *  the instanced meshes. Cheap enough to call from the reactive effect so the
   *  debug toggle flips live. */
  function syncTerrainMode(l: DungeonLevel) {
    if (!scene || !THREE) return;
    const useVox = useVoxelTerrain;
    if (terrain) terrain.visible = !useVox;
    if (ceiling) ceiling.visible = !useVox;
    if (useVox) {
      if (!voxelTerrain) voxelTerrain = new VoxelTerrain(THREE, scene);
      const key = levelKey(l);
      if (voxelBuiltKey !== key) {
        voxelTerrain.build(l, l.palette);
        voxelBuiltKey = key;
        voxDirty = true;
      }
      if (voxelTerrain.mesh) voxelTerrain.mesh.visible = true;
      voxDirty = true; // re-upload light/alpha now that the mesh is showing
    } else if (voxelTerrain?.mesh) {
      voxelTerrain.mesh.visible = false;
    }
  }

  const warm = { r: 1.0, g: 0.72, b: 0.42 };

  /** Recompute per-cell fog + lighting for the current viewers and push to the
   *  InstancedMesh. Also refreshes avatars + torch point lights. */
  function updateFogAndActors(l: DungeonLevel, viewers: PlayerState[], you: PlayerState | undefined) {
    if (!terrain || !THREE || !scene || !avatarGroup) return;

    const occ = (c: number, r: number) => occluderHeight(l, c, r);
    const cellElev = (c: number, r: number) => {
      const cc = l.cells[cellIndex(c, r, l.cols)];
      return Math.max(0, cc ? cc.elevation : 0);
    };
    const sources: VisionSource[] = viewers.map((p) => ({
      col: p.col,
      row: p.row,
      elevation: p.elevation,
      range: p.torchRadius,
    }));
    const hasLos = (from: VisionSource, to: { col: number; row: number }) =>
      hasLineOfSight(from, to, occ, from.elevation ?? 0, cellElev(to.col, to.row));
    const losClear = (a: { col: number; row: number }, b: { col: number; row: number }) =>
      hasLineOfSight(a, b, occ, cellElev(a.col, a.row), cellElev(b.col, b.row));

    const col = new THREE.Color();
    const rockCol = new THREE.Color();
    for (let row = 0; row < l.rows; row++) {
      for (let cx = 0; cx < l.cols; cx++) {
        const i = cellIndex(cx, row, l.cols);
        const cell = { col: cx, row };
        let bright = cellVisibility({ cell, sources, hasLos, falloff: 1.4 });
        let tr = warm.r,
          tg = warm.g,
          tb = warm.b;

        // Fixed fixtures (braziers/crystals) reveal cells a player can see.
        if (bright < 0.55) {
          const lit = cellLitByLights({ cell, lights: l.lights, losClear });
          if (lit && sources.some((s) => hasLos(s, cell))) {
            bright = Math.max(bright, 0.55);
            const lc = new THREE.Color(lit.color);
            tr = lc.r;
            tg = lc.g;
            tb = lc.b;
          }
        }

        if (bright > 0) revealed[i] = true;
        const shown = debugShowAllTerrain || revealed[i];
        const isWall = l.cells[i].kind === 'wall';

        // ── Ceiling: a continuous rock ROOF over every open cell you can see
        // (walls already rise to the same roof, so wall + ceiling read as one
        // rock shell — Minecraft-cave style). Lit by the same brightness as the
        // floor; the camera→character tunnel dissolves whatever's in the way.
        if (!debugHideCeiling && shown && !isWall) {
          const lvlC = 0.14 + 0.7 * bright;
          rockCol.setRGB(
            (((curRock >> 16) & 255) / 255) * lvlC + warm.r * 0.14 * bright,
            (((curRock >> 8) & 255) / 255) * lvlC + warm.g * 0.1 * bright,
            ((curRock & 255) / 255) * lvlC + warm.b * 0.06 * bright,
          );
          setCeil(i, rockCol.r, rockCol.g, rockCol.b, 1);
        } else {
          setCeil(i, 0, 0, 0, 0);
        }

        // Terrain: one CONTINUOUS ramp from dim (bright 0) up to fully lit
        // (bright 1), so the edge of vision fades smoothly with no step. In
        // debugShowAllTerrain mode every cell is shown with an ambient floor
        // so the whole cave is visible while lighting still highlights it.
        if (!shown) {
          setTerr(i, 0, 0, 0, 0);
          voxBright[i] = 0;
        } else {
          const base = baseColor[i];
          const floor = debugShowAllTerrain ? debugAmbient : 0.14;
          const lvl = Math.max(floor, floor + (1 - floor) * bright);
          const mix = 0.28 * bright;
          col.setRGB(
            base.r * lvl * (1 - mix) + tr * mix,
            base.g * lvl * (1 - mix) + tg * mix,
            base.b * lvl * (1 - mix) + tb * mix,
          );
          setTerr(i, col.r, col.g, col.b, 1);
          // Voxel path: the mesher already baked palette colour × face shade, so
          // the shader only needs this brightness scalar (the fade + occluder
          // cutout are folded into alpha each frame in animate()).
          voxBright[i] = lvl;
        }
      }
    }
    voxDirty = true;
    terrain.instanceMatrix.needsUpdate = true;
    if (terrain.instanceColor) terrain.instanceColor.needsUpdate = true;
    if (alphaAttr) alphaAttr.needsUpdate = true;
    if (ceiling) {
      ceiling.instanceMatrix.needsUpdate = true;
      if (ceiling.instanceColor) ceiling.instanceColor.needsUpdate = true;
      if (ceilAlphaAttr) ceilAlphaAttr.needsUpdate = true;
    }

    refreshAvatars(viewers);
    if (you) followTarget(you);
  }

  // ── fade helpers ──────────────────────────────────────────────────────────
  // Write ONE ground block instance from its cell's eased reveal fade + colour
  // and its own occluder fade. The reveal (colour × visibility) is per cell; the
  // occluder cutout (per-instance alpha) is per block, so a wall column dissolves
  // block-by-block.
  function applyBlock(b: number) {
    if (!terrain || !THREE) return;
    const cell = blockCell[b];
    const f = terrFade[cell];
    if (f <= 0.001) {
      terrain.setMatrixAt(b, ZERO_SCALE);
      if (alphaAttr) alphaAttr.setX(b, 0);
      return;
    }
    const col = cell % curCols;
    const row = (cell - col) / curCols;
    _bpos.set(col, blockY[b], row);
    _bscl.set(1, blockH[b], 1);
    _bm.compose(_bpos, _bq, _bscl);
    terrain.setMatrixAt(b, _bm);
    tmpCol.setRGB(terrTarget[cell * 3] * f, terrTarget[cell * 3 + 1] * f, terrTarget[cell * 3 + 2] * f);
    terrain.setColorAt(b, tmpCol);
    if (alphaAttr) alphaAttr.setX(b, 1 - OCC_MAX * occFade[b]);
  }
  // Rewrite every block of a cell (used when the cell's reveal fade/colour ticks).
  function applyTerr(cell: number) {
    const s = cellBlockStart[cell];
    const n = cellBlockCount[cell];
    for (let k = 0; k < n; k++) applyBlock(s + k);
  }
  function applyCeil(i: number) {
    if (!ceiling || !THREE) return;
    const f = ceilFade[i];
    if (f <= 0.001) {
      ceiling.setMatrixAt(i, ZERO_SCALE);
      if (ceilAlphaAttr) ceilAlphaAttr.setX(i, 0);
      return;
    }
    ceiling.setMatrixAt(i, ceilMatrix[i]);
    tmpCol.setRGB(ceilTarget[i * 3] * f, ceilTarget[i * 3 + 1] * f, ceilTarget[i * 3 + 2] * f);
    ceiling.setColorAt(i, tmpCol);
    if (ceilAlphaAttr) ceilAlphaAttr.setX(i, 1 - OCC_MAX * occFadeCeil[i]);
  }
  /** Set a terrain cell's target colour + visibility; enqueue a fade if the
   *  current eased value differs, and render the current frame immediately. */
  function setTerr(i: number, r: number, g: number, b: number, show: number) {
    terrTarget[i * 3] = r;
    terrTarget[i * 3 + 1] = g;
    terrTarget[i * 3 + 2] = b;
    terrShow[i] = show;
    if (terrFade[i] !== show) terrFadeSet.add(i);
    applyTerr(i);
  }
  function setCeil(i: number, r: number, g: number, b: number, show: number) {
    ceilTarget[i * 3] = r;
    ceilTarget[i * 3 + 1] = g;
    ceilTarget[i * 3 + 2] = b;
    ceilShow[i] = show;
    if (ceilFade[i] !== show) ceilFadeSet.add(i);
    applyCeil(i);
  }
  /** Advance in-flight fades by dt seconds; write only the transitioning cells. */
  function stepFades(dt: number) {
    const step = dt * FADE_SPEED;
    if (terrFadeSet.size && terrain) {
      for (const i of terrFadeSet) {
        const tgt = terrShow[i];
        let f = terrFade[i];
        f = f < tgt ? Math.min(tgt, f + step) : Math.max(tgt, f - step);
        terrFade[i] = f;
        applyTerr(i);
        if (f === tgt) terrFadeSet.delete(i);
      }
      terrain.instanceMatrix.needsUpdate = true;
      if (terrain.instanceColor) terrain.instanceColor.needsUpdate = true;
      if (alphaAttr) alphaAttr.needsUpdate = true;
    }
    if (ceilFadeSet.size && ceiling) {
      for (const i of ceilFadeSet) {
        const tgt = ceilShow[i];
        let f = ceilFade[i];
        f = f < tgt ? Math.min(tgt, f + step) : Math.max(tgt, f - step);
        ceilFade[i] = f;
        applyCeil(i);
        if (f === tgt) ceilFadeSet.delete(i);
      }
      ceiling.instanceMatrix.needsUpdate = true;
      if (ceiling.instanceColor) ceiling.instanceColor.needsUpdate = true;
      if (ceilAlphaAttr) ceilAlphaAttr.needsUpdate = true;
    }
  }

  /** Push the current per-cell brightness + reveal into the voxel shader's
   *  light/alpha texture. Runs each frame while the voxel path is active, but
   *  only re-uploads when something changed (fog tick, an in-flight reveal
   *  fade, or an occluder cutout easing) so an idle scene costs nothing. Alpha
   *  = reveal-fade × (1 − roof-occluder), mirroring the instanced ceiling so
   *  the camera→delver tunnel opens the same way. */
  function syncVoxelTerrain() {
    if (!useVoxelTerrain || !voxelTerrain?.mesh) return;
    if (!voxDirty && terrFadeSet.size === 0 && occActiveCeil.size === 0) return;
    const L = voxelTerrain.light;
    const A = voxelTerrain.alpha;
    const n = voxBright.length;
    for (let i = 0; i < n; i++) {
      L[i] = voxBright[i];
      A[i] = terrFade[i] * (1 - OCC_MAX * occFadeCeil[i]);
    }
    voxelTerrain.upload();
    voxDirty = false;
  }

  let ZERO_SCALE: import('three').Matrix4;
  let BLACK: import('three').Color;
  let tmpCol: import('three').Color;
  // Reusable temps (allocated once THREE is loaded).
  let _camOff: import('three').Vector3;
  let _camSph: import('three').Spherical;
  let _v3: import('three').Vector3;
  let _right: import('three').Vector3;
  // Scratch for composing a ground BLOCK's matrix on the fly (avoids caching a
  // Matrix4 per block — there can be hundreds of thousands).
  let _bm: import('three').Matrix4;
  let _bpos: import('three').Vector3;
  let _bscl: import('three').Vector3;
  let _bq: import('three').Quaternion;

  /** A glowing portal column + light at a cell (camp descent / dungeon exit). */
  function addPortal(at: { col: number; row: number }, color: number) {
    if (!avatarGroup || !THREE || !scene) return;
    const portal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 3, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    portal.position.set(at.col, 1.5, at.row);
    portal.renderOrder = 22;
    avatarGroup.add(portal);
    const pl = new THREE.PointLight(color, 2.4, 14, 1.5);
    pl.position.set(at.col, 1.6, at.row);
    scene.add(pl);
    torchLights.push(pl);
  }

  // Each delver class → the PC mini that best fits its fantasy. Falls back to
  // keyword matching, then a plain commoner, so a figure always renders.
  const CLASS_MINI: Record<string, string> = {
    warden: 'knight',
    ranger: 'ranger',
    delver: 'hooded-rogue',
    mystic: 'mystic-oracle',
  };

  /** A CSS hex string for a THREE colour number (monster colours arrive as
   *  0xRRGGBB ints; the model builders + minis want a `#rrggbb` tint). */
  function hexColor(n: number): string {
    return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
  }

  /** A ready-to-place clone of the procedural figure for `modelId` tinted
   *  `tint`, or null if the model id is unknown. The first request for a given
   *  (id, tint) builds + caches the template; every later one is a clone that
   *  shares the template's geometry/materials (tagged shared so refresh
   *  teardown leaves them intact). */
  function figureFor(modelId: string, tint: string): import('three').Group | null {
    if (!kit) return null;
    const def = MODEL_BY_ID[modelId];
    if (!def) return null;
    const key = modelId + '|' + tint;
    let template = figTemplates.get(key);
    if (!template) {
      template = def.build(kit, tint);
      figTemplates.set(key, template);
    }
    const clone = template.clone(true);
    clone.traverse((o) => (o.userData.shared = true));
    return clone;
  }

  const AWARENESS_GLYPH: Record<MonsterAwareness, string> = {
    sleeping: '💤',
    wandering: '❓',
    hunting: '‼️',
  };

  /** A camera-facing sprite showing a monster's awareness glyph, or null when
   *  THREE isn't ready. The SpriteMaterial (with its canvas glyph texture) is
   *  cached per state and reused; each Sprite is tagged shared so the avatar
   *  refresh frees throwaway meshes but leaves the cached material alone. */
  function awarenessSprite(state: MonsterAwareness): import('three').Sprite | null {
    if (!THREE) return null;
    let mat = awarenessMats.get(state);
    if (!mat) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const ctx = cv.getContext('2d');
      if (ctx) {
        ctx.font = '46px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(AWARENESS_GLYPH[state], 32, 36);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      // depthTest off so the tag floats readable over the creature even through
      // rock; not fogged so distant states stay legible.
      mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false, transparent: true });
      awarenessMats.set(state, mat);
    }
    const sprite = new THREE.Sprite(mat);
    sprite.userData.shared = true; // keep the cached material on refresh teardown
    return sprite;
  }

  function refreshAvatars(viewers: PlayerState[]) {
    if (!avatarGroup || !THREE || !scene) return;
    // Rebuild the small avatar set + torch lights each update (cheap: a handful).
    for (const l of torchLights) scene.remove(l);
    torchLights = [];
    // Drop the previous frame's figure/arrow refs; we re-register the live ones
    // below so the animate loop keeps easing each delver's heading. faceVis
    // persists (keyed by id) so a rebuilt figure resumes mid-turn, not snapped.
    turners = [];
    lootSpin = [];
    // Free throwaway primitives (rings, arrows, loot, fallback shapes) but keep
    // the cached figure geometry/materials that clones share (userData.shared).
    while (avatarGroup.children.length) {
      const c = avatarGroup.children.pop()!;
      disposeObject3D(c, { skipShared: true });
    }

    // Monsters — a procedural creature figure picked from the foe's name
    // (goblin, skeleton, wolf…). Bosses loom large and cast a red light. When
    // no mini matches (or figures are disabled) fall back to the classic
    // octahedron so a foe is never invisible.
    for (const mo of monsters) {
      const miniId = useFigures ? pickMiniId(mo.name) : null;
      const fig = miniId ? figureFor(miniId, hexColor(mo.color)) : null;
      if (fig) {
        // Recipe figures stand ~1.1 units tall, base on y=0; scale bosses up.
        fig.scale.setScalar(mo.boss ? 2.1 : 1);
        fig.position.set(mo.col, 0, mo.row);
        fig.renderOrder = 16;
        avatarGroup.add(fig);
      } else {
        const r = mo.boss ? 0.85 : 0.34;
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(r),
          new THREE.MeshBasicMaterial({ color: mo.color, depthTest: false }),
        );
        mesh.position.set(mo.col, mo.boss ? 0.9 : 0.5, mo.row);
        mesh.renderOrder = 16;
        avatarGroup.add(mesh);
      }
      if (mo.boss) {
        const bl = new THREE.PointLight(0xff2020, 2.4, 14, 1.6);
        bl.position.set(mo.col, 1.4, mo.row);
        scene.add(bl);
        torchLights.push(bl);
      }
      // Awareness tag floating above the creature (💤 asleep, ❓ investigating,
      // ‼️ hunting). Skip the boss — it's permanently, obviously hostile.
      if (!mo.boss) {
        const tag = awarenessSprite(mo.state);
        if (tag) {
          tag.position.set(mo.col, 1.5, mo.row);
          tag.scale.setScalar(0.6);
          tag.renderOrder = 18;
          avatarGroup.add(tag);
        }
      }
    }

    // Revealed traps — a flat marker on the plate. Armed-but-spotted traps show
    // a bright warning ring; sprung ones a spent, dimmed disc so you can tell
    // which are still live. Only traps the server has revealed arrive here.
    for (const tr of traps) {
      const armed = !tr.sprung;
      const color = tr.kind === 'pit' ? 0xff8a3a : 0xffd23a;
      const ring = new THREE.Mesh(
        armed
          ? new THREE.TorusGeometry(0.32, 0.06, 8, 20)
          : new THREE.CircleGeometry(0.3, 20),
        new THREE.MeshBasicMaterial({
          color: armed ? color : 0x555555,
          depthTest: false,
          transparent: true,
          opacity: armed ? 0.9 : 0.5,
        }),
      );
      ring.rotation.x = -Math.PI / 2; // lie flat on the floor
      ring.position.set(tr.col, 0.06, tr.row);
      ring.renderOrder = 13;
      avatarGroup.add(ring);
    }

    // Loot: gold piles (tapered coin mounds) and potions (standing vials). Gold
    // used to be a flat 0.08-thick disc lying on the floor, which foreshortened
    // to an invisible sliver at the game's low camera angle — a mound stands
    // proud instead. Both are registered for a spin/bob (see animate) so they
    // glint and are easy to spot; depthTest off keeps them from being lost in
    // uneven rock.
    for (const it of loot) {
      const isGold = it.kind === 'gold';
      const mesh = new THREE.Mesh(
        isGold
          ? new THREE.CylinderGeometry(0.11, 0.2, 0.2, 16)
          : new THREE.CylinderGeometry(0.1, 0.14, 0.32, 8),
        new THREE.MeshBasicMaterial({ color: isGold ? 0xffcf3a : 0xff5a7a, depthTest: false }),
      );
      const baseY = isGold ? 0.13 : 0.22;
      mesh.position.set(it.col, baseY, it.row);
      mesh.renderOrder = 14;
      mesh.userData.baseY = baseY;
      mesh.userData.spin = isGold; // spin gold; vials only bob
      avatarGroup.add(mesh);
      lootSpin.push(mesh);
    }

    // Base-camp props: a descent portal + shop stalls.
    if (level.camp) {
      if (level.portal) addPortal(level.portal, 0xffd070);
      for (const s of level.shops ?? []) {
        const stall = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.8, 0.6),
          new THREE.MeshBasicMaterial({ color: 0x8a6a3a, depthTest: false }),
        );
        stall.position.set(s.col, 0.45, s.row);
        stall.renderOrder = 15;
        avatarGroup.add(stall);
      }
    }

    // Exit portal on the bottom floor, once the boss has fallen.
    if (level.exit && bossDefeated) {
      addPortal(level.exit, 0x8affff);
    }

    for (const p of viewers) {
      const isYou = p.id === youId;
      // Body: a procedural class figure (knight / ranger / rogue / oracle),
      // yawed to the delver's heading. The ring + arrow + beam below stay
      // depthTest-off locators, and the occluder cutaway clears rock between the
      // camera and the character, so the figure never gets lost behind a wall.
      // Heading 0 = North (−z); a figure faces +z, so yaw = π − facing.
      const classMini = useFigures
        ? CLASS_MINI[p.classId] ?? pickMiniId(`${p.classId} ${p.name}`) ?? 'commoner'
        : null;
      const fig = classMini ? figureFor(classMini, p.color) : null;
      if (fig) {
        fig.position.set(p.col, p.elevation, p.row);
        if (!isYou) fig.scale.multiplyScalar(0.98); // subtle: others read slightly smaller
        avatarGroup.add(fig);
      } else {
        // Fallback: the classic through-rock capsule (depthTest off).
        const geo = new THREE.CapsuleGeometry(0.28, 0.5, 4, 8);
        const mat = new THREE.MeshBasicMaterial({
          color: p.color,
          depthTest: false,
          transparent: true,
          opacity: isYou ? 1 : 0.92,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(p.col, p.elevation + 0.55, p.row);
        mesh.renderOrder = 20;
        avatarGroup.add(mesh);
      }

      // Facing arrow: a flat cone pointing the way the delver is heading. Its
      // orientation (and the figure's yaw) are applied by orientAvatar below,
      // from the eased heading rather than the raw target, so the turn animates.
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.34, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 }),
      );
      arrow.renderOrder = 21;
      avatarGroup.add(arrow);

      // Register the live figure + arrow for per-frame turn easing. First sight
      // of a delver snaps to their heading (no spin-up from an arbitrary 0);
      // afterwards the stored eased angle carries across the rebuild.
      const vis = faceVis.get(p.id) ?? p.facing;
      faceVis.set(p.id, vis);
      const turner: Turner = {
        id: p.id,
        fig,
        arrow,
        col: p.col,
        row: p.row,
        elevation: p.elevation,
        target: p.facing,
      };
      orientAvatar(turner, vis);
      turners.push(turner);

      // A glowing halo disc on the ground beneath the character — also drawn
      // over the terrain so you can pinpoint the delver even amid tall rock.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, isYou ? 0.62 : 0.55, 20),
        new THREE.MeshBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: isYou ? 0.85 : 0.5,
          depthTest: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.col, p.elevation + 0.03, p.row);
      ring.renderOrder = 19;
      avatarGroup.add(ring);

      // A soft beacon of light column above your own character.
      if (isYou) {
        const beam = new THREE.Mesh(
          new THREE.ConeGeometry(0.5, 2.4, 12, 1, true),
          new THREE.MeshBasicMaterial({
            color: p.color,
            transparent: true,
            opacity: 0.12,
            depthTest: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          }),
        );
        beam.position.set(p.col, p.elevation + 1.8, p.row);
        beam.renderOrder = 18;
        avatarGroup.add(beam);
      }

      const light = new THREE.PointLight(0xffb060, 1.8, p.torchRadius * 1.5, 1.6);
      light.position.set(p.col, p.elevation + 0.9, p.row);
      scene.add(light);
      torchLights.push(light);
    }

    // Forget the eased heading of anyone no longer present so a rejoining id
    // starts fresh (snapped) rather than resuming a stale angle.
    if (faceVis.size > turners.length) {
      const present = new Set(turners.map((t) => t.id));
      for (const id of faceVis.keys()) if (!present.has(id)) faceVis.delete(id);
    }
  }

  // Aim exactly at the character's body centre (the capsule sits at
  // elevation + ~0.55) and follow tightly so the delver stays dead-centre.
  const CHAR_CENTER_Y = 0.55;
  function followTarget(you: PlayerState) {
    camTarget.x = you.col;
    camTarget.y = you.elevation + CHAR_CENTER_Y;
    camTarget.z = you.row;
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera || !controls) return;
    const now = performance.now();
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;
    stepFades(dt);
    syncVoxelTerrain();
    // Bob (and, for gold, spin) loot so treasure glints and reads from the
    // shallow camera angle. Phase-offset by cell so nearby items aren't synced.
    for (const m of lootSpin) {
      const baseY = m.userData.baseY as number;
      m.position.y = baseY + Math.sin(now / 400 + m.position.x + m.position.z) * 0.05;
      if (m.userData.spin) m.rotation.y += dt * 1.6;
    }
    // Pan the camera position by however much the follow-target moved, so the
    // rig travels with the player while keeping the user's orbit/zoom offset.
    if (camInit) {
      camera.position.x += camTarget.x - camPrev.x;
      camera.position.y += camTarget.y - camPrev.y;
      camera.position.z += camTarget.z - camPrev.z;
    }
    camPrev.x = camTarget.x;
    camPrev.y = camTarget.y;
    camPrev.z = camTarget.z;
    controls.target.set(camTarget.x, camTarget.y, camTarget.z);

    // Swing the camera behind the character for a short window after each move.
    if (camInit && _camSph && now - realignAt < REALIGN_WINDOW) {
      _camOff.copy(camera.position).sub(controls.target);
      _camSph.setFromVector3(_camOff);
      let d = desiredAz - _camSph.theta;
      d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest path
      _camSph.theta += d * ALIGN_EASE;
      _camOff.setFromSpherical(_camSph);
      camera.position.copy(controls.target).add(_camOff);
    }

    // Ease each delver's body + arrow toward their true heading. The shortest
    // angular path means a turn sweeps through the intervening angles — facing
    // away then stepping sideways pivots through the diagonal to horizontal, and
    // a turn toward the camera rotates rather than flipping instantly.
    if (turners.length) {
      const k = 1 - Math.exp(-dt * TURN_EASE_PER_SEC);
      for (const t of turners) {
        let vis = faceVis.get(t.id) ?? t.target;
        const d = Math.atan2(Math.sin(t.target - vis), Math.cos(t.target - vis));
        vis = Math.abs(d) < 1e-3 ? t.target : vis + d * k;
        faceVis.set(t.id, vis);
        orientAvatar(t, vis);
      }
    }

    controls.update();
    cutAwayOccluders(dt);
    // Report camera azimuth changes so the HUD compass can face the view.
    const az = controls.getAzimuthalAngle();
    if (Math.abs(az - lastYaw) > 0.005) {
      lastYaw = az;
      onYaw?.(az);
    }
    renderer.render(scene, camera);
  }
  let lastYaw = 999;

  // Walls (and tall terrain) between the camera and the local character are cut
  // away (shrunk + dimmed) so they never hide the delver. We march the grid
  // along the camera→character line and flag any occluder whose top rises above
  // the sightline, then ease each flagged cell's `occFade` toward 1 (others → 0).
  const occTarget = new Map<number, number>();
  const occTargetCeil = new Map<number, number>();
  /** Screen-space fade weight for a world point: 1 inside the clear circle,
   *  ramping to 0 at the ring's outer edge, 0 beyond. */
  function circleWeight(x: number, y: number, z: number, ccx: number, ccy: number): number {
    _v3.set(x, y, z).project(camera!);
    if (_v3.z > 1) return 0; // behind the camera
    const nd = Math.hypot(_v3.x - ccx, _v3.y - ccy);
    if (nd <= OCC_R_IN) return 1;
    if (nd >= OCC_R_OUT) return 0;
    return (OCC_R_OUT - nd) / (OCC_R_OUT - OCC_R_IN);
  }
  /** Index of the ground block in `cellIdx` whose vertical span contains world-Y
   *  `y` (blocks run bottom→top). Clamps to the topmost block above the column. */
  function blockAtHeight(cellIdx: number, y: number): number {
    const s = cellBlockStart[cellIdx];
    const n = cellBlockCount[cellIdx];
    for (let k = 0; k < n; k++) {
      const b = s + k;
      if (y <= blockY[b] + blockH[b] / 2) return b;
    }
    return s + n - 1;
  }
  function cutAwayOccluders(dt: number) {
    if (!terrain || !THREE || !camera) return;
    occTarget.clear();
    occTargetCeil.clear();
    const l = level;
    camera.updateMatrixWorld();
    const camPos = camera.position;
    const bump = (m: Map<number, number>, idx: number, w: number) => {
      if (w > (m.get(idx) ?? 0)) m.set(idx, w);
    };

    // ── Ground/wall occluders: only cut a column when it ACTUALLY blocks the
    // delver. We march a small bundle of rays from the camera to points across
    // the character's silhouette (feet → head, plus a little lateral spread so a
    // column edge can't clip them) and flag any cell whose solid GROUND mass
    // rises across the ray at that point. A cell not on the sightline is never
    // touched, so nothing fades while the delver stands in the clear; a real
    // occluder fades as a whole column, not a mid-height slice.
    _right.setFromMatrixColumn(camera.matrixWorld, 0); // camera's world X (right)
    _right.y = 0;
    if (_right.lengthSq() > 1e-6) _right.normalize();
    const baseX = meCell.col, baseZ = meCell.row;
    const spread = 0.32;
    // (dx, dy, dz) offsets from the character origin for each silhouette sample.
    const targets: [number, number, number][] = [
      [0, meCell.elev + 0.12, 0],
      [0, meCell.elev + 0.6, 0],
      [0, meCell.elev + 1.05, 0],
      [_right.x * spread, meCell.elev + 0.6, _right.z * spread],
      [-_right.x * spread, meCell.elev + 0.6, -_right.z * spread],
    ];
    for (const [ox, ty, oz] of targets) {
      const tx = baseX + ox, tz = baseZ + oz;
      const dx = tx - camPos.x, dy = ty - camPos.y, dz = tz - camPos.z;
      const dist = Math.hypot(dx, dy, dz);
      // ~3 samples per cell so even a 1-cell wall can't slip between steps.
      const steps = Math.max(4, Math.ceil(dist / 0.33));
      // Skip s=0 (at the camera) and the final step (at the delver).
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const x = camPos.x + dx * t;
        const y = camPos.y + dy * t;
        const z = camPos.z + dz * t;
        const c = Math.round(x), r = Math.round(z);
        if (c < 0 || r < 0 || c >= l.cols || r >= l.rows) continue;
        if (c === meCell.col && r === meCell.row) continue; // never the delver's own cell
        const idx = cellIndex(c, r, l.cols);
        const gt = groundExtents(l.cells[idx].kind, l.cells[idx].elevation)[1];
        // Fade only the individual BLOCK the ray pierces at this height, so a
        // wall column is carved open block-by-block (a delver-height hole) rather
        // than the whole column winking out.
        if (y < gt) bump(occTarget, blockAtHeight(idx, y), 1);
      }
    }

    // ── Roof (ceiling) oculus: open a soft disc of overhead rock around the
    // delver's on-screen position so the top-down camera can always see down
    // onto them. This is intentionally a circle (not a strict sightline test):
    // the roof otherwise walls the camera off from the whole pocket.
    _v3.set(meCell.col, meCell.elev + 0.7, meCell.row);
    const charDist = _v3.distanceTo(camPos);
    _v3.project(camera);
    const ccx = _v3.x, ccy = _v3.y;
    const c0 = Math.max(0, meCell.col - OCC_SCAN);
    const c1 = Math.min(l.cols - 1, meCell.col + OCC_SCAN);
    const r0 = Math.max(0, meCell.row - OCC_SCAN);
    const r1 = Math.min(l.rows - 1, meCell.row + OCC_SCAN);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (l.cells[cellIndex(c, r, l.cols)].kind === 'wall') continue;
        const idx = cellIndex(c, r, l.cols);
        const roofY = l.cells[idx].ceiling ?? CEIL_FALLBACK;
        // Roof only opens where it's between the camera and the character.
        if (_v3.set(c, roofY, r).distanceTo(camPos) >= charDist + 0.5) continue;
        const w = circleWeight(c, roofY, r, ccx, ccy);
        if (w > 0) bump(occTargetCeil, idx, w);
      }
    }
    // Ease flagged blocks toward faded, previously-flagged back toward solid.
    // occActive / occTarget key individual ground BLOCK instances now.
    const step = Math.min(1, dt * OCC_SPEED);
    let tChanged = false;
    for (const b of new Set([...occActive, ...occTarget.keys()])) {
      const tgt = occTarget.get(b) ?? 0;
      let o = occFade[b];
      o = o < tgt ? Math.min(tgt, o + step) : Math.max(tgt, o - step);
      occFade[b] = o;
      applyBlock(b);
      tChanged = true;
      if (o <= 0.001 && tgt === 0) occActive.delete(b);
      else occActive.add(b);
    }
    let cChanged = false;
    for (const i of new Set([...occActiveCeil, ...occTargetCeil.keys()])) {
      const tgt = occTargetCeil.get(i) ?? 0;
      let o = occFadeCeil[i];
      o = o < tgt ? Math.min(tgt, o + step) : Math.max(tgt, o - step);
      occFadeCeil[i] = o;
      applyCeil(i);
      cChanged = true;
      if (o <= 0.001 && tgt === 0) occActiveCeil.delete(i);
      else occActiveCeil.add(i);
    }
    if (tChanged) {
      terrain.instanceMatrix.needsUpdate = true;
      if (terrain.instanceColor) terrain.instanceColor.needsUpdate = true;
      if (alphaAttr) alphaAttr.needsUpdate = true;
    }
    if (cChanged && ceiling) {
      ceiling.instanceMatrix.needsUpdate = true;
      if (ceiling.instanceColor) ceiling.instanceColor.needsUpdate = true;
      if (ceilAlphaAttr) ceilAlphaAttr.needsUpdate = true;
    }
  }

  onMount(() => {
    init();
    return () => {};
  });

  onDestroy(() => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    // Free the cached figure templates (clones only ever shared these, so
    // nothing else owns them now).
    for (const t of figTemplates.values()) disposeObject3D(t);
    figTemplates.clear();
    // Free the cached awareness-glyph sprite materials + their canvas textures.
    for (const mat of awarenessMats.values()) {
      mat.map?.dispose();
      mat.dispose();
    }
    awarenessMats.clear();
    voxelTerrain?.dispose();
    voxelTerrain = null;
    // Shared across every level's materials, so it's freed once here.
    terrainAtlas?.dispose();
    terrainAtlas = null;
    renderer?.dispose();
    renderer?.domElement.remove();
  });

  // React to level / state changes.
  $effect(() => {
    // Touch reactive deps so the effect re-runs on updates (including `ready`,
    // which flips after the async THREE init completes).
    void tick;
    void ready;
    const l = level;
    const ps = players;
    if (!ready || !THREE || !scene) return;
    if (!ZERO_SCALE) ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);
    if (!BLACK) BLACK = new THREE.Color(0, 0, 0);
    if (!tmpCol) tmpCol = new THREE.Color(0, 0, 0);
    if (!_camOff) {
      _camOff = new THREE.Vector3();
      _camSph = new THREE.Spherical();
      _v3 = new THREE.Vector3();
      _right = new THREE.Vector3();
      _bm = new THREE.Matrix4();
      _bpos = new THREE.Vector3();
      _bscl = new THREE.Vector3();
      _bq = new THREE.Quaternion();
    }

    const you = ps.find((p) => p.id === youId);
    const myLevel = you ? you.level : l.depth;
    // Rebuild geometry when the followed player's level changes.
    if (l.depth === myLevel && levelKey(l) !== builtLevelKey) {
      buildLevel(l);
      // Snap camera BEHIND the player (seeing their back) on a fresh level.
      if (you) {
        camTarget.x = you.col;
        camTarget.y = you.elevation + CHAR_CENTER_Y;
        camTarget.z = you.row;
        camPrev.x = camTarget.x;
        camPrev.y = camTarget.y;
        camPrev.z = camTarget.z;
        camInit = true;
        const H = CAM_OFFSET.z;
        camera?.position.set(
          you.col - Math.sin(you.facing) * H,
          you.elevation + CAM_OFFSET.y,
          you.row + Math.cos(you.facing) * H,
        );
      }
    }
    if (l.depth !== myLevel) return; // parent passes the right level; guard anyway

    // On any move or turn, swing the camera back behind the character.
    if (you) {
      if (you.col !== meCell.col || you.row !== meCell.row || -you.facing !== desiredAz) {
        realignAt = performance.now();
      }
      desiredAz = -you.facing;
      meCell = { col: you.col, row: you.row, elev: you.elevation };
    }

    // Flip the terrain renderer to match the live debug toggle (reads
    // useVoxelTerrain so this effect re-runs when it changes).
    syncTerrainMode(l);

    const sameLevel = ps.filter((p) => p.level === myLevel);
    updateFogAndActors(l, sameLevel, you);
  });
</script>

<div class="view" bind:this={host}></div>

<style>
  .view {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .view :global(canvas) {
    display: block;
  }
</style>
