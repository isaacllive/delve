import { describe, it, expect } from 'vitest';
import { generateDungeon, getLevel } from './dungeon.ts';
import {
  isUnaware,
  kindById,
  MUTATION_MIN_DEPTH,
  nextAwareness,
  spawnMonsters,
  tierFor,
  WAKE_RANGE,
  type Monster,
} from './monsters.ts';

/** Collect every non-boss monster across `seeds` runs at `depth`. */
function sampleMonsters(depth: number, seeds: number): Monster[] {
  const all: Monster[] = [];
  for (let s = 0; s < seeds; s++) {
    const d = generateDungeon(`sample-${s}`);
    for (const m of spawnMonsters(d.seed, getLevel(d, depth))) {
      if (!m.boss) all.push(m);
    }
  }
  return all;
}

/** Chebyshev distance between two monsters. */
function cheb(a: Monster, b: Monster): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

describe('spawnMonsters', () => {
  it('is deterministic for a floor', () => {
    const d = generateDungeon('mon-seed');
    const a = spawnMonsters(d.seed, getLevel(d, 5));
    const b = spawnMonsters(d.seed, getLevel(d, 5));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('spawns no monsters in the base camp', () => {
    const d = generateDungeon('mon-seed');
    expect(spawnMonsters(d.seed, getLevel(d, -1))).toEqual([]);
  });

  it('populates dungeon floors with monsters', () => {
    const d = generateDungeon('mon-seed');
    expect(spawnMonsters(d.seed, getLevel(d, 3)).length).toBeGreaterThan(0);
  });

  it('places exactly one boss on the bottom floor', () => {
    const d = generateDungeon('mon-seed', { levelCount: 3 });
    const bosses = spawnMonsters(d.seed, getLevel(d, 2)).filter((m) => m.boss);
    expect(bosses).toHaveLength(1);
    expect(bosses[0].hp).toBeGreaterThan(100);
  });

  it('monsters spawn away from the arrival point', () => {
    const d = generateDungeon('mon-seed');
    const lvl = getLevel(d, 4);
    for (const m of spawnMonsters(d.seed, lvl)) {
      const dist = Math.abs(m.col - lvl.entry.col) + Math.abs(m.row - lvl.entry.row);
      expect(dist).toBeGreaterThanOrEqual(6);
    }
  });

  it('never stacks two monsters on the same cell', () => {
    const d = generateDungeon('mon-seed');
    const mons = spawnMonsters(d.seed, getLevel(d, 7));
    const cells = new Set(mons.map((m) => `${m.col},${m.row}`));
    expect(cells.size).toBe(mons.length);
  });

  it('gives every spawned monster a positive per-kind action cost', () => {
    for (const m of sampleMonsters(5, 8)) expect(m.actionTicks).toBeGreaterThan(0);
  });
});

describe('hordes', () => {
  it('spawn companions in clusters near a leader', () => {
    // A goblin/rat/jackal floor should produce at least one tight same-kind pair.
    const mons = sampleMonsters(2, 12);
    const byKind = new Map<string, Monster[]>();
    for (const m of mons) {
      const arr = byKind.get(m.kindId) ?? [];
      arr.push(m);
      byKind.set(m.kindId, arr);
    }
    let clustered = false;
    for (const group of byKind.values()) {
      for (let i = 0; i < group.length && !clustered; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (cheb(group[i], group[j]) <= 3) {
            clustered = true;
            break;
          }
        }
      }
    }
    expect(clustered).toBe(true);
  });
});

describe('catalog integrity', () => {
  it('every horde companion id resolves to a real kind', () => {
    for (let depth = 0; depth < 100; depth += 20) {
      for (const kind of tierFor(depth)) {
        for (const member of kind.horde ?? []) {
          expect(kindById(member.kindId), `${kind.id} → ${member.kindId}`).toBeDefined();
          expect(member.min).toBeLessThanOrEqual(member.max);
        }
      }
    }
  });

  it('preserves the original kind ids the server relies on', () => {
    const ids = new Set(
      [0, 20, 40, 60, 80].flatMap((d) => tierFor(d).map((k) => k.id)),
    );
    for (const legacy of ['rat', 'goblin', 'skeleton', 'ghoul', 'imp', 'hound', 'sentinel', 'wraith', 'horror', 'fiend']) {
      expect(ids.has(legacy), legacy).toBe(true);
    }
  });

  it('marks a fast kind (jackal) with a sub-normal action cost', () => {
    const jackal = kindById('jackal');
    expect(jackal?.actionTicks).toBeLessThan(100);
  });
});

describe('out-of-depth spawns', () => {
  it('occasionally draws a deeper-tier kind onto a shallow floor', () => {
    const ownTierIds = new Set(tierFor(5).map((k) => k.id));
    const deeper = sampleMonsters(5, 40).filter((m) => !ownTierIds.has(m.kindId));
    expect(deeper.length).toBeGreaterThan(0);
    // The intruder must be a genuine kind from a deeper tier.
    for (const m of deeper) expect(kindById(m.kindId)).toBeDefined();
  });
});

describe('mutations', () => {
  it('never mutate monsters above the depth threshold', () => {
    for (let depth = 0; depth < MUTATION_MIN_DEPTH; depth += 5) {
      for (const m of sampleMonsters(depth, 6)) expect(m.mutation).toBeUndefined();
    }
  });

  it('apply mutation modifiers to some monsters past the threshold', () => {
    const mutated = sampleMonsters(MUTATION_MIN_DEPTH + 5, 40).filter((m) => m.mutation);
    expect(mutated.length).toBeGreaterThan(0);
    for (const m of mutated) {
      // The name is prefixed with the mutation adjective.
      expect(m.name).toMatch(/^[A-Z]/);
      // Juggernauts are tankier/slower; explosive/toxic add an ability.
      if (m.mutation === 'juggernaut') expect(m.actionTicks).toBeGreaterThan(100);
      if (m.mutation === 'explosive') expect(m.abilities).toContain('explodesOnDeath');
      if (m.mutation === 'toxic') expect(m.abilities).toContain('poisons');
    }
  });
});

const AGGRO = 9;

describe('nextAwareness', () => {
  it('snaps to hunting when a delver is adjacent, whatever the state', () => {
    for (const s of ['sleeping', 'wandering', 'hunting'] as const) {
      expect(nextAwareness(s, { dist: 1, los: false, aggro: AGGRO })).toBe('hunting');
    }
  });

  it('wakes a sleeper only within wake range AND with line of sight', () => {
    expect(nextAwareness('sleeping', { dist: WAKE_RANGE, los: true, aggro: AGGRO })).toBe('hunting');
    expect(nextAwareness('sleeping', { dist: WAKE_RANGE, los: false, aggro: AGGRO })).toBe('sleeping');
    expect(nextAwareness('sleeping', { dist: WAKE_RANGE + 1, los: true, aggro: AGGRO })).toBe('sleeping');
  });

  it('promotes a wanderer to hunting once it sees a delver within aggro', () => {
    expect(nextAwareness('wandering', { dist: AGGRO, los: true, aggro: AGGRO })).toBe('hunting');
    expect(nextAwareness('wandering', { dist: AGGRO, los: false, aggro: AGGRO })).toBe('wandering');
    expect(nextAwareness('wandering', { dist: AGGRO + 1, los: true, aggro: AGGRO })).toBe('wandering');
  });

  it('drops a hunter to wandering when the trail goes cold (beyond aggro)', () => {
    expect(nextAwareness('hunting', { dist: AGGRO + 1, los: true, aggro: AGGRO })).toBe('wandering');
    expect(nextAwareness('hunting', { dist: AGGRO, los: false, aggro: AGGRO })).toBe('hunting');
  });
});

describe('isUnaware', () => {
  it('flags everything but hunting as sneak-attackable', () => {
    expect(isUnaware('sleeping')).toBe(true);
    expect(isUnaware('wandering')).toBe(true);
    expect(isUnaware('hunting')).toBe(false);
  });
});
