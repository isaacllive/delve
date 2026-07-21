// Preview-only procedural 3D models for map MARKERS (objectKind) and LIGHTS
// (lightKind). These mirror the shapes the 3D scene draws inline in
// Scene3D.svelte (objectShape() / lightFixture()), rebuilt here with the shared
// ModelKit so the Library panel's docked preview
// (LibraryPreviewPanel → ModelPreview → thumbnail.ts) can render a marker or
// light exactly the way it already renders a prop — through a model id.
//
// They are intentionally kept OUT of MODEL_LIBRARY / MODEL_BY_ID (the registry
// validateModel.ts treats as token-referenceable models): a token never points
// at one of these, so they must not pollute the props catalog, the Figures /
// Models panels, or model validation. The thumbnail renderer resolves them via
// PREVIEW_MODEL_BY_ID as a fallback lookup.
//
// PARITY NOTE: the geometry below duplicates Scene3D's component-private
// objectShape()/lightFixture(). The clean long-term fix is to extract those
// builders into this module and have Scene3D import them; that was out of scope
// here (Scene3D.svelte was off-limits). Keep the two in sync until then.
import type { ModelDef, ModelBuild } from './types.ts';
import type { ModelKit } from './kit.ts';
import type { MapObjectKind, LightKind } from './sceneTypes.ts';

/** Any mesh/object the kit produces — the element type `group()` accepts. */
type Part = Parameters<ModelKit['group']>[number];

const OBJ_PREFIX = 'obj-';
const LIGHT_PREFIX = 'light-';

/** The preview model id for a map-object (marker) kind. Pure + stable so the
 *  Library panel and this module derive the same id without a lookup table. */
export function objectModelId(kind: MapObjectKind): string { return OBJ_PREFIX + kind; }
/** The preview model id for a light kind. Pure + stable. */
export function lightModelId(kind: LightKind): string { return LIGHT_PREFIX + kind; }

// ── Marker (object) builders ────────────────────────────────────────────────
// `color` is the per-kind tint the caller passes (the OBJECT_PRESETS colour);
// fixed accents (posts, locks, gear hubs) keep their own palette, matching the
// 3D scene.

const doorShape: ModelBuild = (kit, color) => kit.group(
  kit.box(0.1, 0.86, 0.16, 0x6b563a, -0.45, 0.43, 0),   // left post
  kit.box(0.1, 0.86, 0.16, 0x6b563a, 0.45, 0.43, 0),    // right post
  kit.box(1.0, 0.1, 0.16, 0x6b563a, 0, 0.86, 0),        // lintel
  kit.box(0.78, 0.78, 0.08, color, 0, 0.42, 0.02),      // slab
  kit.box(0.06, 0.06, 0.06, 0xffe9b0, 0.3, 0.42, 0.08), // knob
);

const chestShape: ModelBuild = (kit, color) => kit.group(
  kit.box(0.6, 0.34, 0.44, 0x7c4a1e, 0, 0.17, 0),       // body
  kit.box(0.64, 0.2, 0.48, color, 0, 0.42, 0),          // lid
  kit.box(0.1, 0.14, 0.06, 0xffe9b0, 0, 0.3, 0.24),     // lock
);

const trapShape: ModelBuild = (kit, color) => {
  const parts: Part[] = [kit.cyl(0.42, 0.42, 0.04, 0x1c1c24, 0, 0.02, 0, 24)];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(kit.cone(0.05, 0.2, color, Math.cos(a) * 0.22, 0.12, Math.sin(a) * 0.22, 6));
  }
  return kit.group(...parts);
};

const mechanismShape: ModelBuild = (kit, color) => {
  const parts: Part[] = [
    kit.cyl(0.32, 0.32, 0.14, color, 0, 0.1, 0, 20),
    kit.cyl(0.12, 0.12, 0.18, 0xe5e7eb, 0, 0.12, 0, 16),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tooth = kit.box(0.12, 0.12, 0.1, color, Math.cos(a) * 0.36, 0.1, Math.sin(a) * 0.36);
    tooth.rotation.y = -a;
    parts.push(tooth);
  }
  return kit.group(...parts);
};

const pinShape: ModelBuild = (kit, color) => kit.group(
  kit.cyl(0.03, 0.03, 0.5, 0xcbd5e1, 0, 0.25, 0, 8),    // pole
  kit.sph(0.15, color, 0, 0.6, 0),                      // head
);

const housesShape = (n: number): ModelBuild => (kit, color) => {
  const xs = n === 1 ? [0] : n === 2 ? [-0.22, 0.22] : [-0.3, 0, 0.3];
  const parts = xs.flatMap((x, i) => {
    const bh = 0.35 + i * 0.18;
    return [
      kit.box(0.34, bh, 0.34, color, x, bh / 2, 0),                                   // body
      kit.rot(kit.cone(0.3, 0.24, 0x8a5a3c, x, bh + 0.12, 0, 4), 0, Math.PI / 4, 0),  // roof
    ];
  });
  return kit.group(...parts);
};

