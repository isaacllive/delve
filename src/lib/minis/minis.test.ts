// Miniature generator tests: schema honesty (every sample recipe validates,
// bad recipes fail loudly) and a full build smoke test — all 12 roster minis
// assemble, produce sane bounds, and every class/species/pose/gear/base id in
// the tables actually resolves to a builder. Geometry is built with real THREE
// in node (no renderer needed).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MiniRecipeSchema, parseMiniRecipe, CLASS_IDS, SPECIES_IDS, POSE_FAMILIES, GEAR_IDS, BASE_THEMES } from './recipe.ts';
import { RAW_SAMPLE_RECIPES, SAMPLE_RECIPES } from './recipes/index.ts';
import { CLASSES } from './classes.ts';
import { SPECIES, speciesDims } from './species.ts';
import { POSES } from './poses.ts';
import { GEAR } from './gear.ts';
import { buildBase } from './bases.ts';
import { makeMiniKit } from './kit.ts';
import { buildMiniature } from './builder.ts';
import { resolvePalette, resolveMaterialColor, MATERIAL_DEFAULTS } from './materials.ts';

describe('recipe schema', () => {
  it('accepts all 12 sample recipes', () => {
    expect(RAW_SAMPLE_RECIPES).toHaveLength(12);
    for (const raw of RAW_SAMPLE_RECIPES) expect(() => parseMiniRecipe(raw)).not.toThrow();
  });

  it('covers every core class exactly once in the roster', () => {
    const classes = SAMPLE_RECIPES.map((r) => r.class).sort();
    expect(classes).toEqual([...CLASS_IDS].sort());
  });

  it('fills defaults for a minimal recipe', () => {
    const r = parseMiniRecipe({ name: 'Test', class: 'wizard', species: 'elf' });
    expect(r.scale).toBe('32mm_heroic');
    expect(r.baseSize).toBe('25mm_round');
    expect(r.poseIntensity).toBeCloseTo(0.6);
    expect(r.gear).toEqual([]);
  });

  it('rejects unknown ids loudly', () => {
    expect(MiniRecipeSchema.safeParse({ name: 'X', class: 'necromancer', species: 'elf' }).success).toBe(false);
    expect(MiniRecipeSchema.safeParse({ name: 'X', class: 'wizard', species: 'elf', gear: ['chainsaw'] }).success).toBe(false);
    expect(MiniRecipeSchema.safeParse({ name: 'X', class: 'wizard', species: 'elf', poseFamily: 'dab' }).success).toBe(false);
  });
});

describe('tables are complete', () => {
  it('every class has a spec with valid references', () => {
    for (const id of CLASS_IDS) {
      const c = CLASSES[id];
      expect(c, id).toBeTruthy();
      expect(POSE_FAMILIES).toContain(c.pose);
      expect(BASE_THEMES).toContain(c.base);
      for (const g of c.gear) expect(GEAR_IDS, `${id} gear ${g}`).toContain(g);
    }
  });

  it('every species has proportions', () => {
    for (const id of SPECIES_IDS) {
      expect(SPECIES[id], id).toBeTruthy();
      const dims = speciesDims(id);
      expect(dims.height).toBeGreaterThan(10);
      expect(dims.hipY).toBeGreaterThan(4);
    }
  });

  it('every pose family and gear id has a builder entry', () => {
    for (const id of POSE_FAMILIES) expect(POSES[id], id).toBeTruthy();
    for (const id of GEAR_IDS) expect(GEAR[id], id).toBeTruthy();
  });
});

describe('materials', () => {
  it('resolves presets, hex strings, and falls back per role', () => {
    expect(resolveMaterialColor('skin', 'warm_skin')).toBe(0xe0a878);
    expect(resolveMaterialColor('cloth', '#ff0000')).toBe(0xff0000);
    expect(resolveMaterialColor('cloth', 'not_a_preset')).toBe(MATERIAL_DEFAULTS.cloth);
    expect(resolveMaterialColor('metal', undefined)).toBe(MATERIAL_DEFAULTS.metal);
  });

  it('resolves a full palette for every role', () => {
    const pal = resolvePalette({ skin: 'green_skin' });
    expect(pal.skin).toBe(0x7d9455);
    for (const v of Object.values(pal)) expect(typeof v).toBe('number');
  });
});

