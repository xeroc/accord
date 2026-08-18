---
# accord-ejga
title: Consistency review — Anchor 1.0.2 + canon parity, workspace green
status: completed
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-l7k7
blocked_by:
    - accord-y8w1
---

assigned: reviewer
The milestone gates on consistency: crate layout vs canon (SEED_ constants, error enums, per-instruction handler files, thin #[program]), codegen discipline (generated never hand-edited; make codegen idempotent — diff clean on re-run), SDK facade vs canon facade patterns, e2e harness reuse (zero duplicated RPC/payer boilerpling), CI workflow commands green (pnpm -r --filter packages/apps lint+build+test), make lint + make test green, change-coupling greps from AGENTS.md (no stale references anywhere). Blocks milestone completion.

## Summary of Changes

Consistency review executed against current tree (synod program/SDK/e2e code
beans still todo — their canon-parity is enforced when they land; this pass
gates what exists). All workspace gates green, four stale-reference clusters
fixed.

### Gates verified

- `make codegen` — exit 0, **zero diff in `src/generated/`** (idempotent;
  nothing hand-edited).
- CI triple with the workflow's exact filters
  (`pnpm run -r --filter "./packages/*" --filter "./apps/*" lint|build|test`)
  — all exit 0.
- `make lint` green; **`make test` green** (Rust + LiteSVM + jest e2e on
  Surfpool: 18/19 suites, 65 passed, 1 skipped = the sanctioned
  skip-don't-fail daemon lane with `EVIDENCE_DAEMON_URL` unset).
- e2e harness reuse: RPC/payer/send plumbing confined to `tests/src/setup/`;
  the only self-contained pipeline (`e2e.test.ts`) is the deliberate
  offline-CI daemon sign-off that must skip-not-throw when infra is absent.
- SDK vs canon facade patterns consistent (canon flat `methods.ts`/`pda`/
  `fetch`/`queries` = the reference shape for the future `@useaccord/synod`).

### Fixes

- **Synod stub crate realigned to canon layout**: `error.rs` → `errors.rs`,
  `instructions.rs` → `instructions/mod.rs` (canon: `constants.rs`, `errors.rs`,
  `events.rs`, `instructions/`, `state.rs`). Compiles (`cargo check`), builds
  through `anchor build`. SEED_*/typed error enum land with accord-oeem.
- **`apps/cli/README.md`**: 4 stale `PauseState` type names → `AccordState`
  (prose, `accordState` output field, read-table row). Command names
  (`lifecycle:init-pause`, `read:pause-state`) verified current — untouched.
- **`.agents/skills/useaccord/references/01-lifecycle.md`**: the three
  circuit-breaker examples passed `--pause-state <addr|auto>` which **does not
  exist** on `lifecycle:pause`/`propose-unpause`/`execute-unpause` (flags =
  chainFlags only) — copy-paste commands would error. Dropped; note now says
  the PDA auto-derives.
- **`02-staking.md`**: `--pause-state` was claimed as a common flag for all
  staking commands — it exists only on `staking:stake` (`stake.ts`). Scoped.
- **`apps/canon/.../challengeFlow.ts`**: local var `pauseState` → `accordState`
  (leftover from the AccordState rename; account key was already correct).
- Change-coupling greps clean: `risk_type`, `PauseState`/`pause_state`/
  `b"pause"` (outside historical ADR prose), old synod module paths — no
  further code references.
