// Named material presets for the miniature line. A recipe's `materials` block
// maps a role ("skin", "metal", "magic"…) to one of these preset names (or a
// raw "#rrggbb"). Keeping the palette small and curated is what makes twelve
// different minis read as ONE product line.
//
// HOW TO EXTEND: add a name → hex entry under the right role. Prefer muted,
// slightly warm tones; saturated colours are reserved for magic/accents.
import type { MaterialRole } from './recipe.ts';

export const MATERIAL_PRESETS: Record<MaterialRole, Record<string, number>> = {
  skin: {
    warm_skin: 0xe0a878, tan_skin: 0xc98d5e, pale_skin: 0xefc9a8,
    deep_skin: 0x8d5a3b, green_skin: 0x7d9455, grey_green_skin: 0x8a9a6a,
    red_skin: 0xb05a4a, crimson_skin: 0x9a4444, purple_skin: 0x8a6a9a,
    bronze_scale_skin: 0xb08050, blue_scale_skin: 0x6a8aa8,
    undead_bone: 0xe8e0cc,
  },
  cloth: {
    cream_robes: 0xe8dcc0, arcane_blue: 0x4a6a9d, midnight_blue: 0x35415f,
    forest_green: 0x5a7248, deep_green: 0x44583a, wine_red: 0x8a3d3d,
    royal_purple: 0x6a4a8a, charcoal: 0x4a4a50, ochre: 0xc09048,
    dusty_teal: 0x4f7a72, warm_grey: 0x8a8378, flame_orange: 0xc0662f,
  },
  cloth2: {
    cream_robes: 0xe8dcc0, arcane_blue: 0x4a6a9d, midnight_blue: 0x35415f,
    forest_green: 0x5a7248, deep_green: 0x44583a, wine_red: 0x8a3d3d,
    royal_purple: 0x6a4a8a, charcoal: 0x4a4a50, ochre: 0xc09048,
    dusty_teal: 0x4f7a72, warm_grey: 0x8a8378, flame_orange: 0xc0662f,
  },
  leather: {
    dark_brown: 0x5a3d26, tan_leather: 0x9a6a40, black_leather: 0x3a332e,
    red_leather: 0x7a4034, green_leather: 0x5a5f38,
  },
  metal: {
    brushed_steel: 0xb0b8c2, dark_iron: 0x5f646e, gold: 0xd4af37,
    bronze: 0xb08040, silver: 0xc8ccd4, blackened_steel: 0x4a4e58,
    radiant_gold: 0xe6c860,
  },
  metal2: {
    brushed_steel: 0xb0b8c2, dark_iron: 0x5f646e, gold: 0xd4af37,
    bronze: 0xb08040, silver: 0xc8ccd4, blackened_steel: 0x4a4e58,
    radiant_gold: 0xe6c860,
  },
  wood: {
    oak: 0x7a5230, dark_wood: 0x4e3620, ash_wood: 0x9a8060, gnarled: 0x6a4a2c,
  },
  bone: { bone_white: 0xe8e0cc, antler: 0xd8c8a8, ivory: 0xf0e8d8 },
  magic: {
    soft_gold: 0xffd97a, arcane_cyan: 0x6ad0ff, eldritch_green: 0x7dffb0,
    fel_violet: 0xc08aff, ember_orange: 0xffa050, holy_white: 0xfff4d8,
    nature_green: 0x9ade6a, storm_blue: 0x7ab8ff, blood_red: 0xff6a5a,
  },
  stone: { grey_stone: 0x9a948c, dark_stone: 0x5d5a54, sandstone: 0xc0aa84, mossy_stone: 0x7d8468 },
  fur: { brown_fur: 0x6e4f34, grey_fur: 0x7a7468, white_fur: 0xd8d0c0, black_fur: 0x3c342c },
  scale: { bronze_scale: 0xa87840, blue_scale: 0x5a7a9a, green_scale: 0x6a8455, red_scale: 0x9a4a3a, white_scale: 0xd0ccb8 },
  hair: {
    black_hair: 0x2e2620, brown_hair: 0x5f4228, chestnut: 0x7a4e2a,
    blonde: 0xc8a860, ginger: 0xa85c30, silver_hair: 0xc0c0c8,
    white_hair: 0xe0dcd0, dark_red_hair: 0x6e3028,
  },
};

/** Per-role fallback when a recipe omits a role entirely. */
export const MATERIAL_DEFAULTS: Record<MaterialRole, number> = {
  skin: MATERIAL_PRESETS.skin.warm_skin, cloth: MATERIAL_PRESETS.cloth.warm_grey,
  cloth2: MATERIAL_PRESETS.cloth.charcoal, leather: MATERIAL_PRESETS.leather.dark_brown,
  metal: MATERIAL_PRESETS.metal.brushed_steel, metal2: MATERIAL_PRESETS.metal.dark_iron,
  wood: MATERIAL_PRESETS.wood.oak, bone: MATERIAL_PRESETS.bone.bone_white,
  magic: MATERIAL_PRESETS.magic.arcane_cyan, stone: MATERIAL_PRESETS.stone.grey_stone,
  fur: MATERIAL_PRESETS.fur.brown_fur, scale: MATERIAL_PRESETS.scale.bronze_scale,
  hair: MATERIAL_PRESETS.hair.brown_hair,
};

/** Resolve a recipe material entry to a hex colour. Accepts a preset name for
 *  that role, a "#rrggbb" string, or undefined (role default). */
export function resolveMaterialColor(role: MaterialRole, value: string | undefined): number {
  if (!value) return MATERIAL_DEFAULTS[role];
  const preset = MATERIAL_PRESETS[role][value];
  if (preset !== undefined) return preset;
  const hex = /^#?([0-9a-fA-F]{6})$/.exec(value);
  if (hex) return parseInt(hex[1], 16);
  return MATERIAL_DEFAULTS[role];
}

/** The resolved palette handed to every part builder. */
export type Palette = Record<MaterialRole, number>;

export function resolvePalette(materials: Partial<Record<MaterialRole, string>>): Palette {
  const out = {} as Palette;
  for (const role of Object.keys(MATERIAL_DEFAULTS) as MaterialRole[]) {
    out[role] = resolveMaterialColor(role, materials[role]);
  }
  return out;
}
