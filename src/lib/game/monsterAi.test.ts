import { describe, it, expect } from 'vitest';
import { makeCell, cellAt, blocksMove, type Level, type TerrainKind } from './terrain.ts';
import { makeRng } from './rng.ts';
import type { Monster } from './monsters.ts';
import { emitScent, makeScentFieldForLevel, stepScent, type ScentField } from './scent.ts';
import { decideMonsterAction, type AiTarget, type MonsterAction } from './monsterAi.ts';

/** The server's aggro radius (gameServer AGGRO), mirrored for these tests. */
const AGGRO = 9;

/** Build a Level from an ASCII map: '#'=wall, '.'=floor, 'o'=pit, '~'=water,
 *  '≈'=deep water, '!'=lava. */
function level(rows: string[]): Level {
  const cols = rows[0].length;
  const kindOf: Record<string, TerrainKind> = {
    '#': 'wall',
    '.': 'floor',
    o: 'pit',
    '~': 'water',
    '≈': 'deepWater',
    '!': 'lava',
  };
  const cells = [];
  for (const line of rows) {
    for (const ch of line) cells.push(makeCell(kindOf[ch] ?? 'floor'));
  }
  return { cols, rows: rows.length, cells, entry: { col: 0, row: 0 } };
}

function monster(col: number, row: number, over: Partial<Monster> = {}): Monster {
  return {
    id: 'm1',
    kindId: 'rat',
    name: 'Cave Rat',
    color: 0,
    col,
    row,
    hp: 6,
    hpMax: 6,
    damage: 2,
    accuracy: 50,
    defense: 0,
    actionTicks: 100,
    abilities: [],
    boss: false,
    state: 'hunting',
    ticksUntilTurn: 0,
    ...over,
  };
}

function delver(col: number, row: number): AiTarget {
  return { id: 'p1', col, row };
}

interface ChaseOptions {
  /** Monster turns to simulate. */
  turns: number;
  /** Turns the delver stands there shedding scent before the monster starts. */
  warmup?: number;
  /** Leave the scent field out entirely (a monster with nothing to track). */
  noScent?: boolean;
  seed?: string;
  canSummon?: boolean;
}

interface Chase {
  actions: MonsterAction[];
  /** Every cell the monster stood on, in order, starting where it began. */
  visited: Array<{ col: number; row: number }>;
  /** True once the monster got close enough to attack the delver. */
  attacked: boolean;
  field: ScentField;
}

/** Run a stationary delver against one monster for `turns` turns, applying each
 *  decision the way the server would (move ⇒ relocate, attack ⇒ resolved). */
function chase(lvl: Level, m: Monster, target: AiTarget, opts: ChaseOptions): Chase {
  const field = makeScentFieldForLevel(lvl);
  const rng = makeRng(opts.seed ?? 'ai-test');
  const shed = () => {
    if (opts.noScent) return;
    emitScent(field, target.col, target.row);
    stepScent(field, lvl);
  };
  for (let t = 0; t < (opts.warmup ?? 0); t++) shed();

  const out: Chase = { actions: [], visited: [{ col: m.col, row: m.row }], attacked: false, field };
  for (let t = 0; t < opts.turns; t++) {
    shed();
    const action = decideMonsterAction({
      level: lvl,
      monster: m,
      targets: [target],
      occupied: new Set(),
      scent: opts.noScent ? null : field,
      aggro: AGGRO,
      canSummon: opts.canSummon,
      rng,
    });
    out.actions.push(action);
    if (action.kind === 'move') {
      m.col = action.col;
      m.row = action.row;
      out.visited.push({ col: m.col, row: m.row });
    } else if (action.kind === 'attack') {
      out.attacked = true;
      break;
    }
  }
  return out;
}

/** The OLD AI's move rule, kept here purely as the regression yardstick: step by
 *  the sign of the delta, with two axis-aligned fallbacks. It freezes forever
 *  when all three candidates are blocked. */
function oldAiIsStuck(lvl: Level, m: Monster, target: AiTarget): boolean {
  const dx = Math.sign(target.col - m.col);
  const dy = Math.sign(target.row - m.row);
  const candidates: Array<[number, number]> = [
    [m.col + dx, m.row + dy],
    [m.col + dx, m.row],
    [m.col, m.row + dy],
  ];
  return candidates.every(([c, r]) => (c === m.col && r === m.row) || blocksMove(lvl, c, r));
}

