---
"@useaccord/app": patch
"@useaccord/canon": patch
"@useaccord/canon-app": patch
"@useaccord/cli": patch
"@useaccord/cranker": patch
"@useaccord/evidence-daemon": patch
"@useaccord/hanse": patch
"@useaccord/landing": patch
"@useaccord/pitch": patch
"@useaccord/remotion": patch
"@useaccord/sdk": patch
"@useaccord/synod": patch
"@useaccord/synod-app": patch
"@useaccord/tests": patch
"@useaccord/ui": patch
---

cancel_dispute remainingAccounts: single-source derivation + AppealBond seed fixes (bean accord-br6a)

- SDK: new `deriveCancelDisputeRemainingAccounts` mirrors the on-chain strict
  accounting (current Round + panel only when seats were drawn, prior rounds +
  panels, AppealBond seeds 0..currentRound-1; EMPTY for a never-drawn stall).
- Cranker `cancel_dispute` no longer pushes the current-round PDA
  unconditionally — that made every pre-draw cancel (dead VRF oracle) revert
  with `InvalidPanelSize` (cancel_dispute.rs:261) — and now carries prior
  rounds it previously omitted entirely.
- Cranker `finalize_dispute` + reconciler `claim_refund` sweep: AppealBond
  seeds were off by one (1..currentRound); the first appellant's bond (seed 0)
  was never swept and appealed finalizes reverted.
- CLI `dispute:cancel --remaining-accounts auto` now uses the SDK derivation
  (old auto interleaved rounds/bonds in the wrong order, deduped repeat
  jurors, and pushed stake PDAs for unfilled seat sentinels).
