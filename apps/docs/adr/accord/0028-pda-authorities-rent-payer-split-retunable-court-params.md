# 0028 — PDA update authorities: rent-payer split + retunable court params

Date: 2026-08-22 · Status: proposed · Amends: [0005](0005-subaccord-authority-pubkey-timelock.md)

## Context

ADR-0005 gave every Subaccord a single `authority: Pubkey` that mutates pool params via the timelocked propose/execute pair. Two gaps surfaced while designing Canon's per-list court parameters (canon/0002):

1. **PDA authorities cannot pay rent.** The natural Accord consumer pins a *program-owned PDA* (e.g. Canon's `CanonList`) as the Subaccord authority so retuning is gated by the Arbitrable's own instruction. But `propose_subaccord_update` made the authority the `payer` of the `PendingUpdate` init — and the system program rejects lamport transfers from data-carrying accounts, so a data-account PDA authority can never CPI the instruction. The bug already had a fix shape: `create_dispute` split `filer` (may be a PDA) from `rent_payer` (must be data-free) for exactly this reason.

2. **Canon needs to retune `reveal_threshold_bps` and `max_draw_attempts`.** ADR-0021 froze sensible creation defaults, but quorum sensitivity and redraw tolerance are exactly the knobs a young court wants to tune as dispute volume proves out. They were absent from `UpdatePayload`.

## Decision

- **`propose_subaccord_update` gains a required `rent_payer: Signer`** mirroring `create_dispute`: the authority still signs (PDA authorities sign via `invoke_signed`), a separate data-free account pays the `PendingUpdate` rent. Wallet authorities pass themselves; Arbitrables pass their crank caller. Breaking IDL change; all in-tree callers migrated in the same change.
- **`UpdatePayload` grows `RevealThresholdBps(u16)` and `MaxDrawAttempts(u8)`, appended at the END of the enum.** Borsh encodes the variant index, so mid-list insertion would re-index every in-flight `PendingUpdate` — the enum is append-only from here on (pinned in a comment on the type).
- Validation mirrors `create_subaccord` gate parity (H-1 / §29.3, validate in every write path):
  - `RevealThresholdBps ≤ 10_000`; additionally — cross-field, in `validate_update_cross_field` — `> 0` when the live pool's `aggregation == Median` (SR2-M-1: a zero threshold lets a Median pool finalize zero-reveal rounds by fabricating `result = 0`; Plurality stays safe at 0 via ADR-0026 tie → redraw). `aggregation` is immutable, so the live value is authoritative at both propose and execute.
  - `1 ≤ MaxDrawAttempts ≤ MAX_DRAW_ATTEMPTS` (10).
- In-flight disputes are unaffected: they consume their frozen `CaseTerms` copy, so a retune only shapes future rounds.

## Considered Options

- **Authority-only payer (status quo):** simple, but the PDA-authority CPI path is dead on arrival — the whole reason Arbitrables exist.
- **Writable-authority rent exemption / pre-funded PDA:** the system program's transfer restriction is on data accounts regardless of balance; no amount of pre-funding fixes it.
- **Add `shortfall_policy` too:** no consumer needs it (v1 has a sole variant); skipped. Append it when a second policy ships.

## Consequences

- The SDK adapter pins `rentPayer` to its wallet signer (wallet flow unchanged: the loaded wallet is both authority and rent payer); Arbitrables building the CPI in Rust pass their crank caller.
- `PendingUpdate` layout is unchanged — the largest `UpdatePayload` variant remains `Authority(Pubkey)`, so `INIT_SPACE` is stable and no reallocation concerns arise.
- LiteSVM coverage pins the split: `programs/accord/tests/update_litesvm.rs` proves `rent_payer != authority` succeeds, the authority's balance only drops by fees, and both new variants validate + apply.
