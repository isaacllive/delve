// Base builders: the integral display base under every mini. A base is a
// bevel-edged round plinth (25mm or 32mm) plus a themed topper (rubble, runes,
// roots…). Toppers stay LOW and CHUNKY — they support the figure visually and
// literally (print-safe, no thin spikes) — and use the muted stone/earth range
// so the figure always pops above them.
//
// HOW TO ADD A THEME: add the id to BASE_THEMES in recipe.ts, then a builder
// here. Keep decoration below ~3mm height near the centre (feet land there).
import type * as THREE_NS from 'three';
import type { MiniKit } from './kit.ts';
import type { Palette } from './materials.ts';
import type { BaseTheme } from './recipe.ts';

/** Deterministic tiny PRNG so a given base theme always sculpts the same
 *  (recipes should render reproducibly; Math.random would shimmer per build). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export interface BaseResult {
  group: THREE_NS.Group;
  /** Height of the plinth top surface — the figure stands here. */
  topY: number;
}

const PLINTH_H = 3;

/** Scatter a few low rocks around the rim (shared by several themes). */
function scatterRocks(kit: MiniKit, g: THREE_NS.Group, r: number, color: number, n: number, seed: number) {
  const rand = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const rr = r * (0.5 + rand() * 0.38);
    const s = 0.9 + rand() * 1.4;
    const rock = kit.sph(s, kit.mat(color, { flat: true }), Math.cos(a) * rr, PLINTH_H + s * 0.3, Math.sin(a) * rr);
    rock.scale.set(1, 0.55 + rand() * 0.3, 0.8 + rand() * 0.4);
    rock.rotation.y = rand() * Math.PI;
    g.add(rock);
  }
}

