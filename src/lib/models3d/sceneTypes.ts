// Local shim for the handful of tabletop-scene types the wall/object builders
// reference. In RealmQuest these live in `$lib/scene.ts` (the whole VTT scene
// model); delve has no scene concept, so we vendor just the three type aliases
// the imported builders need, keeping the models3d library self-contained.
// These are pure types — no runtime behaviour crosses over.

/** Which of a wall cell's four edges connect to neighbouring walls. */
export interface WallLinks { n: boolean; e: boolean; s: boolean; w: boolean }

/** Light-source presets a scene marker can represent. */
export type LightKind = 'torch' | 'campfire' | 'lantern' | 'magical' | 'sunlight';

/** Map-object marker kinds (doors, POIs, traps, settlements, …). */
export type MapObjectKind =
  | 'door' | 'poi' | 'mechanism' | 'trap' | 'location' | 'shop'
  | 'village' | 'town' | 'city' | 'treasure' | 'marker' | 'party'
  | 'light' | 'unknown';
