# Voxel cave generator (`$lib/voxel`)

A chunk-based, world-space-deterministic voxel cave generator. Emits **voxel
data only** — no rendering coupling — so it can back a future true-3D voxel
Delve or any voxel engine. Built to the spec in the project brief.

## Usage

```ts
import { CaveGenerationPipeline, makeCaveConfig, asciiSliceXZ } from '$lib/voxel';

const pipeline = new CaveGenerationPipeline('my-world-seed'); // or a number
const chunk = pipeline.generateChunk({ cx: 0, cy: -1, cz: 0 });
chunk.get(x, y, z);          // read a voxel (Block.* ids)
console.log(asciiSliceXZ(chunk, 16));

// Tune anything:
const cfg = makeCaveConfig({ tunnelSpawnChance: 0.9, maxCavernRadius: 16 });
new CaveGenerationPipeline('seed', cfg);
```

Meshing is intentionally the caller's job — this package never imports Three.js.

## Architecture (one responsibility per module)

| Module | Responsibility |
| --- | --- |
| `seed` | Deterministic hashing + derived independent sub-seeds |
| `coords` | world ↔ chunk ↔ local (correct for negatives) |
| `chunk` | Typed-array voxel storage + dirty tracking |
| `noise` | Seeded Perlin + fBm + domain warp (the only noise impl) |
| `config` | All tunables in one validated object + depth helpers |
| `terrain` | Reference base terrain (replaceable) |
| `density` | Continuous spaghetti-tube cave field (world-space) |
| `tunnels` | Region-origin winding tunnels, bounded branching, capsule carve |
| `caverns` | Region-origin noise-distorted ellipsoid chambers |
| `postprocess` | Bounded in-chunk isolated-voxel cleanup |
| `pipeline` | Sequences the stages; owns sub-seeds; no cave math |
| `debug` | Chunk hashing + ASCII slice export |

## Determinism & seamlessness

Every carve decision is a pure function of the **world seed** and **absolute
world coordinates**. Density is world-space (seamless by construction).
Tunnels/caverns originate on a **world region grid larger than a chunk**; each
chunk queries every region whose carvers could reach it (bounding-box culled),
so a tunnel starting in a neighbour still carves in. Independent derived seeds
(`terrain`/`caves`/`tunnels`/`caverns`) keep systems uncorrelated. No shared
mutable RNG, no chunk-order dependence.

The border-seam test proves the point: **every voxel of two neighbouring chunks
equals the chunk-independent `pipeline.sampleSolid(world)` function**, so a seam
is impossible.

## Performance

Typed-array chunks, region memoization, bounding-box culling per chunk, squared
distances, invariants hoisted out of voxel loops, no per-voxel allocation.

## Tests

`phase1.test.ts` (foundations) + `phase2.test.ts` (determinism, chunk-order
independence, border seamlessness, negative coords, protected blocks, bounded
branching, tunnel continuity). Run `npm run test`.

## Known limitations / future work

Implemented: Phase 1–3 core (chunk/coords/seed/noise/config, terrain, density,
tunnels+branching, caverns, post-process) + tests + debug slices + example.

Not yet implemented (extension points left in `config`/context):

- **Surface openings** (`surfaceOpeningChance` is wired but unused).
- **Full depth profiles / biome & region variation** — only the cave threshold
  interpolates by depth today; a `CaveProfile`/`BiomeContext` hook is the
  intended seam.
- **Regional connectivity** (flood-fill component joining) — post-process only
  removes isolated single voxels within a chunk.
- **Materials, ores/decorations, fluids** — deterministic seeds exist; carving
  is kept separate from decoration as specified.
- **Coarse density interpolation** and **bounded parallel/async generation with
  cancellation** — the density path is full-resolution today.
