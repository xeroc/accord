---
# accord-ecke
title: CLI accumulator topic — 5 pure MST helpers
status: todo
type: epic
priority: high
tags:
    - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:20:36Z
parent: accord-43co
---

Owns `src/commands/accumulator/` + `test/commands/accumulator/`. **All pure** —
extends `BaseCommand` (no signer, no rpc, no send). Fastest epic; no Surfpool.

## Commands (CLI.md §3 `accumulator`)

| Command | SDK fn | Notes |
|---|---|---|
| `accumulator:build` | `buildAccumulator` (mst.ts:135) | `--leaves <file>` (`[{juror,stake},...]`), `--depth`. → `{rootHash, rootSum}`. |
| `accumulator:proof` | `proofFor` (201) | `--leaves`, `--depth`, `--index`. → path. |
| `accumulator:empty-root` | `emptyRoot` (115) | `--depth`. |
| `accumulator:verify` | `verifyMembership` (277) | `--leaf --index --path <file> --root <hex> --root-sum`. → `{ok, prefix}`. |
| `accumulator:prepare-stake-proof` | `prepareStakeProof` (stakeFlow.ts:80) | `--subaccord --juror` (fetches chain → this one DOES need rpc/signer → use `ChainCommand`). |

## Acceptance

- 4 of 5 are pure (`BaseCommand`); `prepare-stake-proof` reads chain (`ChainCommand`).
- `build` → `proof` → `verify` round-trips; root matches the on-chain
  `frozen_root` for a known stake set.
- Defines the **proof JSON schema** that `staking --path-from` consumes —
  coordinate this contract with the `staking` epic.

## Notes

These are the offline/offchain MST helpers (ADR-0012). They double as the
reference the on-chain verifier must match — keep output byte-exact.
