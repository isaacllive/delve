// Light sources. Ported from RealmQuest VTT: `LIGHT_PRESETS` (src/lib/scene.ts)
// and `cellLitByLights` (src/lib/sceneMap.ts) — a cell is lit by a light when
// it's within the light's radius AND the light has a clear line of sight to it
// (so walls cast shadows). In Delve every player carries a torch, and the
// dungeon can seed fixed light fixtures (braziers, glowing crystals).

import type { Cell } from './grid.ts';

export type LightKind = 'torch' | 'campfire' | 'lantern' | 'brazier' | 'crystal' | 'magical';

export interface LightSource extends Cell {
  radius: number;
  color: string;
  kind: LightKind;
  elevation?: number;
}

export const LIGHT_PRESETS: Record<
  LightKind,
  { radius: number; color: string; label: string }
> = {
  torch: { radius: 6, color: '#ffaa55', label: 'Torch' },
  campfire: { radius: 7, color: '#ff8a3a', label: 'Campfire' },
  lantern: { radius: 8, color: '#ffd58a', label: 'Lantern' },
  brazier: { radius: 6, color: '#ff7a3a', label: 'Brazier' },
  crystal: { radius: 7, color: '#8ad0ff', label: 'Glowcrystal' },
  magical: { radius: 7, color: '#c4b5fd', label: 'Arcane' },
};

export function makeLight(kind: LightKind, col: number, row: number): LightSource {
  const p = LIGHT_PRESETS[kind];
  return { kind, col, row, radius: p.radius, color: p.color };
}

/**
 * Is (col,row) reached by any light, honoring each light's own wall shadows?
 * `losClear(a,b)` is a caller callback (keeps terrain lookups out of here).
 * Ported from RealmQuest `cellLitByLights`. Returns the strongest contributing
 * light (for tinting) or null when dark.
 */
export function cellLitByLights(opts: {
  cell: Cell;
  lights: readonly LightSource[];
  losClear: (a: Cell, b: Cell) => boolean;
}): LightSource | null {
  const { cell, lights, losClear } = opts;
  let best: LightSource | null = null;
  let bestFrac = 0;
  for (const L of lights) {
    if (L.radius <= 0) continue;
    const d = Math.max(Math.abs(cell.col - L.col), Math.abs(cell.row - L.row));
    if (d > L.radius) continue;
    if (!losClear({ col: L.col, row: L.row }, cell)) continue;
    const frac = 1 - d / (L.radius + 1);
    if (frac > bestFrac) {
      bestFrac = frac;
      best = L;
    }
  }
  return best;
}
