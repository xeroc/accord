---
# veridao-rrxs
title: Dispute Intake & Snapshot Trust
status: completed
type: epic
priority: normal
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-04T00:00:00Z
parent: veridao-rlno
blocked_by:
  - veridao-wyso
---

Filing a Dispute and establishing the trusted Juror-set Snapshot the Draw reads.

## Tasks

- [x] create_dispute(subaccord, options, evidence_hash, fee) — [Arbitrable CPI]; filer pays full fee; revert if active distinct stakers < required N
- [x] post_snapshot(dispute, merkle_root) — off-chain indexer; bond 1x max-appeal-fee
- [x] challenge_snapshot(dispute, fraud_proof) — 1-day window; challenger bonds equal; wrong root -> poster bond to challenger; false challenge -> challenger bond to poster

## Acceptance (TDD)

CPI interface correctness; bond custody + sweepable authority; challenge-window time-gate (before/after deadline via Clock); insufficient-jurors revert.

## Summary of Changes

Shipped the Arbitrable CPI entry + the full ADR-0003 snapshot trust lifecycle. TDD
via LiteSVM: 11 new tests (5 `create_dispute` + 6 snapshot), all green; full suite
47/47 green; `.so` builds; clippy clean (only pre-existing Anchor cfg warnings).

### Instructions added (`programs/accord/src/lib.rs`)

- **`create_dispute(options, evidence_hash, nonce, fee)`** — Arbitrable CPI entry.
  Filer is a `Signer` (a program via CPI or any wallet). Validates 2..=MAX_OPTIONS,
  requires `fee == jurors_per_dispute · fee_per_juror` (FeeMismatch, defense-in-depth),
  enforces the coarse `staker_count >= jurors_per_dispute` intake gate (InsufficientJurors),
  reverts while paused, and custodies the fee filer-ATA → Subaccord PDA vault.
  Dispute PDA `["dispute", filer, nonce]`, state `Created`.
- **`post_snapshot(merkle_root)`** — permissionless + bonded indexer post. Bond =
  `max_appeal_panel_size(jurors_per_dispute, max_appeals) · fee_per_juror` (the
  `(J+1)·2^max_appeals − 1` ladder, capped at MAX_JURORS=31). Arms a 1-day
  `challenge_deadline`; transitions dispute `Created → SnapshotPosted`.
- **`challenge_snapshot(proof)`** — 1-day window time-gate (`now ≤ deadline`).
  Challenger posts an equal bond, then on-chain verdict: a valid **duplicate-Juror**
  Merkle fraud proof (two leaves, same juror, both verifying against the root) voids
  the snapshot + sweeps `2·bond` to the challenger; anything else is a false challenge
  that sweeps the challenger's bond to the poster (snapshot stays Posted). All sweeps
  are Subaccord-PDA-signed out of the vault → the program is the sole sweep authority.
- **`finalize_snapshot`** — permissionless crank (added: completes the lifecycle the
  bean's 3 instructions imply). After the window passes unchallenged, returns the
  poster's bond and marks the snapshot `Finalized` for the draw bean to consume.

### Supporting changes

- `state.rs`: `Subaccord.staker_count: u32` (O(1) distinct-staker counter maintained
  by `stake`/`unstake` — 0→positive increments, positive→0 decrements); `LeafClaim` +
  `FraudProof` instruction-arg types.
- `errors.rs`: `FeeMismatch`.
- `lib.rs`: `max_appeal_panel_size` + SHA-256 `verify_merkle_inclusion` helpers; `Box`-wrapped
  large accounts (`Dispute`/`Snapshot`/`Subaccord`) in the new contexts to fit the BPF stack.

### High-Risk Decisions / known v1 limitations (deferred → draft bean)

- **No admin key / upgrade risk**: bond custody is fully PDA-gated; no authority can
  seize bonds. Sweeps are deterministic by outcome.
- **Irreversible**: a voided snapshot cannot be re-posted (`init` is one-shot), so a
  successfully-challenged dispute stalls (filer fee locked). Recovery path deferred.
- **Fraud proof scope**: only duplicate-Juror fraud is on-chain verifiable today
  (time-independent). Wrong-stake / missing-juror fraud needs off-chain data anchoring
  and is left to the hardening bean.
- **`staker_count` is coarse**: counts any stake > 0, not `≥ min_stake` (which mutates
  via the 48h timelock and can't be recomputed without the O(n) ledger ADR-0003 rejected).
  Precise eligibility is verified at `draw` against the finalized snapshot.