describe('pursuit around obstacles', () => {
  // The regression case from the fidelity audit: a wall between monster and
  // delver, open only at the bottom. The old sign-stepping AI wedged itself
  // against the wall and never moved again.
  const barrier = [
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '.....',
  ];

  it('navigates around a concave wall the old sign-stepping AI stuck on', () => {
    const lvl = level(barrier);
    const m = monster(1, 2);
    const target = delver(4, 2);

    // Precondition: this is exactly the position the old AI could never leave.
    expect(oldAiIsStuck(lvl, m, target)).toBe(true);

    const run = chase(lvl, m, target, { turns: 25, warmup: 60 });

    expect(run.attacked).toBe(true); // it found its way around and closed in
    expect(run.visited.some((c) => c.row === 4)).toBe(true); // via the gap at the bottom
    for (const c of run.visited) {
      expect(cellAt(lvl, c.col, c.row)!.kind).not.toBe('wall');
    }
  });

  it('walks around a chasm it cannot cross, while a flier goes straight over', () => {
    // A pit doesn't block sight, so both monsters can see the delver the whole
    // way — only the route differs.
    const chasm = [
      '..o..',
      '..o..',
      '..o..',
      '..o..',
      '.....',
    ];

    const walkerLevel = level(chasm);
    const walker = chase(walkerLevel, monster(1, 2), delver(4, 2), { turns: 25, warmup: 30 });
    expect(walker.attacked).toBe(true);
    for (const c of walker.visited) {
      expect(cellAt(walkerLevel, c.col, c.row)!.kind).not.toBe('pit'); // never fell in
    }
    expect(walker.visited.some((c) => c.row === 4)).toBe(true); // took the long way

    const flierLevel = level(chasm);
    const flier = chase(flierLevel, monster(1, 2, { abilities: ['flies'] }), delver(4, 2), {
      turns: 25,
      warmup: 30,
    });
    expect(flier.attacked).toBe(true);
    expect(flier.visited.some((c) => cellAt(flierLevel, c.col, c.row)!.kind === 'pit')).toBe(true);
    expect(flier.visited.length).toBeLessThan(walker.visited.length); // the direct line
  });
});

describe('tracking by scent', () => {
  // A right-angle corridor: from the monster's corner there is no sightline to
  // the delver at all, so the only way to find them is the trail they left.
  const corner = [
    '##.###',
    '##.###',
    '##.###',
    '......',
  ];

  it('follows the trail around a corner it cannot see round', () => {
    const lvl = level(corner);
    const run = chase(lvl, monster(2, 0), delver(5, 3), { turns: 20, warmup: 60 });
    expect(run.attacked).toBe(true);
    expect(run.visited.some((c) => c.row === 3)).toBe(true);
  });

  it('holds position when it can neither see nor smell the delver', () => {
    const lvl = level(corner);
    const run = chase(lvl, monster(2, 0), delver(5, 3), { turns: 5, noScent: true });
    expect(run.actions.every((a) => a.kind === 'wait')).toBe(true);
    expect(run.visited).toHaveLength(1); // never moved: it does not know where you are
  });

  it('sometimes loses the track, which is what makes escape possible', () => {
    const lvl = level(['..........', '..........', '..........']);
    const field = makeScentFieldForLevel(lvl);
    const target = delver(9, 1);
    for (let t = 0; t < 60; t++) {
      emitScent(field, target.col, target.row);
      stepScent(field, lvl);
    }
    // A monster with no sightline (blind to everything but the trail) asked over
    // and over from the same spot: most turns it advances, some it loses the scent.
    const rng = makeRng('lost-trail');
    let waits = 0;
    for (let t = 0; t < 300; t++) {
      const action = decideMonsterAction({
        level: lvl,
        monster: monster(0, 1),
        targets: [{ ...target, elevation: undefined }],
        occupied: new Set(),
        scent: field,
        aggro: 3, // out of sight-range: scent is the only channel
        rng,
      });
      if (action.kind === 'wait') waits++;
    }
    expect(waits).toBeGreaterThan(0);
    expect(waits).toBeLessThan(300 * 0.2); // still a competent tracker
  });
});

