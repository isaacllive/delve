# Delve — engineering guidelines

Project guidance for anyone (human or agent) working in this repo. Read this
first, then `README.md` (stack/run) and `TASKS.md` (roadmap).

## Prime directive

Produce code that is **correct, clear, testable, and maintainable** — not merely
code that works. When principles conflict, prefer in this order:

1. Correctness → 2. Security → 3. Data integrity → 4. Clarity →
5. Maintainability → 6. UX → 7. Reliability → 8. Performance →
9. Extensibility → 10. Brevity.

Never trade away correctness or security for less code.

## Core principles

- **DRY** — one authoritative source per rule/constant/type. Extract shared
  behavior only when the abstraction is genuinely reusable, not to dedupe a few
  lines. (E.g. `eventKinds`-style single lists, shared `protocol.ts` types used
  by client + server.)
- **KISS** — simplest correct solution. No frameworks, patterns, layers, or
  abstractions without a real requirement.
- **YAGNI** — build only what's requested. Don't add config, extension points,
  or infrastructure for hypothetical futures.
- **Separation of concerns / SRP** — one clear purpose per module/function, one
  reason to change. Keep UI, game logic, domain rules, net, and config distinct.
- **Composition over inheritance.** Small, cohesive, loosely-coupled modules
  with minimal public interfaces and hidden internals — but don't fragment into
  too-small pieces.

## This codebase's shape (follow it)

- **Pure game logic** lives in `src/lib/game/*.ts` — deterministic, no DOM/IO,
  unit-tested next to the source (`*.test.ts`). Keep it pure.
- **Authoritative server** is `src/lib/server/gameServer.ts`. All movement,
  combat, transitions, and hazard resolution are validated here. **Never trust
  the client** for game state — it sends intents only.
- **Determinism**: dungeon geometry regenerates from the seed on both server and
  client (`seed#depth`), so geometry never crosses the wire. Any change to
  generation must stay deterministic (no `Date.now`/`Math.random` in gen — use
  the seeded `rng.ts`).
- **Wire contract** is `src/lib/game/protocol.ts` — the single source of truth
  for client/server messages. Change it in one place.
- **State ownership**: server owns run/world state; client mirrors it reactively
  (`net.svelte.ts` runes). Derive with `$derived`; don't duplicate state. Keep
  client state as local as possible.
- **The `ws` server does NOT hot-reload** — restart the dev server after any
  server-side change (see `TASKS.md` / agent memory).

## Code quality

- Descriptive names; explicit control flow; early returns; short functions;
  no magic numbers/strings (name them as constants).
- Comments explain *why* (decisions, constraints, non-obvious reasoning) — never
  restate the code.
- Avoid hidden side effects and global mutable state. Where global state is
  unavoidable (HMR-surviving run registry, tick timer) it's on `globalThis` and
  documented at the declaration.
- Prefer immutable updates for game-state derivations; keep the imperative
  blast radius small in perf-sensitive render paths (documented where it exists).

## Interactive / UI

Represent **loading, empty, success, and error/failure** states explicitly
(e.g. connecting / generating / dead / victory overlays). Give immediate
feedback for actions, confirm destructive/irreversible actions, and make the UI
reflect real system state rather than hiding failures.

## Errors & security

- Handle errors deliberately — don't silently swallow them. Distinguish expected
  domain outcomes from unexpected failures. Don't leak internals to users.
- Treat all client input as untrusted; validate/clamp on the server (name/chat
  length caps, move validation, bounds checks are already the pattern).
- Never hard-code secrets. Enforce any authorization on the server, never the UI.

## Testing

Unit-test core rules, state transitions, error conditions, and data
transformations — test **behavior, not implementation**. Add a regression test
when fixing a defect. Don't write meaningless coverage-filler tests. Run
`npm run test` + `npm run check` before considering a change done.

## Workflow

1. Restate the objective + constraints. 2. Inspect existing patterns.
3. Make the smallest coherent change using existing utilities. 4. Consider
validation, failure modes, security, compatibility. 5. Add/update tests.
6. Run check + tests. 7. Review for unnecessary complexity. 8. Summarize what
changed, why, and any limitations.

- Reuse existing utilities before creating new ones; follow the folder/naming
  conventions. Keep changes focused and reviewable — no broad refactors during
  narrow feature work. Don't remove seemingly-unused behavior without verifying
  its purpose.
- **Parallelize independent features/work** when they don't share state or
  ordering constraints; keep tightly-coupled changes sequential.
- Don't claim code was tested unless it was actually run. State assumptions and
  remaining limitations plainly.
