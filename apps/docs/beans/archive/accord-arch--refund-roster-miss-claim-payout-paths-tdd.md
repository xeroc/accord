---
# accord-arch
title: refund_roster_miss + claim payout paths (TDD)
status: completed
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T12:30:00Z
parent: accord-l2ad
blocked_by:
    - accord-nf9j
---

assigned: implementer
refund_roster_miss: deadline passed + roster incomplete → per-joined-party S refunds via paid_out bits (permissionless crank, idempotent, close when all joined bits paid). claim: reads bound dispute state — Final: winner pot N*S−fee, one-shot; neutral: S−fee/N floor each, remainder to last claimant; Failed: full S each (fee already returned by accord cancel_dispute). Tests: every HANDOFF §6 matrix row for refund/claim/neutral/failed, idempotency replays, invariant vault ≥ outstanding claims, missing-ATA party never blocks others. Pull-only payouts.

## Summary of Changes

TDD: RED (RefundRosterMiss/Claim missing — compile failure) → GREEN → refactor (gate reorder, clippy-clean). 10 payout LiteSVM tests green.

- `src/instructions/refund_roster_miss.rs`: state Opening + `now >= join_deadline` + roster-incomplete gates, then per-party pull — the destination token account's OWNER identifies the party (mint checked against `subaccord.fee_token`; an `associated_token` constraint can't express a dynamic 7-slot authority). `S` back via case-PDA-signed `token::transfer`; `paid_out` bit set; case `Closed` when every joined bit is paid.
- `src/instructions/claim.rs`: dispute gate `Final`/`Failed` only (else `DisputeNotFinal` — ties redraw at Accord, Synod never handles them). `Final r < N`: winner pulls `N·S − fee`, one-shot, case closes on that payout, non-winner pull no-ops. `Final r == N` (neutral): each pulls `⌊(N·S − fee)/N⌋`, the LAST claimant drains the vault remainder exactly. `Failed`: each pulls `S` (fee already returned by `cancel_dispute`).
- **Pull-only + missing-ATA isolation:** one party per call (destination ATA identifies the payee) — a missing party ATA structurally cannot block another party's payout. **Idempotency:** the paid-bit no-op runs BEFORE the state gate, so a paid party's replay no-ops even on a `Closed` case.
- Bug caught by tests: last-claimant remainder initially subtracted `paid_before·share` from the live vault (double-count — earlier shares were already deducted); fixed to drain `vault.amount` directly.
- Errors: + `DisputeNotFinal`, `InvalidRuling`, `CaseNotLive`, `RosterComplete`, `PartyNotJoined`, `WrongMint` (canon-parity names where they exist).
- SPEC rows 4-5 updated as built (signatures `refund_roster_miss(case, opener, nonce)` / `claim(case, dispute, opener, nonce)` — same opener+nonce seed re-derivation as `file_dispute`; per-party pull semantics).
- Tests (`tests/payout_litesvm.rs`): fabricated accord-owned `Dispute` (state + ruling) + real open/join flows; refund happy (vault drains, close, replay no-op) + 4 reverts (before deadline / full roster / not Opening / unjoined party); claim winner one-shot + replay + non-winner no-op + close; neutral split with remainder (2 parties, fee 33: 983/984, vault empties exactly); Failed full refunds; before-Final + invalid-ruling reverts. All error assertions pin the anchor code.

### Verification

- `cargo test -p synod --features no-entrypoint`: 32 tests green (4 host + 8 open_case + 5 join + 5 file_dispute[1 documented ignore] + 10 payout).
- Root `cargo test`: workspace green (0 failures).
- `anchor build --ignore-keys`: green; IDL carries both instructions.
- `cargo clippy -p synod --all-targets --features no-entrypoint`: 0 warnings; `cargo fmt --check` clean.
