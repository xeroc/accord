# 0032 — remaining_accounts use full Anchor deserialization (drop the manual layout offsets)

Status: Accepted (2026-09-24)

## Decision

Accounts passed via `remaining_accounts` are now fully Anchor-deserialized:
discriminator-checked `try_deserialize` → mutate **named fields** →
`try_serialize` back, via `utils::read_account` / `utils::mutate_account`.
The manual byte-offset constants (`constants::layout`), the targeted field
writes, and the offset-pinning tests (`layout_tests::offsets_match_borsh`)
are removed — from Accord **and** from Synod (`SC_*` offsets + its host
layout test).

Affected surfaces: `JurorStake` in `draw_seat` / `redraw` / `settle_round_accounts`
/ `release_prior_rounds` / `cancel_dispute` / the free-list neighbor
maintenance in `stake` / `reclaim_slot`; `AppealBond` in `finalize_dispute` /
`credit_bond_bounty_units`.

## Considered Options

1. **Status quo — CU-opt targeted field writes.** Cheapest in compute
   (CU ∝ field width, not account size), at the cost of a hand-maintained
   Borsh offset table duplicated through every hot path, an offset-pinning
   test per crate, and reads auditors must check against a byte layout
   instead of a struct.
2. **Full Anchor (de)serialization (chosen).** CU ∝ account size per touched
   account (~hundreds of CU extra per seat in `draw_seat`/settlement loops —
   comfortably inside the 1.4M cap; the L-5 retry bound already assumes
   full-budget reasoning). In exchange: no layout-coupled constants, a free
   discriminator check on every raw account, and field access auditors can
   diff against `state.rs` directly. Maintainability + auditability over
   compute — an explicit product decision (2026-09-24).
3. **`Account<T>::try_from(&AccountInfo)`.** Same deserialize/serialize cost,
   but the write-back hides in `Drop` — implicit control flow is exactly what
   this decision is trying to remove. Rejected.

## Consequences

- `constants::layout` and `synod::constants::layout` are deleted; field
  additions/reorders no longer require touching (or drifting) an offset table.
- Malformed `remaining_accounts` entries now fail at `try_deserialize` with
  Anchor's discriminator error; the former `data.len() >= OFF + W` length
  tolerances are gone (strictly stronger validation).
- The M-2 discipline (PDA re-derivation + `owner == &crate::ID` at every
  site) is unchanged; deserialization adds the discriminator check on top.
- Error-code nuance: a few fabricated-malformed-account paths that previously
  surfaced ad-hoc errors (`InvalidMembershipProof` length checks) now surface
  the Anchor discriminator error instead. No legitimate-flow error changes.
- `sas_layout` (attestation.rs) is deliberately untouched: it parses a
  **foreign** program's account (SAS attestation), for which no Anchor types
  exist in this crate. It keeps its own offset pin + `data_len`-varying tests.
- The TS e2e harness is unaffected — it reads accounts through the SDK
  codecs, never through these constants.
- Supersedes the layout-offset consequences noted in ADR-0020 / ADR-0022 /
  ADR-0023 / ADR-0024 and beans accord-8k60 / accord-82yf (historical records
  remain intact per the ADR-immutability convention).
