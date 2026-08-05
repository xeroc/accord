---
# veridao-1lvm
title: Provision canonical Accord deploy keypair (RokLJyruq) or add local program-id override for integration tests
status: completed
type: task
priority: normal
created_at: 2026-08-05T01:19:55Z
updated_at: 2026-08-05T02:58:00Z
parent: veridao-5y8e
---

Blocker C for veridao-7iiv (discovered session 2). anchor build generates a mismatched deploy keypair (5oV81KLt...) because the canonical keypair for RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe is absent from the worktree. The program ID is baked into declare_id!, Anchor.toml, the committed Codama client (packages/sdk/src/generated/programs/accord.ts), and packages/sdk/src/pda.ts (ACCORD_PROGRAM_ID). Without the canonical keypair the program cannot be deployed at the address the SDK targets, blocking every integration test that issues a real instruction. Options for the operator: (1) provision target/deploy/accord-keypair.json whose pubkey is RokLJyruq... (the originally-provisioned secret), OR (2) add a local program-id override mechanism to the SDK (Accord config + Codama regen path) so local tests can target a freshly-generated keypair without touching the canonical ADR-level program ID. (1) is preferred — keeps the SDK as-is. Unblocks the non-VRF slice of veridao-7iiv.

## Decision

Since this is a development branch and worktree, we do not need to worry about
deployment. The tests can be run using anchor --ignore-keys flag to skip this check.

## Summary of Changes

**Resolution: `--ignore-keys` + `--bpf-program` at the declared address. No
canonical keypair needed, no SDK changes, no Codama regen.**

The canonical deploy keypair is NOT required for local testing.
`solana-test-validator --bpf-program <addr> <so>` loads any `.so` at any
address — the keypair is only used by `anchor build`'s keysync _check_ (which
`--ignore-keys` skips) and by `solana program deploy` (which test-validator
does not use). Since the `.so` declares `RokLJyru…` via `declare_id!` and the
validator loads it AT `RokLJyru…`, `crate::ID == loaded_address` → Anchor's
owner checks pass trivially → the program is fully functional.

### Changes (Makefile only)

- `build` / `codegen` / `test` targets now pass `--ignore-keys` to `anchor build`.
- New `run_validator` target: starts `solana-test-validator --reset
--bpf-program $(ACCORD_PROGRAM_ID) target/deploy/accord.so` — loads the
  program at its declared address for local integration tests.
- `test` target: `anchor build --ignore-keys` then `anchor test --skip-build`
  (runs the jest suite; for on-chain tests, start `make run_validator` first).
- `ACCORD_PROGRAM_ID` Makefile variable for reuse.

### Verification (all green)

- `anchor build --ignore-keys` → `.so` (640720 bytes) + IDL produced.
- `make codegen` → Codama output byte-identical to committed tree (declare_id
  unchanged → no SDK/Codama diff).
- `make build` → program + LiteSVM tests (all pass) + SDK build green.
- `make lint` → SDK typecheck green.
- `make test` → jest pipeline smoke 6/6 green.
- **Empirical deploy test**: `solana-test-validator --bpf-program RokLJyru…
accord.so` → `solana program show RokLJyru…` confirms the program is loaded
  at the declared address (Owner: BPFLoaderUpgradeable, 640720 bytes).

### Unblocks

`veridao-7iiv` (jest integration suite): the non-VRF lifecycle slice can now
build + deploy + test. The VRF tail still depends on Blocker B (Surfpool VRF
oracle env — operator decision).
