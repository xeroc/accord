---
# accord-34zj
title: synod.qedspec + security-checklist seed
status: completed
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T13:05:00Z
parent: accord-l2ad
blocked_by:
    - accord-arch
---

assigned: implementer
AGENTS.md Beans #4: program gains instructions ⇒ update the program .qedspec. Create programs/synod/synod.qedspec (guarantees: roster gates, vault invariants, idempotent payouts, single-dispute binding) + regenerate formal-verification dir per canon/accord precedent. Seed programs/synod/security-checklist.md (trust notes: party==juror accepted risk, passive appeals, daemon grouping out of scope).

## Summary of Changes

- `programs/synod/synod.qedspec`: focused v1 spec (accord `accord.qedspec` shape — flat State, slot-parameterized handlers, `preserved_by` binary properties) covering the four guarantee families: `joined_cnt_bounded` (+ exact `join_vault_exact`), vault conservation per payout family (`refund_vault_exact`, `winner_vault_exact`, `failed_vault_exact`), `paid_bits_monotonic` (idempotency), `dispute_immutable_once_bound` + `state_gates_filed` (single-dispute binding / state check-and-set). Handlers model open/join/file + per-party payout slots (`refund_slot`, `claim_winner`, `claim_share`/`claim_share_last` split for the DSL's no-conditional effects, `claim_failed`, `close_case`). Checked `-=` (faithful: on-chain `token::transfer` reverts, no floor semantics) + explicit counter bounds.
- `.qed/` metadata via `qedgen init` (v2.47) — config.json + plan/, accord-committed surface; the init-created `formal_verification/` Lean project was dropped (accord precedent commits no such dir; it was generated from a stale spec draft anyway).
- `qedgen check`: **0 errors**, 1 warning, 3 infos. The warning is the documented-accepted `old()`-over-Map quantifier lowering (`paid_bits_monotonic` → `true` placeholder harness) — identical accepted state to accord's `distinct_panel`, documented in the spec header; the on-chain paid-bit `requires` is the runtime guarantee. Fixes applied along the way: per-param handler parens, no conditional effects, MathOverflow/MathUnderflow Error variants (codegen contract), dropped a tautology-lowered counter property.
- `programs/synod/security-checklist.md` seeded: risk 🟠 High (escrow, no admin keys), trust-model table (party==juror accepted, passive appeals by design, daemon grouping out of scope/accord-ybuq, fee-on-transfer gated, dust accepted + swept by last neutral claimant), as-built instruction gate map, the four payout-safety invariants, explicit SEED status + pending audit list (31-section sweep, qedgen stamp, CU profiling, e2e green run).

### Verification

- `qedgen check --spec synod.qedspec`: 0 error(s), 1 documented-accepted warning, 3 info.
- No code paths touched — `cargo test -p synod --features no-entrypoint` still 32/32 green (spot re-run).
