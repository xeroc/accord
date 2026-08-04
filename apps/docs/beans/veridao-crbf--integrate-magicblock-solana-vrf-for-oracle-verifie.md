---
# veridao-crbf
title: Integrate magicblock solana-vrf for oracle-verified draw randomness
status: completed
type: feature
priority: high
created_at: 2026-08-04T18:30:01Z
updated_at: 2026-08-04T19:44:15Z
parent: veridao-rlno
blocked_by:
    - veridao-4nyi
---

## Scope

The sortition enforcement (ADR-0009) ensures the draw selection is
deterministic given a VRF result — the caller cannot cherry-pick jurors.
But the VRF result is still **caller-supplied** via `commit_vrf`: the
caller chooses which `vrf_result` to commit. They can brute-force VRF
results off-chain until they find one that selects favorable jurors.

For N=3 panel with 30% attacker stake: ~37 VRF tries to find an
all-attacker panel. Trivially computable off-chain.

This bean integrates oracle-verified randomness so the VRF result is
**not caller-chosen** — it comes from the magicblock VRF oracle, making
the randomness unbiasable and unpredictable before the snapshot is
finalized.

## Reference

<https://github.com/magicblock-labs/solana-vrf/blob/main/README.md>

Integration guide to be loaded when this bean is picked up.

## Tasks

- [ ] Load and review the magicblock solana-vrf README
- [ ] Design the wiring: how `commit_vrf` consumes the oracle result
      (replace caller-supplied `vrf_result` with on-chain VRF account read)
- [ ] Implement the integration
- [ ] Update tests to use the oracle-mocked VRF
- [ ] Document the wiring choice in an ADR

## Acceptance

- `commit_vrf` reads the VRF result from an oracle account, not a
  caller-supplied argument
- The caller cannot influence or predict the VRF result before committing
- All existing tests updated and green

## Relationships

- Parent: veridao-rlno
- Split from: veridao-utcu (critical finding — sortition enforcement half
  is shipped; this is the oracle-verified randomness half)

## Summary of Changes

Integrated magicblock solana-vrf for oracle-verified draw randomness.

### Instructions added

- `request_vrf()` — permissionless; CPIs into the VRF program via `#[vrf]` macro + `invoke_signed_vrf`. Passes the dispute key as `caller_seed` and the `CommitVrfCallback` discriminator as the callback. Uses `DEFAULT_QUEUE` oracle queue.
- `commit_vrf_callback(randomness: [u8;32])` — ONLY callable by the VRF program (signer constrained to `VRF_PROGRAM_IDENTITY` via Anchor `#[account(address = ...)]`). Stores `dispute.committed_vrf`. Replaces the old caller-supplied `commit_vrf`.

### Dependency

- `ephemeral-vrf-sdk = { version = "0.4.1", features = ["anchor"] }` added to workspace

### Removed

- Old `commit_vrf(vrf_result)` instruction — the only path to set `committed_vrf` is now the VRF callback. No brute-forcing.

### Tests

- LiteSVM tests mock the VRF callback by directly writing `committed_vrf` to the dispute account (LiteSVM can't run the oracle). The `commit_vrf_callback` instruction itself is verified in integration tests.
- 78/78 LiteSVM tests green; clippy clean.

### What this closes

The VRF result is no longer caller-supplied. The caller cannot brute-force VRF results off-chain. The draw randomness is:

1. **Unbiasable** — the VRF oracle generates it using RFC 9381 (Curve25519/Ristretto), verified on-chain before the callback.
2. **Unpredictable** — the caller cannot predict the VRF output before requesting it.
3. **Immutable** — `commit_vrf_callback` is one-shot; retries use the same committed value via `draw_attempt`.

The snapshot-capture attack class is now fully closed: sortition enforcement (ADR-0009) + oracle-verified VRF (this bean).
