---
# accord-cvxo
title: LiteSVM (make test_unit) lane cannot load any sBPF ELF since the v3 migration — add_program fails InvalidAccountData for every arch/toolchain
status: draft
type: task
created_at: 2026-09-22T12:04:25Z
updated_at: 2026-09-22T12:04:25Z
---

## Motivation

Discovered while running accord-b5v5 (2026-09-22): every `*_litesvm.rs` suite
fails at program LOAD with `Failed to add program: Instruction(InvalidAccountData)`
(litesvm-utils builder.rs:78). This is repo-wide and pre-existing — it is NOT
caused by any single program change.

## Evidence (all reproduced today)

- Fresh `anchor build` (sBPFv3, tools v1.57): all suites fail at load.
- The migration-day artifact itself
  (`/home/xeroc/projects/Accord/accord/target/deploy/accord.so`, built Sep 21
  16:12, the exact .so 2c51f89 verified as "LiteSVM green") ALSO fails to load.
- Standalone probe against `litesvm 0.11` + the repo's locked agave stack
  (agave-feature-set/syscalls/bpf-loader/program-runtime 3.1.14):
  - `add_program` fails for ELFs built `--arch v0` (bundled v1.52 tools), `v1`,
    `v2`, `v3` (tools v1.56 AND v1.57) — default AND `FeatureSet::all_enabled()`
    (+ `with_builtins()` after, so the runtime env is rebuilt) AND default+v3-
    feature-only. Also fails via `add_program_with_loader(BPFLoader2)`.
  - litesvm 0.12.0 (same agave 3.1 line) fails identically.
- Conclusion: litesvm 0.11/0.12 with the resolved agave-3.1.14 patch set cannot
  load ANY sBPF ELF in this environment. The 2c51f89 "LiteSVM green" claim
  does not reproduce with the same lockfile + same artifact; most likely it
  ran against a stale pre-v3 .so (`make test_unit` never rebuilds
  target/deploy/*.so, so the migration's rebuild silently invalidated the lane
  without failing anything).

## Recommendation

- Reproduce on another machine to rule out environment.
- If confirmed: bump the harness to the litesvm 0.13+/0.14 line (agave 4.x) —
  anchor-litesvm 0.4.0 pins litesvm "=0.11"-family, so this needs an
  anchor-litesvm upgrade (or a thin local replacement around
  `AnchorContext::new(LiteSVM, id)`), plus a Cargo.lock refresh of the agave
  stack. The e2e Surfpool lane is unaffected and is the CI-green proof lane.
- Alternative stopgap: make `test_unit` build a litesvm-compatible artifact —
  rejected today because NO arch/toolchain combination loads (see evidence).

## Acceptance

- `make test_unit` executes `reclaim_litesvm.rs` (17 tests) and the sibling
  suites against the current sBPFv3 artifacts without load failures.