export function buildBase(kit: MiniKit, theme: BaseTheme, radiusMm: number, pal: Palette): BaseResult {
  const r = radiusMm;
  const stone = kit.mat(pal.stone, { flat: true });
  const dark = kit.mat(0x4e4a44, { flat: true });

  // The plinth: classic display base profile (straight wall, chamfered lip).
  const g = kit.group(
    kit.cyl(r, r, PLINTH_H - 0.9, kit.mat(0x3a352f, { flat: true }), 0, (PLINTH_H - 0.9) / 2, 0, 28),
    kit.cyl(r - 0.7, r, 0.9, kit.mat(0x3a352f, { flat: true }), 0, PLINTH_H - 0.45, 0, 28),
  );
  const rand = rng(theme.length * 7919 + radiusMm);
  const disc = (color: number, dy = 0.25) => {
    const d = kit.cyl(r - 0.7, r - 0.7, dy, kit.mat(color, { flat: true }), 0, PLINTH_H + dy / 2 - 0.01, 0, 28);
    g.add(d);
    return d;
  };

  switch (theme) {
    case 'plain':
      disc(0x5a544c);
      break;
    case 'dungeon_stone': {
      disc(0x55504a);
      // Big flagstone slabs, offset grout lines.
      for (const [x, z, w, d2, a] of [[-3, -2, 7, 6, 0.2], [4, 1, 6, 7, -0.3], [-2, 5, 6, 5, 0.5], [2, -6, 5, 5, 0.9]] as const) {
        const slab = kit.bevelBox(w, 1.1, d2, kit.mat(pal.stone, { flat: true }), x * (r / 12.5), PLINTH_H + 0.5, z * (r / 12.5), 0.4);
        slab.rotation.y = a;
        g.add(slab);
      }
      break;
    }
    case 'arcane_runes': {
      disc(0x4a4656);
      const ring = kit.torus(r * 0.62, 0.5, kit.mat(pal.magic, { emissive: pal.magic, emissiveIntensity: 0.7 }), 0, PLINTH_H + 0.3, 0, 32);
      ring.rotation.x = Math.PI / 2;
      g.add(kit.noOutline(ring));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(kit.noOutline(kit.box(1.1, 0.5, 1.6, kit.mat(pal.magic, { emissive: pal.magic, emissiveIntensity: 0.7 }),
          Math.cos(a) * r * 0.8, PLINTH_H + 0.25, Math.sin(a) * r * 0.8)));
      }
      break;
    }
    case 'shadow_stone': {
      disc(0x3f3b38);
      for (const [x, z, w, d2, a] of [[-4, 2, 6, 5, 0.4], [3, -3, 7, 5, -0.2]] as const) {
        const slab = kit.bevelBox(w, 0.9, d2, dark, x * (r / 12.5), PLINTH_H + 0.4, z * (r / 12.5), 0.35);
        slab.rotation.y = a;
        g.add(slab);
      }
      scatterRocks(kit, g, r, 0x45403a, 3, 11);
      break;
    }
    case 'temple_ruins': {
      disc(0x6a6258);
      // Broken column drum + fallen capital chunk.
      g.add(kit.cyl(2.6, 2.8, 2.6, stone, -r * 0.45, PLINTH_H + 1.3, -r * 0.3, 12));
      const cap = kit.bevelBox(4.2, 1.4, 4.2, stone, r * 0.4, PLINTH_H + 0.7, r * 0.25, 0.4);
      cap.rotation.y = 0.6;
      cap.rotation.z = 0.12;
      g.add(cap);
      scatterRocks(kit, g, r, pal.stone, 3, 23);
      break;
    }
    case 'forest': {
      disc(0x4e4632);
      // Mossy hummocks + a fat root and toadstool-free stump.
      for (let i = 0; i < 3; i++) {
        const a = rand() * Math.PI * 2;
        const moss = kit.sph(1.6 + rand(), kit.mat(0x55683c), Math.cos(a) * r * 0.62, PLINTH_H + 0.3, Math.sin(a) * r * 0.62);
        moss.scale.set(1.3, 0.45, 1.1);
        g.add(moss);
      }
      g.add(kit.chain([[-r * 0.7, PLINTH_H + 0.4, -r * 0.2], [-r * 0.2, PLINTH_H + 0.9, r * 0.15], [r * 0.35, PLINTH_H + 0.3, r * 0.45]], 1.1, 0.6, kit.mat(0x5a4128), 10));
      scatterRocks(kit, g, r, 0x7d8468, 2, 37);
      break;
    }
    case 'sacred_stone': {
      disc(0x8a8274);
      // Radiating paving wedges + a low engraved step.
      const step = kit.cyl(r * 0.55, r * 0.6, 1.4, stone, 0, PLINTH_H + 0.7, 0, 10);
      g.add(step);
      const halo = kit.torus(r * 0.72, 0.4, kit.mat(pal.magic, { emissive: pal.magic, emissiveIntensity: 0.55 }), 0, PLINTH_H + 0.25, 0, 30);
      halo.rotation.x = Math.PI / 2;
      g.add(kit.noOutline(halo));
      break;
    }
    case 'rocky_battlefield': {
      disc(0x5c554c);
      const crag = kit.bevelBox(5.5, 2.8, 4.5, dark, -r * 0.42, PLINTH_H + 1.2, r * 0.3, 0.7);
      crag.rotation.y = 0.7;
      crag.rotation.x = -0.1;
      g.add(crag);
      scatterRocks(kit, g, r, 0x6a6258, 5, 53);
      // A fallen broken blade — battlefield storytelling.
      const blade = kit.bevelBox(1.4, 0.6, 6.5, kit.mat(0x8a8f98, { flat: true }), r * 0.4, PLINTH_H + 0.3, -r * 0.35, 0.2);
      blade.rotation.y = -0.9;
      g.add(blade);
      break;
    }
    case 'root_mushroom': {
      disc(0x4a3f2e);
      // Fat roots crossing the base + a cluster of chunky mushrooms.
      g.add(kit.chain([[-r * 0.8, PLINTH_H + 0.2, 0.5], [-r * 0.25, PLINTH_H + 1.0, -0.4], [r * 0.3, PLINTH_H + 0.4, -r * 0.4]], 1.2, 0.7, kit.mat(0x5a4128), 10));
      g.add(kit.chain([[r * 0.7, PLINTH_H + 0.2, r * 0.3], [r * 0.25, PLINTH_H + 0.7, r * 0.5]], 0.9, 0.5, kit.mat(0x5a4128), 6));
      for (const [x, z, s] of [[r * 0.45, -r * 0.15, 1.4], [r * 0.6, 0.9, 1.0], [r * 0.32, 0.4, 0.7]] as const) {
        g.add(kit.cyl(s * 0.4, s * 0.55, s * 1.5, kit.mat(0xd8ccb0), x, PLINTH_H + s * 0.75, z, 10));
        const capM = kit.sph(s * 1.05, kit.mat(0xa85c40), x, PLINTH_H + s * 1.5, z);
        capM.scale.set(1, 0.62, 1);
        g.add(capM);
      }
      break;
    }
    case 'tavern_stage': {
      disc(0x6a4e2e);
      // Plank boards with visible seams + a brass footlight.
      for (let i = -2; i <= 2; i++) {
        g.add(kit.bevelBox(3.4, 0.7, r * 1.55, kit.mat(i % 2 ? 0x7a5a36 : 0x6f4f30, { flat: true }), i * 3.7 * (r / 12.5), PLINTH_H + 0.3, 0, 0.25));
      }
      g.add(kit.noOutline(kit.sph(0.9, kit.mat(0xffd97a, { emissive: 0xffb84a, emissiveIntensity: 0.9 }), r * 0.65, PLINTH_H + 0.8, r * 0.5)));
      g.add(kit.cyl(1.0, 1.2, 0.8, kit.mat(0xb08040, { flat: true }), r * 0.65, PLINTH_H + 0.3, r * 0.5, 10));
      break;
    }
    case 'training_stone': {
      disc(0x8a8478);
      const ringM = kit.torus(r * 0.66, 0.45, dark, 0, PLINTH_H + 0.2, 0, 30);
      ringM.rotation.x = Math.PI / 2;
      g.add(ringM);
      g.add(kit.cyl(r * 0.5, r * 0.54, 0.8, kit.mat(0x9a9488, { flat: true }), 0, PLINTH_H + 0.4, 0, 24));
      break;
    }
    case 'cracked_ritual': {
      disc(0x423c46);
      // Cracked slabs with an eldritch glow seeping through the seams.
      const seams = kit.group();
      for (const [a, len] of [[0.3, r * 1.3], [1.7, r * 1.1], [2.9, r * 0.9]] as const) {
        const seam = kit.box(0.8, 0.4, len, kit.mat(pal.magic, { emissive: pal.magic, emissiveIntensity: 0.9 }), 0, PLINTH_H + 0.12, 0);
        seam.rotation.y = a;
        seams.add(seam);
      }
      g.add(kit.noOutline(seams));
      for (const [x, z, a] of [[-r * 0.35, -r * 0.3, 0.5], [r * 0.4, r * 0.2, -0.4], [r * 0.1, -r * 0.45, 1.2]] as const) {
        const slab = kit.bevelBox(6, 1.0, 5, dark, x, PLINTH_H + 0.45, z, 0.35);
        slab.rotation.y = a;
        slab.rotation.z = (rand() - 0.5) * 0.14;
        g.add(slab);
      }
      break;
    }
    case 'magic_swirl': {
      disc(0x3e4456);
      // A raised swirl of energy circling the figure's ankles.
      const swirl = kit.ribbon(
        [[r * 0.7, PLINTH_H + 0.5, 0], [0, PLINTH_H + 1.6, r * 0.65], [-r * 0.7, PLINTH_H + 2.4, 0], [0, PLINTH_H + 3.4, -r * 0.6]],
        0.9, kit.mat(pal.magic, { emissive: pal.magic, emissiveIntensity: 0.85 }), 0.6, 40,
      );
      g.add(kit.noOutline(swirl));
      g.add(kit.noOutline(kit.torus(r * 0.6, 0.35, kit.mat(pal.magic, { emissive: pal.magic, emissiveIntensity: 0.7 }), 0, PLINTH_H + 0.2, 0, 30).rotateX(Math.PI / 2)));
      break;
    }
  }

  return { group: g, topY: PLINTH_H + 0.3 };
}
