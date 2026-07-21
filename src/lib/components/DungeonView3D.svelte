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
  import type { LootState, MonsterState, PlayerState } from '$lib/game/protocol.ts';
  import { cellIndex } from '$lib/game/grid.ts';
  import { occluderHeight, WALL_HEIGHT } from '$lib/game/terrain.ts';
  import { hasLineOfSight } from '$lib/game/los.ts';
  import { cellVisibility, type VisionSource } from '$lib/game/vision.ts';
  import { cellLitByLights } from '$lib/game/lighting.ts';
  import { MODEL_BY_ID, pickMiniId, makeKit, type ModelKit } from '$lib/models3d/index.ts';
  import { disposeObject3D } from '$lib/threeDispose.ts';
  import { VoxelTerrain } from '$lib/components/voxelTerrain.ts';

  let {
    level,
    players,
    monsters = [],
    loot = [],
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
  // Alternate face-culled voxel-mesh floor/roof (built lazily when
  // useVoxelTerrain is on). Fed the same per-cell brightness/reveal the
  // instanced path computes, via its light/alpha shader texture.
  let voxelTerrain: VoxelTerrain | null = null;
  let voxelBuiltKey = '';
  let voxBright = new Float32Array(0); // per-cell target brightness (0..1)
  let voxDirty = false; // light/alpha changed → re-upload next frame
  let avatarGroup: import('three').Group | null = null;
  let torchLights: import('three').PointLight[] = [];
  // Procedural-figure toolkit (built once THREE loads) + a template cache. Each
  // distinct (modelId, tint) is built ONCE into a lit Group; per-instance
  // avatars are cheap clones sharing that geometry/material. Clones are tagged
  // userData.shared so the refresh teardown (disposeObject3D skipShared) frees
  // the throwaway primitives but never the cached templates.
  let kit: ModelKit | null = null;
  const figTemplates = new Map<string, import('three').Group>();
  let raf = 0;
  let disposed = false;
  // Flipped true once the async Three.js init finishes. It's $state so the
  // build/update $effect re-runs after init — otherwise a player who connects
  // and stays still would render a blank canvas (the effect's first run bails
  // out because THREE isn't loaded yet, and nothing re-triggers it).
  let ready = $state(false);

  // Per-cell "full" transform for the current level (position + box height),
  // and whether the cell has ever been revealed (fog memory).
  let fullMatrix: import('three').Matrix4[] = [];
  let baseColor: import('three').Color[] = [];
  let revealed: boolean[] = [];

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
  let meCell = { col: 0, row: 0, elev: 0 };
  let builtLevelKey = '';

  // Close, third-person-ish camera that pivots around the character (the
  // OrbitControls target follows the player, so dragging orbits around them).
  const CAM_OFFSET = { x: 0, y: 8, z: 6.5 };
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
  const VOX_TOP = 9; // top of the roof rock mass (above the tallest ceiling)

  /** [bottom, top] extents of a cell's GROUND block: the solid floor mass up to
   *  the walkable surface (`elevation`), or the full solid column for a wall. */
  function groundExtents(kind: string, elevation: number): [number, number] {
    if (kind === 'wall') return [VOX_BASE, VOX_TOP]; // solid rock column
    return [VOX_BASE, elevation]; // floor mass up to the surface you stand on
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
  function makeVoxelGeo(count: number, attr: import('three').InstancedBufferAttribute) {
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
  function alphaMat(): import('three').MeshBasicMaterial {
    // vertexColors → the baked per-face shading; instanceColor (per cell) and
    // instanceAlpha (occlusion fade) multiply on top in the shader.
    const m = new THREE.MeshBasicMaterial({ transparent: true, vertexColors: true });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'attribute float instanceAlpha;\nvarying float vAlpha;\n' +
        shader.vertexShader.replace('void main() {', 'void main() {\n\tvAlpha = instanceAlpha;');
      shader.fragmentShader =
        'varying float vAlpha;\n' +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          '\tdiffuseColor.a *= vAlpha;\n#include <opaque_fragment>',
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
    const count = l.cols * l.rows;
    // Two voxel layers: the GROUND rock mass (floor + solid walls) and the ROOF
    // rock mass hanging from the ceiling. Per-instance alpha lets the tunnel
    // between the camera and the delver fade open.
    const alpha = new Float32Array(count).fill(1);
    alphaAttr = new THREE.InstancedBufferAttribute(alpha, 1);
    terrain = new THREE.InstancedMesh(makeVoxelGeo(count, alphaAttr), alphaMat(), count);
    terrain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    terrain.frustumCulled = false;

    const calpha = new Float32Array(count).fill(1);
    ceilAlphaAttr = new THREE.InstancedBufferAttribute(calpha, 1);
    ceiling = new THREE.InstancedMesh(makeVoxelGeo(count, ceilAlphaAttr), alphaMat(), count);
    ceiling.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ceiling.frustumCulled = false;
    ceilMatrix = new Array(count);

    fullMatrix = new Array(count);
    baseColor = new Array(count);
    revealed = new Array(count).fill(false);
    terrTarget = new Float32Array(count * 3);
    terrShow = new Uint8Array(count);
    terrFade = new Float32Array(count);
    ceilTarget = new Float32Array(count * 3);
    ceilShow = new Uint8Array(count);
    ceilFade = new Float32Array(count);
    occFade = new Float32Array(count);
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
        // GROUND rock mass: solid from the base up to the floor surface (or the
        // full column for a wall) — adjacent cells at different heights show
        // their stepped side faces, giving the blocky voxel floor.
        const [gb, gt] = groundExtents(cell.kind, cell.elevation);
        const gh = Math.max(0.05, gt - gb);
        pos.set(col, (gb + gt) / 2, row);
        scl.set(1, gh, 1);
        m.compose(pos, quat, scl);
        fullMatrix[i] = m.clone();
        const c = new THREE.Color(palColor(l.palette, cell.kind));
        c.offsetHSL(0, 0, jitter(i));
        baseColor[i] = c;
        // ROOF rock mass: solid from the ceiling up to the top of the volume,
        // so the roof is a hanging block, not a thin slab.
        const rh = Math.max(0.05, VOX_TOP - roof);
        pos.set(col, (roof + VOX_TOP) / 2, row);
        scl.set(1, rh, 1);
        m.compose(pos, quat, scl);
        ceilMatrix[i] = m.clone();
        // Start hidden (zero scale) — unrevealed.
        terrain.setMatrixAt(i, ZERO_SCALE);
        terrain.setColorAt(i, BLACK);
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
  // Write a cell's mesh instance from its current eased fade + target colour.
  function applyTerr(i: number) {
    if (!terrain || !THREE) return;
    const f = terrFade[i];
    if (f <= 0.001) {
      terrain.setMatrixAt(i, ZERO_SCALE);
      if (alphaAttr) alphaAttr.setX(i, 0);
      return;
    }
    terrain.setMatrixAt(i, fullMatrix[i]);
    tmpCol.setRGB(terrTarget[i * 3] * f, terrTarget[i * 3 + 1] * f, terrTarget[i * 3 + 2] * f);
    terrain.setColorAt(i, tmpCol);
    // Occluding walls fade out via per-instance alpha (the "ring" cutout).
    if (alphaAttr) alphaAttr.setX(i, 1 - OCC_MAX * occFade[i]);
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

  function refreshAvatars(viewers: PlayerState[]) {
    if (!avatarGroup || !THREE || !scene) return;
    // Rebuild the small avatar set + torch lights each update (cheap: a handful).
    for (const l of torchLights) scene.remove(l);
    torchLights = [];
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
    }

    // Loot: gold coins (yellow discs) and potions (red vials).
    for (const it of loot) {
      const isGold = it.kind === 'gold';
      const mesh = new THREE.Mesh(
        isGold
          ? new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12)
          : new THREE.CylinderGeometry(0.1, 0.14, 0.32, 8),
        new THREE.MeshBasicMaterial({ color: isGold ? 0xffcf3a : 0xff5a7a, depthTest: false }),
      );
      mesh.position.set(it.col, isGold ? 0.14 : 0.22, it.row);
      mesh.renderOrder = 14;
      avatarGroup.add(mesh);
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
        fig.rotation.y = Math.PI - p.facing;
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

      // Facing arrow: a flat cone pointing the way the delver is heading.
      // Heading 0 = North (−z), clockwise, so dir = (sin, 0, −cos).
      const dir = new THREE.Vector3(Math.sin(p.facing), 0, -Math.cos(p.facing));
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.34, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 }),
      );
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      arrow.position.set(p.col + dir.x * 0.5, p.elevation + 0.5, p.row + dir.z * 0.5);
      arrow.renderOrder = 21;
      avatarGroup.add(arrow);

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
  function cutAwayOccluders(dt: number) {
    if (!terrain || !THREE || !camera) return;
    occTarget.clear();
    occTargetCeil.clear();
    const l = level;
    camera.updateMatrixWorld();
    const camPos = camera.position;
    // The character's screen position is the centre of the clear circle.
    _v3.set(meCell.col, meCell.elev + 0.7, meCell.row);
    const charDist = _v3.distanceTo(camPos);
    _v3.project(camera);
    const ccx = _v3.x;
    const ccy = _v3.y;
    const bump = (m: Map<number, number>, idx: number, w: number) => {
      if (w > (m.get(idx) ?? 0)) m.set(idx, w);
    };
    // Scan cells around the player; fade only what sits BETWEEN the camera and
    // the character (nearer the camera than the delver) within the on-screen
    // circle. Terrain in front of / beyond the character stays solid, so the
    // cave ahead is never carved away.
    const c0 = Math.max(0, meCell.col - OCC_SCAN);
    const c1 = Math.min(l.cols - 1, meCell.col + OCC_SCAN);
    const r0 = Math.max(0, meCell.row - OCC_SCAN);
    const r1 = Math.min(l.rows - 1, meCell.row + OCC_SCAN);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c === meCell.col && r === meCell.row) continue;
        const idx = cellIndex(c, r, l.cols);
        const cell = l.cells[idx];
        if (cell.kind === 'wall') {
          if (_v3.set(c, 3, r).distanceTo(camPos) >= charDist - 0.4) continue; // not between
          const w = circleWeight(c, 3, r, ccx, ccy);
          if (w > 0) bump(occTarget, idx, w);
        } else {
          const roofY = cell.ceiling ?? CEIL_FALLBACK;
          // Roof only opens where it's between the camera and the character.
          if (_v3.set(c, roofY, r).distanceTo(camPos) >= charDist + 0.5) continue;
          const w = circleWeight(c, roofY, r, ccx, ccy);
          if (w > 0) bump(occTargetCeil, idx, w);
        }
      }
    }
    // Ease flagged cells toward faded, previously-flagged back toward solid.
    const step = Math.min(1, dt * OCC_SPEED);
    let tChanged = false;
    for (const i of new Set([...occActive, ...occTarget.keys()])) {
      const tgt = occTarget.get(i) ?? 0;
      let o = occFade[i];
      o = o < tgt ? Math.min(tgt, o + step) : Math.max(tgt, o - step);
      occFade[i] = o;
      applyTerr(i);
      tChanged = true;
      if (o <= 0.001 && tgt === 0) occActive.delete(i);
      else occActive.add(i);
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
    voxelTerrain?.dispose();
    voxelTerrain = null;
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
