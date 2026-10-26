---
"@useaccord/app": patch
"@useaccord/canon": patch
"@useaccord/canon-app": patch
"@useaccord/cli": patch
"@useaccord/cranker": patch
"@useaccord/evidence-daemon": patch
"@useaccord/hanse": patch
"@useaccord/jurat": patch
"@useaccord/landing": patch
"@useaccord/pitch": patch
"@useaccord/remotion": patch
"@useaccord/sdk": patch
"@useaccord/synod": patch
"@useaccord/synod-app": patch
"@useaccord/tests": patch
"@useaccord/ui": patch
---

Re-anchor round windows at the last state change (ADR-0038, bean accord-9952)

- `commit` (panel-full) re-anchors `Round.reveal_end` shrink-only to
  `now + reveal_window` — revealers get the full reveal window from the LAST
  commitment, not from the scheduled `commit_end`.
- `finalize_round` (early resolve, all revealed) pins `reveal_end = now` —
  the appeal window opens at resolution. The timeout path never extends it.
- Every deadline consumer (`appeal`, `finalize_dispute`, `cancel_dispute`)
  anchors at the re-anchored `reveal_end`, so an eager panel reaches `Final`
  at `resolve_ts + appeal_window` instead of idling out the scheduled
  commit+reveal span (devnet repro: Inveigo arena court, 1s/12h/12h/30s,
  ~24h → ~40s). No account-layout, IDL, or SDK-signature change.
- e2e harness: new shared `warpToRevealWindow` (draw-harness + appeal.spec
  local) replaces the `warpTo(commitEnd)` reveal warps; jurat duty tracker
  header documents the live-field requirement + a phase test pins it.
