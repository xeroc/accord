---
# veridao-690e
title: Canonical PDA helpers (pda.ts)
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:39Z
updated_at: 2026-08-05T00:45:00Z
parent: veridao-vxe9
blocked_by:
  - veridao-qlnn
---

Derive every Accord PDA in `src/pda.ts` using the generated client getProgramAddress helpers; seeds sourced from programs/accord/src/state.rs (Subaccord, JurorStake, Dispute, Snapshot, Round, PendingUpdate, PauseState, appeal refund PDAs). One exported fn per PDA returning {address, bump}. Acceptance: every PDA in state.rs has a helper; helper output matches an on-chain derivation smoke test. See ADR-0010.

## Summary of Changes

- **packages/sdk/src/pda.ts**: Canonical PDA module covering all 8 Accord PDAs:
  - 6 re-exported from `./generated/pdas/` (Codama-emitted): Subaccord, JurorStake,
    Dispute, PendingUpdate, AppealBond, PauseState.
  - 2 hand-written (Codama omitted them — seeds reference `dispute.key()`, a
    runtime address): `findRoundPda`, `findSnapshotPda`. Both use the same
    `getProgramDerivedAddress` + `getU32Encoder`/`getAddressEncoder` pattern as
    the generated AppealBond helper (identical seed structure:
    `[seed_bytes, dispute_address, u32_le(round_idx)]`).
  - Exports `ACCORD_PROGRAM_ID` constant for consumer convenience.
  - All functions return `ProgramDerivedAddress` = `[Address, bump]` tuple
    (the kit 7.x type, matching generated code).

- **packages/sdk/test/pda.smoke.ts**: Standalone smoke test (`npx tsx`-runnable)
  verifying all 8 PDAs: valid addresses, determinism, distinctness, and
  hand-written helpers match manual seed encoding (cross-checked against
  generated AppealBond helper too). Uses real Solana program addresses as
  test inputs (repeated-char strings are not valid 32-byte base58 addresses
  except all-1s).

### Verification

- `npx tsx test/pda.smoke.ts` — all 8 PDAs verified, 0 assertions failed.
- `make lint` — tsc --noEmit exits 0.
- `make sdk` — tsc build exits 0.