const locationShape: ModelBuild = (kit, color) => kit.group(
  kit.box(0.55, 0.55, 0.55, color, 0, 0.275, 0),
);

const shopShape: ModelBuild = (kit, color) => kit.group(
  kit.box(0.55, 0.34, 0.5, 0x8a5a3c, 0, 0.17, 0),                       // stall body
  kit.rot(kit.box(0.62, 0.06, 0.3, color, 0, 0.4, 0.22), -0.35, 0, 0),  // awning
);

const blockShape: ModelBuild = (kit, color) => kit.group(
  kit.box(0.4, 0.4, 0.4, color, 0, 0.2, 0),
);

// ── Light builders ──────────────────────────────────────────────────────────

const torchFixture: ModelBuild = (kit, color) => kit.group(
  kit.cyl(0.04, 0.05, 0.55, 0x5a3d23, 0, 0.275, 0, 8),  // pole
  kit.cyl(0.1, 0.06, 0.08, 0x2a2a2a, 0, 0.56, 0, 10),   // cup
  kit.cone(0.1, 0.28, kit.emit(color), 0, 0.74, 0, 10), // flame
);

const campfireFixture: ModelBuild = (kit, color) => kit.group(
  // Ring of fire-pit stones.
  kit.sph(0.07, 0x6b6b73, 0.26, 0.05, 0),
  kit.sph(0.07, 0x5a5a62, -0.26, 0.05, 0),
  kit.sph(0.07, 0x6b6b73, 0, 0.05, 0.26),
  kit.sph(0.07, 0x5a5a62, 0, 0.05, -0.26),
  // Crossed logs lying flat.
  kit.rot(kit.cyl(0.045, 0.045, 0.5, 0x5a3d23, 0, 0.09, 0, 6), 0, 0.5, Math.PI / 2),
  kit.rot(kit.cyl(0.045, 0.045, 0.5, 0x4a3018, 0, 0.09, 0, 6), 0, -0.5, Math.PI / 2),
  // Glowing coal bed + flame.
  kit.sph(0.14, kit.emit(0xff5a18), 0, 0.08, 0, 10, 6),
  kit.cone(0.16, 0.36, kit.emit(color), 0, 0.32, 0, 10),
);

const lanternFixture: ModelBuild = (kit, color) => kit.group(
  kit.cyl(0.03, 0.03, 0.42, 0x4a4a52, 0, 0.21, 0, 8),               // post
  kit.cone(0.13, 0.1, 0x5a5a62, 0, 0.71, 0, 6),                     // cap
  kit.rot(kit.torus(0.12, 0.015, 0x70707a, 0, 0.54, 0, 6), Math.PI / 2, 0, 0), // cage ring
  kit.sph(0.08, kit.emit(color), 0, 0.54, 0),                       // glowing core
);

const magicalFixture: ModelBuild = (kit, color) => kit.group(
  kit.cyl(0.14, 0.18, 0.06, 0x2a2a3a, 0, 0.03, 0, 16),  // base
  kit.sph(0.16, kit.emit(color), 0, 0.55, 0, 18, 18),   // orb
);

const sunlightFixture: ModelBuild = (kit, color) => kit.group(
  kit.sph(0.22, kit.emit(color), 0, 0.7, 0, 20, 20),    // radiant orb
);

const OBJECT_BUILDERS: Record<MapObjectKind, ModelBuild> = {
  door: doorShape,
  poi: pinShape,
  mechanism: mechanismShape,
  trap: trapShape,
  location: locationShape,
  shop: shopShape,
  village: housesShape(1),
  town: housesShape(2),
  city: housesShape(3),
  treasure: chestShape,
  marker: pinShape,
  party: pinShape,   // a "party is here" locator — same pin form as marker/poi
  light: torchFixture,
  unknown: blockShape,
};

const LIGHT_BUILDERS: Record<LightKind, ModelBuild> = {
  torch: torchFixture,
  campfire: campfireFixture,
  lantern: lanternFixture,
  magical: magicalFixture,
  sunlight: sunlightFixture,
};

// A neutral fallback tint — callers (previewObject / previewLight) always pass
// the real preset colour to ModelPreview, so this is only the build() default.
const FALLBACK_TINT = '#c9c4b8';

function toDef(id: string, build: ModelBuild): ModelDef {
  return { id, label: id, icon: '◆', color: FALLBACK_TINT, category: 'Dungeon', build };
}

/** All preview-only marker + light models. */
export const PREVIEW_MODELS: ModelDef[] = [
  ...(Object.keys(OBJECT_BUILDERS) as MapObjectKind[]).map(k => toDef(objectModelId(k), OBJECT_BUILDERS[k])),
  ...(Object.keys(LIGHT_BUILDERS) as LightKind[]).map(k => toDef(lightModelId(k), LIGHT_BUILDERS[k])),
];

/** Id → preview model lookup (consumed by thumbnail.ts as a fallback after
 *  MODEL_BY_ID misses). */
export const PREVIEW_MODEL_BY_ID: Record<string, ModelDef> =
  Object.fromEntries(PREVIEW_MODELS.map(m => [m.id, m]));
