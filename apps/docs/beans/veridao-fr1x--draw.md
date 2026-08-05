---
# veridao-fr1x
title: Draw
status: completed
type: epic
priority: normal
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-04T04:45:00Z
parent: veridao-rlno
blocked_by:
  - veridao-rrxs
---

Select N distinct Jurors from the finalized Snapshot, weighted by stake, via VRF.

## Tasks

- [x] draw(dispute, vrf_result, juror_memberships[]) — consume VRF; N distinct via cumulative-stake lookup; verify Merkle membership+weight; active_draws += 1 per juror; record drawn jurors

## Acceptance (TDD)

VRF consumption correctness; distinctness (no duplicate juror); Merkle proof verify (valid/invalid cases); active_draws increment; manipulation-resistance (VRF not predictable). Highest-risk instruction — deepest security review.

## Summary of Changes

### Instruction: `draw(dispute, vrf_result, memberships[])`

Permissionless crank. Verifies the snapshot is Finalized, each `JurorMembership`'s
Merkle proof against the root, stake ≥ `min_stake` (the precise eligibility gate),
all jurors distinct (O(N²) pairwise, N ≤ 31), and the panel size matches the round.
VRF consumed deterministically: `vrf_seed = hash(vrf_result ‖ dispute ‖ round_idx)`,
emitted in `JurorsDrawn` for off-chain audit. Each drawn juror's `active_draws`
incremented via direct field patch (BPF-safe — avoids full re-serialize). Dispute
transitions `SnapshotPosted → Drawn`. Round PDA `init`'d with drawn jurors.

### Trust model (ADR-0003)

The stake-weighted cumulative lookup is computed off-chain; the on-chain program
verifies membership proofs against the finalized root. The trust anchor is the
1-day snapshot fraud-proof (duplicate-Juror detection). A future Merkle-Sum-Tree
upgrade (flagged for hardening veridao-nhbj) would close the gap of verifying the
weighted selection itself on-chain.

### State changes

- `Round` converted to `#[zero_copy]` + `AccountLoader` — the struct is too large
  (~2100 bytes) for BPF's 4096-byte stack under `Account<Round>`. Fields reordered
  - explicit padding for `Pod` compliance. `Option<u8>` → `u8` with `u8::MAX`
    sentinel (`Pod` doesn't allow `Option`).
- `JurorMembership` struct added to `state.rs`.
- `InvalidPanelSize` error variant added.
- `JurorsDrawn` event gains `vrf_seed` field.
- `panel_size_for_round` helper: `(J+1)·2^k − 1`, capped at `MAX_JURORS`.

### Tests (9 LiteSVM, all green)

happy draw + active_draws++; snapshot-not-finalized revert; tampered Merkle proof
revert; duplicate juror revert; wrong panel size revert; insufficient stake revert;
wrong juror_stake PDA order revert; VRF seed determinism; double-draw revert.

### Files

- `programs/accord/src/lib.rs` — `draw` instruction + handler + `Draw` accounts + `panel_size_for_round`
- `programs/accord/src/state.rs` — `JurorMembership`, `Round` → `#[zero_copy]`
- `programs/accord/src/errors.rs` — `InvalidPanelSize`
- `programs/accord/src/events.rs` — `JurorsDrawn.vrf_seed`
- `programs/accord/Cargo.toml` — `bytemuck` dep for `#[zero_copy]`
- `programs/accord/tests/draw_litesvm.rs` — 9 tests
- `programs/accord/tests/state.rs` — updated for `Round` field changes
