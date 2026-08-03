---
# veridao-wyso
title: Foundation & Capital
status: todo
type: epic
priority: high
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-03T23:09:55Z
parent: veridao-rlno
---

Plumbing: project scaffold, all state definitions, the testing harness, and the Subaccord-management + staking instructions. Everything downstream depends on this.

## Tasks (create as we start each; TDD)

- [ ] Decide testing harness (LiteSVM unit vs jest/Surfpool) — safe-solana-builder Step 1b
- [ ] State: account structs (Subaccord, JurorStake, Dispute, Round, Snapshot, PendingUpdate), error enum, events, constants (MAX options, MAX_JURORS=31)
- [ ] create_subaccord(params, authority, evidence_operator) — permissionless; risk_type+evidence_spec immutable
- [ ] propose/execute_subaccord_update — authority-gated (Pubkey::default = immutable), 48h on-chain timelock
- [ ] pause/unpause — multisig circuit-breaker (ADR-0007)
- [ ] stake(amount) — SPL transfer into Subaccord vault; init/update JurorStake
- [ ] unstake(amount) — blocked while active_draws > 0

## Acceptance (per task, TDD)

Failing test -> implement -> green. Security: signer checks, canonical bumps stored/reused, no unwrap/expect on user paths, Box<> large accounts (BPF stack frame), SPL token-account ownership checks.
