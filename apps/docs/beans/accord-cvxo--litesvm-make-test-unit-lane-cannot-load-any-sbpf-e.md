---
# accord-cvxo
title: LiteSVM (make test_unit) lane cannot load any sBPF ELF since the v3 migration — add_program fails InvalidAccountData for every arch/toolchain
status: completed
type: task
priority: normal
created_at: 2026-09-22T12:04:25Z
updated_at: 2026-09-22T15:01:32Z
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

## REWRITTEN SCOPE (2026-09-22 — supersedes the diagnosis above)

Root cause found and fixed; the lane is green (27 suites, 329 passed, 0 failed).

Corrected diagnosis (probe: direct `Executable::load` against the locked stack):

- The bean's "no arch/toolchain combination loads" was too broad. v0 ELFs load
  (lenient parser); v1/v2 targets (machine 0x107) load under all_enabled.
- The canonical v3 artifact (v1.57 `--arch v3`: e_machine 247 + e_flags 3 +
  2-segment layout) is the FINAL sBPFv3 object format. agave 3.1.14's sbpf
  0.13.1 expects a TRANSITIONAL v3 shape (e_machine 263 + v2-style segments)
  that no toolchain ever emitted → InvalidFileHeader → InvalidAccountData at
  add_program. sbpf 0.14.4 (agave 4.0) and 0.21.x flipped back to requiring
  e_machine 247 — the final format. So the artifacts were never malformed;
  the litesvm 0.11/agave 3.1.x harness was the outlier.
- `LiteSVM::new()` already builds `FeatureSet::all_enabled()`; the sbpf-version
  gate was never the blocker — the strict ELF parser was.

Fix:

- Vendored `anchor-litesvm` 0.4.0 + `litesvm-utils` 0.4.0 (MIT, upstream pins
  litesvm ^0.11) into `harness/`, retargeted to litesvm 0.16.0 (agave 4.2 /
  sbpf 0.21): dependency-level changes only, zero wrapper source edits; the
  sole test-surface change is `SvmAccount` now imported from the harness
  (solana-account 4.3 line), plus two baseline-slot unit-test fixes inside
  litesvm-utils. Program crates now path-depend on the vendored harness.
- `make verify-sbf` additionally asserts e_machine BPF (247) and staleness
  (program src newer than the .so fails fast) — closing the 2c51f89 trap
  (test_unit never rebuilt target/deploy, so a stale pre-v3 .so ran green).
  `make test_unit` now gates on verify-sbf.

Tests fixed (written under accord-b5v5 but never executable until now):

- reclaim_litesvm exhaustion loop expected a JurorStake for a popped juror
  (pop closes the account — cf. stake_pops_from_free_list_and_closes_freed_account).
- synod fee expectations were pre-ADR-0030: open_case freezes
  (min_jury_size + 1)·fee_per_juror; updated open_case/file_dispute, and the
  payout neutral-remainder test moved to N=3 (4·fpj is always even, so N=2
  can no longer produce a remainder).

## Summary of Changes

- harness/anchor-litesvm, harness/litesvm-utils: vendored, litesvm 0.16.
- Root Cargo.toml + programs/*/Cargo.toml: path deps, comments.
- 14 test files: SvmAccount import line.
- Makefile: verify-sbf machine+staleness checks; test_unit gate.
- AGENTS.md: harness description updated.
