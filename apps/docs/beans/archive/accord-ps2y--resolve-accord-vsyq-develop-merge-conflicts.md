---
# accord-ps2y
title: Resolve accord-vsyq → develop merge conflicts
status: completed
type: task
priority: normal
created_at: 2026-08-07T23:58:21Z
updated_at: 2026-08-08T00:11:24Z
---

Mechanical merge-resolution of the accord-vsyq epic (two-mint/two-vault ADR-0020 + reveal-quorum/shortfall-redraw ADR-0021) into develop (per-Subaccord appeal window ADR-0022). 7 conflicted files, all orthogonal-feature unions except the Program-ID gotcha (committed keypair vs gitignored). Resolve, verify lint/typecheck, commit, stop.

## Summary of Changes

Resolved all 7 conflicts from the accord-vsyq (ADR-0020 two-mint/two-vault + ADR-0021 reveal-quorum/shortfall-redraw) → develop (ADR-0022 per-Subaccord appeal window) merge as **orthogonal-feature unions**, verified against the merged Rust source of truth (`state.rs`/`errors.rs`):

- **CONTEXT.md**: Appeal = union (HEAD's per-Subaccord appeal-window sentence + vsyq's `fee_token` bond note).
- **SPEC.md**: account table + state machine unioned from `state.rs` (Subaccord.appeal_window + fee_token/reveal fields; Dispute.terms + fee_paid; two vaults; redraw branch + appeal-window annotation).
- **AGENTS.md**: Authority ADR list + v1-defaults table unioned; Gotchas Program-ID entry **reconciled to merged reality** (epic force-committed the canonical deploy keypair, overriding HEAD's 'gitignored' claim) — kept the `--ignore-keys`-mandatory caution + flagged the committed-keypair security note.
- **subacc.oft.ts / errors/accord.ts** (generated): hand-resolved (size 338; error codes 6051-6055) then **authoritatively confirmed** via `make codegen` (anchor build + codama) — codama output matched the hand-resolution exactly.
- **lifecycle.ts / fixtures.ts**: unioned imports + validators (appeal-window + reveal/threshold/draw-attempts).

Verification: SDK `tsc --noEmit` green (pre + post-regen); `anchor build` succeeds on merged Rust; codama regenerated generated/* from the merged IDL (caseTerms.ts regen staged). Commit `cad714c`.

Note: 3 untracked root design sketches (PROG-ATTESTATION/CURATION/ESCROW.md) were left out of the merge commit as unrelated to either branch.
