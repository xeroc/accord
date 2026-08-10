---
# accord-ecke
title: CLI accumulator topic — 5 pure MST helpers
status: completed
type: epic
priority: high
tags:
  - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:29:23Z
parent: accord-43co
---

Owns `src/commands/accumulator/` + `test/commands/accumulator/`. **All pure** —
extends `BaseCommand` (no signer, no rpc, no send). Fastest epic; no Surfpool.

## Commands (CLI.md §3 `accumulator`)

| Command                           | SDK fn                                | Notes                                                                                       |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `accumulator:build`               | `buildAccumulator` (mst.ts:135)       | `--leaves <file>` (`[{juror,stake},...]`), `--depth`. → `{rootHash, rootSum}`.              |
| `accumulator:proof`               | `proofFor` (201)                      | `--leaves`, `--depth`, `--index`. → path.                                                   |
| `accumulator:empty-root`          | `emptyRoot` (115)                     | `--depth`.                                                                                  |
| `accumulator:verify`              | `verifyMembership` (277)              | `--leaf --index --path <file> --root <hex> --root-sum`. → `{ok, prefix}`.                   |
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

## Summary of Changes

Implemented all 5 `accumulator:*` commands in `apps/cli/src/commands/accumulator/`,
each mapping 1:1 to its SDK fn:

| Command                           | Base                         | SDK fn                            | File                     |
| --------------------------------- | ---------------------------- | --------------------------------- | ------------------------ |
| `accumulator:build`               | `BaseCommand` (pure)         | `buildAccumulator`                | `build.ts`               |
| `accumulator:proof`               | `BaseCommand` (pure)         | `proofFor` (+ `buildAccumulator`) | `proof.ts`               |
| `accumulator:empty-root`          | `BaseCommand` (pure)         | `emptyRoot`                       | `empty-root.ts`          |
| `accumulator:verify`              | `BaseCommand` (pure)         | `verifyMembership`                | `verify.ts`              |
| `accumulator:prepare-stake-proof` | `ChainCommand` (reads chain) | `prepareStakeProof`               | `prepare-stake-proof.ts` |

- **Proof file schema defined** (`src/lib/accumulator-format.ts`): `{version:1, index, path:[{siblingHash:<64 hex>, siblingSum:<u64 decimal>}]}` — the contract `staking --path-from` will consume. `prepare-stake-proof` additionally emits `isNewStaker`/`rootHash`/`rootSum` for audit.
- `build`→`proof`→`verify` round-trip verified; byte-exact root pinned in tests against real Solana program addresses.
- `--json`/`--quiet`/human output modes honored on all commands.
- `accumulator-format.ts` lives in `src/lib/` (new, additive, name-scoped — does not modify any locked base-infra file) because oclif scans `src/commands/**` and treats any helper there as a phantom command with a stderr warning.

### Files

- `apps/cli/src/commands/accumulator/{build,proof,empty-root,verify,prepare-stake-proof}.ts`
- `apps/cli/src/lib/accumulator-format.ts` (pure ser/des: hex, base58 via Kit codec, proof/leaf ser, json-file readers)
- `apps/cli/test/commands/accumulator/accumulator.test.ts` (help smoke ×5 + build byte-exact + empty-root + proof schema + verify ok/prefix/tamper + prepare-stake-proof rpc-error path)
- `apps/cli/README.md` — `accumulator:*` section + proof-file schema doc added under "Commands implemented".

### Verification

`pnpm --filter @useaccord/cli run lint && build && test` → green (31 pass, 0 fail). No Surfpool needed for this epic; `prepare-stake-proof` e2e is deferred to the staking/dispute epic (it needs a Subaccord + JurorStakes on-chain).

### Coordination note for `staking` epic

`staking --path-from <file>` should read the proof file via `fileToProof()` (or the same schema). The index in the file is authoritative. `prepareStake-proof` writes exactly this format.