describe('builder', () => {
  const finiteBounds = (g: THREE.Group) => {
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    for (const v of [box.min, box.max]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
    }
    return box;
  };

  it('builds all 12 roster minis with sane, consistent bounds', () => {
    const kit = makeMiniKit(THREE);
    for (const recipe of SAMPLE_RECIPES) {
      const built = buildMiniature(THREE, recipe, kit);
      expect(built.group.children.length, recipe.name).toBeGreaterThan(0);
      const box = finiteBounds(built.group);
      // Base bottom at (or just under) y=0; overall height in heroic range.
      expect(box.min.y, recipe.name).toBeGreaterThan(-1);
      const height = box.max.y - box.min.y;
      expect(height, recipe.name).toBeGreaterThan(18);   // even the gnome reads
      expect(height, recipe.name).toBeLessThan(75);      // nothing runs away
      // Stays roughly over its base — silhouette balanced for the turntable.
      const r = built.baseRadiusMm;
      expect(Math.abs(box.min.x), recipe.name).toBeLessThan(r * 3.2);
      expect(Math.abs(box.max.x), recipe.name).toBeLessThan(r * 3.2);
    }
  });

  it('builds a minimal recipe for every class × a spread of species', () => {
    const kit = makeMiniKit(THREE);
    for (const cls of CLASS_IDS) {
      for (const sp of ['human', 'dwarf', 'gnome', 'dragonborn', 'goblin', 'orc', 'kobold', 'gnoll', 'ogre', 'werewolf', 'skeleton'] as const) {
        const recipe = parseMiniRecipe({ name: `${sp} ${cls}`, class: cls, species: sp });
        const built = buildMiniature(THREE, recipe, kit);
        finiteBounds(built.group);
      }
    }
  });

  it('builds monster loadouts with the new gear + species palettes', () => {
    const kit = makeMiniKit(THREE);
    const monsters = [
      { name: 'Goblin Skirmisher', class: 'rogue', species: 'goblin', gear: ['club', 'round_shield'], category: 'monster_mini' },
      { name: 'Orc Impaler', class: 'barbarian', species: 'orc', gear: ['spear', 'fur_mantle'], category: 'monster_mini' },
      { name: 'Skeleton Marksman', class: 'fighter', species: 'skeleton', gear: ['crossbow', 'quiver'], category: 'monster_mini' },
    ] as const;
    for (const raw of monsters) {
      const built = buildMiniature(THREE, parseMiniRecipe(raw), kit);
      finiteBounds(built.group);
    }
    // Species palette pins beat the class palette but lose to the recipe.
    const skel = parseMiniRecipe({ name: 'S', class: 'fighter', species: 'skeleton' });
    expect(resolvePalette({ ...CLASSES.fighter.palette, ...SPECIES[skel.species].palette }).skin).toBe(0xe8e0cc);
    expect(resolvePalette({ ...SPECIES[skel.species].palette, skin: 'green_skin' }).skin).toBe(0x7d9455);
  });

  it('adds outline hulls but skips glow parts', () => {
    const built = buildMiniature(THREE, SAMPLE_RECIPES[0], makeMiniKit(THREE));
    let hulls = 0;
    built.group.traverse((o) => { if (o.userData.isHull) hulls++; });
    expect(hulls).toBeGreaterThan(20);
    // Sorcerer wisps are flagged noOutline — none of their meshes get hulls.
    const sorcerer = SAMPLE_RECIPES.find((r) => r.class === 'sorcerer')!;
    const b2 = buildMiniature(THREE, sorcerer, makeMiniKit(THREE));
    b2.group.traverse((o) => {
      let p: THREE.Object3D | null = o;
      let inGlow = false;
      for (; p; p = p.parent) if (p.userData?.noOutline) inGlow = true;
      if (inGlow) {
        for (const c of o.children) expect(c.userData.isHull).toBeFalsy();
      }
    });
  });

  it('every base theme builds', () => {
    const kit = makeMiniKit(THREE);
    const pal = resolvePalette({});
    for (const theme of BASE_THEMES) {
      const b = buildBase(kit, theme, 12.5, pal);
      expect(b.group.children.length, theme).toBeGreaterThan(0);
      expect(b.topY).toBeGreaterThan(0);
    }
  });
});
