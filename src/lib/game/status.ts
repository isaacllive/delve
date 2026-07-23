// Status effects — the MECHANISM (afflict, refresh, expire, query), pure and
// deterministic. Brogue's tactical texture lives here: confusion scrambling your
// retreat, levitation carrying you over a chasm, haste buying a free attack,
// paralysis handing the ogre three swings.
//
// SCOPE, deliberately: this module owns how a status is CARRIED — stacking,
// duration, decay, lookup — and nothing about what any individual status DOES.
// Those rules belong to the systems that own the affected behaviour (movement
// scrambling in the move handler, speed in the energy scheduler, damage in the
// combat path), so a status cannot quietly become a second place where movement
// or combat is decided. Wiring each kind's effect is gap G2.
//
// The `StatusKind` / `ActorStatus` types come from the wire contract
// (protocol.ts) and are re-exported here, matching how monsters.ts re-exports
// MonsterAwareness — one vocabulary, no parallel definition.

export type { StatusKind, ActorStatus } from './protocol.ts';
import type { StatusKind, ActorStatus } from './protocol.ts';

/** Anything that can be afflicted: delvers and monsters both. The list is
 *  optional so a monster only pays for it once something actually afflicts it. */
export interface StatusHolder {
  statuses?: ActorStatus[];
}

/**
 * Afflict (or refresh) a holder with a timed status. Re-applying does NOT stack
 * a second copy — it extends to the LONGER remaining duration and keeps the
 * STRONGER magnitude. Stacking copies is how a few overlapping gas clouds turn
 * into permanent paralysis; refreshing keeps a status bounded by its strongest
 * single source, which is the behaviour Brogue's afflictions rely on.
 *
 * A non-positive duration is a no-op (nothing is afflicted for zero turns).
 */
export function addStatus(
  holder: StatusHolder,
  kind: StatusKind,
  turns: number,
  magnitude?: number,
): void {
  if (turns <= 0) return;
  const list = (holder.statuses ??= []);
  const current = list.find((s) => s.kind === kind);
  if (!current) {
    list.push(magnitude === undefined ? { kind, turns } : { kind, turns, magnitude });
    return;
  }
  current.turns = Math.max(current.turns, turns);
  if (magnitude !== undefined) current.magnitude = Math.max(current.magnitude ?? 0, magnitude);
}

/** Is this status currently active on the holder? */
export function hasStatus(holder: StatusHolder, kind: StatusKind): boolean {
  return !!holder.statuses?.some((s) => s.kind === kind);
}

/** The active status, for reading its remaining turns or magnitude. */
export function getStatus(holder: StatusHolder, kind: StatusKind): ActorStatus | undefined {
  return holder.statuses?.find((s) => s.kind === kind);
}

/** End a status early (a cure, a negation, walking out of the cloud). */
export function clearStatus(holder: StatusHolder, kind: StatusKind): void {
  if (!holder.statuses) return;
  holder.statuses = holder.statuses.filter((s) => s.kind !== kind);
}

/**
 * Advance every status on a holder by one turn, dropping the lapsed ones.
 * Called once per turn per actor by the server's world-system list — the single
 * clock for afflictions, so nothing can decay at its own private rate.
 */
export function decayStatuses(holder: StatusHolder): void {
  const list = holder.statuses;
  if (!list || list.length === 0) return;
  const survivors: ActorStatus[] = [];
  for (const s of list) {
    s.turns -= 1;
    if (s.turns > 0) survivors.push(s);
  }
  holder.statuses = survivors;
}
