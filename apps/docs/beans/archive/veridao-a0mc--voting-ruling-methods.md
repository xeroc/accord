---
# veridao-a0mc
title: Voting & ruling methods
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-05T00:00:00Z
parent: veridao-gqzm
---

src/methods/voting.ts: commit (with CLIENT-SIDE hash helper sha256(vote*byte | salt[32] | juror_pubkey[32])), reveal, finalize_round, finalize_dispute. Unit-test the commit hash against known vectors. Acceptance: commit hash verifies on-chain after reveal; finalize*\* crank methods build. See ADR-0010 + test matrix row 2.

## Summary of Changes

Implemented `packages/sdk/src/methods/voting.ts` — commit-reveal voting + the two finalization cranks, plus the load-bearing client-side commit hash. Wired through the package entrypoint (`src/index.ts`).

**Commit hash (the critical crypto).** `commitHash(vote, salt, jurorBytes)` computes `sha256(vote_byte ‖ salt[32] ‖ juror_pubkey[32])` via the Web Crypto API (`globalThis.crypto.subtle` — zero-dependency, Node ≥ 18 + browsers). This is bit-for-bit compatible with the on-chain `reveal` verification (lib.rs:1109-1110, `hashv(&[&[vote], &salt, juror_key.as_ref()]).to_bytes()`). Pinned to a hardcoded known vector in the unit test (`sha256(0x01 ‖ 0x01*32 ‖ 0x02*32) = b331da6e…fcfa`), computed independently with `node:crypto` — catches any byte-order/length drift.

**Orchestration over the seam (ADR-0010).** Same pattern as `dispute.ts`: pure facade over a typed `AccordVotingClient` seam that Foundation wires to the Codama Kit client. Kit imported type-only (erased); `findRoundPda` lazy-imports Kit. No hand-rolled Borsh.

- `commit` — computes the commitment, builds the instruction, returns `{instruction, commitment}`.
- `reveal` — passes `{vote, salt}` (chain re-derives the hash).
- `finalizeRound` / `finalizeDispute` — permissionless crank instruction builders; `finalizeDispute` threads `remainingAccounts` (drawn JurorStake PDAs + AppealBond PDAs, lib.rs:1207-1214).

**Helpers:** `roundSeeds` (Round PDA `["round", dispute, round_idx.to_le_u4"]`, state.rs:2124), `findRoundPda`, `assertValidVote` (`0..numOptions`, lib.rs:1092), `assertValidSalt`, `NO_VOTE` sentinel (`u8::MAX`).

**Verification.** `make lint` green; `pnpm --filter @veridao/sdk run build` emits `dist/methods/voting.{js,d.ts}`; `pnpm --filter @veridao/sdk run test` → 12/12 (7 voting + 5 dispute) via `node --test`, including the commit-hash known-vector and preimage-sensitivity tests. All exports reachable from `@veridao/sdk` entrypoint.

**Dependency note.** As with `dispute.ts` (veridao-50qy), the module is a standalone seam by ADR-0010 design — compiles and its crypto/logic is verifiable today; the concrete `AccordVotingClient` adapter + end-to-end Surfpool integration (test-matrix row 2: commit→reveal hash verifies, vote counts) land with the foundation epic + jest suite (`veridao-7iiv`).