describe('ability flags', () => {
  const open = ['.......', '.......', '.......', '.......', '.......'];

  it('a sleeping monster does nothing', () => {
    const lvl = level(open);
    const run = chase(lvl, monster(1, 1, { state: 'sleeping' }), delver(3, 1), {
      turns: 5,
      warmup: 20,
    });
    expect(run.actions.every((a) => a.kind === 'wait')).toBe(true);
  });

  it('bites when adjacent', () => {
    const lvl = level(open);
    const run = chase(lvl, monster(2, 1), delver(3, 1), { turns: 1, warmup: 5 });
    expect(run.actions[0]).toEqual({ kind: 'attack', targetId: 'p1', ranged: false });
  });

  it('a ranged attacker shoots down a clear line instead of closing', () => {
    const lvl = level(open);
    const run = chase(lvl, monster(1, 1, { abilities: ['ranged'] }), delver(5, 1), {
      turns: 1,
      warmup: 5,
    });
    expect(run.actions[0]).toEqual({ kind: 'attack', targetId: 'p1', ranged: true });
  });

  it('an immobile turret never moves', () => {
    const lvl = level(open);
    const m = monster(1, 1, { abilities: ['immobile'] });
    const run = chase(lvl, m, delver(5, 1), { turns: 10, warmup: 30 });
    expect(run.actions.every((a) => a.kind === 'wait')).toBe(true);
    expect(m.col).toBe(1);
    expect(m.row).toBe(1);
  });

  it('a summoner conjures instead of closing, but only when off cooldown', () => {
    const lvl = level(open);
    const ready = chase(lvl, monster(1, 1, { abilities: ['summons'] }), delver(5, 1), {
      turns: 1,
      warmup: 5,
      canSummon: true,
    });
    expect(ready.actions[0]).toEqual({ kind: 'summon' });

    const cooling = chase(lvl, monster(1, 1, { abilities: ['summons'] }), delver(5, 1), {
      turns: 1,
      warmup: 5,
      canSummon: false,
    });
    expect(cooling.actions[0].kind).toBe('move'); // closes the distance instead
  });

  it('a fleeing monster puts ground between itself and the delver', () => {
    const lvl = level(open);
    const m = monster(2, 2, { abilities: ['flees'] });
    const target = delver(1, 2);
    const dist = () => Math.max(Math.abs(m.col - target.col), Math.abs(m.row - target.row));

    let prev = dist();
    for (let t = 0; t < 4; t++) {
      chase(lvl, m, target, { turns: 1, warmup: 5 });
      expect(dist()).toBeGreaterThan(prev);
      prev = dist();
    }
  });

  it('a cornered coward fights back rather than freezing', () => {
    // A one-cell alcove with the delver in the mouth of it: nowhere to run.
    const lvl = level([
      '###',
      '#.#',
      '#.#',
    ]);
    const run = chase(lvl, monster(1, 1, { abilities: ['flees'] }), delver(1, 2), {
      turns: 1,
      warmup: 5,
    });
    expect(run.actions[0]).toEqual({ kind: 'attack', targetId: 'p1', ranged: false });
  });

  it('an aquatic monster never leaves the water', () => {
    const pond = [
      '.....',
      '.~~~.',
      '.~~~.',
      '.....',
    ];
    const lvl = level(pond);
    const m = monster(1, 1, { abilities: ['aquatic'] });
    // The delver stands on dry land in the far corner: the straight-line step
    // would beach the monster, so it has to swim the long way round.
    const run = chase(lvl, m, delver(4, 0), { turns: 15, warmup: 30 });
    for (const c of run.visited) {
      expect(cellAt(lvl, c.col, c.row)!.kind).toBe('water');
    }
    expect(run.attacked).toBe(true); // still gets its ambush in from the shallows
  });

  // ── merge seams: the AI was written against the terrain kinds that existed
  // before deep water and lava were added. These pin the properties it must ask
  // about, so a future terrain kind cannot silently reopen the gap.

  it('an aquatic monster swims in deep water too, not just the shallows', () => {
    // An eel confined to the shallow rim could never reach open water — the very
    // place it is supposed to lurk.
    const lvl = level([
      '.....',
      '.~≈~.',
      '.~≈~.',
      '.....',
    ]);
    const m = monster(1, 1, { abilities: ['aquatic'] });
    const run = chase(lvl, m, delver(4, 0), { turns: 15, warmup: 30 });
    expect(run.visited.length).toBeGreaterThan(0);
    for (const c of run.visited) {
      expect(['water', 'deepWater']).toContain(cellAt(lvl, c.col, c.row)!.kind);
    }
    expect(run.visited.some((c) => cellAt(lvl, c.col, c.row)!.kind === 'deepWater')).toBe(true);
  });

  it('nothing walks into lava — not even a flier', () => {
    // `flies` clears what is underfoot, not what is molten.
    const lvl = level([
      '.....',
      '.!!!.',
      '.....',
    ]);
    const target = delver(2, 2);
    for (const abilities of [[], ['flies'] as const]) {
      const m = monster(2, 0, { abilities: [...abilities] as Monster['abilities'] });
      const run = chase(lvl, m, target, { turns: 12, warmup: 30 });
      for (const c of run.visited) {
        expect(cellAt(lvl, c.col, c.row)!.kind, `abilities=${abilities}`).not.toBe('lava');
      }
    }
  });
});

describe('determinism', () => {
  it('same seed → same decisions', () => {
    const build = () =>
      chase(level(['......', '......', '......']), monster(0, 1), delver(5, 1), {
        turns: 12,
        warmup: 40,
        seed: 'same-seed#3',
      }).actions;
    expect(build()).toEqual(build());
  });
});
