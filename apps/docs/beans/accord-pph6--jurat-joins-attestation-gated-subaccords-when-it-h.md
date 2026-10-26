---
# accord-pph6
title: Jurat joins attestation-gated Subaccords when it holds the SAS credential
status: completed
type: task
priority: normal
created_at: 2026-10-26T15:20:50Z
updated_at: 2026-10-26T15:32:39Z
---

## Context

PROG-ATTESTATION (ADR-0024): Subaccords may bind `(juror_credential, juror_schema)`; staking into such a pool requires the juror's SAS attestation account as remaining_accounts[0]. Jurat's join executor currently blanket-rejects gated pools (`AttestationGated`, "v1 jurat holds none").

## Change

- `JoinChain` gains `findAttestation({credential, schema, juror})` implemented over the SDK `findSasAttestation` gpa scan (main.ts joinChain adapter).
- `joinSubaccord`: gated pool → look up the attestation; found → pass as 6th arg of the SDK `stake` facade; not found → reject `AttestationGated` (cannot join). Stake-only pools unchanged (attestation `undefined`).
- Expiry/binding validity left to the on-chain gate (lookup is by exact credential+schema+subject memcmp; a stale credential fails the send with AttestationExpired).

## TDD

- [ ] RED: executor.test.ts — gated + attestation found → joined, buildStake sees the attestation; gated + none → rejected AttestationGated, nothing sent
- [ ] GREEN: executor.ts + main.ts wiring
- [ ] full jurat test suite green, lint clean
- [x] changeset

## Scope addition (mid-task, user)

Iterations must recognize the juror's own on-chain JurorStake and never attempt to join an already-joined Subaccord:
- `reconcile` reads the juror's own JurorStake PDA per Subaccord; `staked > 0` ⇒ dropped from `joinCandidates`, reported as `heldStakes` (`staked == 0` stays joinable — re-stake regains draw weight).
- `handleJoins` heals the joined book from `heldStakes` so per-token budgets count real on-chain exposure (wiped state dir, manual stake, second instance).

## Summary of Changes

- `apps/jurat/src/join/executor.ts` — `JoinChain.findAttestation` seam; attestation lookup after on-chain idempotency (already-joined pools never pay it); reject `AttestationGated` when the juror holds no matching SAS credential; attestation threaded into the SDK `stake` facade (6th arg).
- `apps/jurat/src/chain/reconcile.ts` — `ReconcileChain.fetchJurorStake` seam; `HeldStake` in `ReconcileResult`; already-staked pools excluded from candidates.
- `apps/jurat/src/runtime.ts` — `handleJoins` heals the book from `heldStakes` before budget evaluation.
- `apps/jurat/src/main.ts` — real seams: `findJurorStakePda` + `fetchJurorStakeMaybe`; `findSasAttestation`.
- `tests/src/jurat.spec.ts` — e2e fakes carry the new seams; beforeAll asserts the post-join rescan no longer offers the pool and reports it as a held stake. GREEN against Surfpool (2 specs pass).
- `apps/jurat/SPEC.md` — chain-interface reads + two executor-level join rules documented.
- `.changeset/jurat-attested-join.md` (minor).

Verification: `bun test` 182 pass; `tsc --noEmit` clean (jurat + tests); eslint clean; e2e jurat.spec GREEN on Surfpool.
