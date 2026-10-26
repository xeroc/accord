---
# accord-9952
title: Accord — re-anchor round windows at the last state change (ADR-0038)
status: completed
type: task
created_at: 2026-10-26T00:00:00Z
updated_at: 2026-10-26T21:30:00Z
---

## Why (user-reported, devnet)

Inveigo arena court `5dcn9NbJqCx3j7hZ6ZmWQ8zieb2EDVbpaSUjaC1PSXN1` (review=1s,
commit=43,200s, reveal=43,200s, appeal=30s, N=1 AI juror): the juror
commits+reveals within seconds, but the dispute cannot go `Final` for ~24h.
Finality = `reveal_end + appeal_window`, and `reveal_end` was fixed at draw as
`draw_time + review + commit + reveal`. The existing early relaxations (reveal
opens on all-committed, round resolves on all-revealed) only relax LOWER
bounds — nothing pulled `reveal_end` earlier. Fix: re-anchor the window
deadlines at the last state change — shrink-only, zero account-layout change.

## Design

- `commit` (panel-full): `reveal_end = min(reveal_end, now + reveal_window)` —
  pure shrink by construction (`now < commit_end` and
  `commit_end + reveal_window == reveal_end` at the draw-time anchor).
- `finalize_round` (early resolve, all revealed, `now < reveal_end`): pin
  `reveal_end = now`. Timeout path deliberately does NOT rewrite (a lazy
  cranker must never push the appeal deadline out).
- One field, three consumers (`appeal`, `finalize_dispute`, `cancel_dispute`)
  re-anchor automatically. Invariant: deadlines only ever move EARLIER.
- No account-layout / IDL / SDK-signature change (no codegen); Arbitrable CPI
  consumers benefit automatically. `review_end` stays; `commit_end` stays
  deliberately stale at panel-full; `draw_seat`/`redraw` anchoring unchanged.

## Summary of Changes

- `programs/accord/src/instructions/commit.rs`: panel-full commit re-anchors
  `reveal_end` shrink-only to `now + reveal_window` (checked arithmetic,
  `ArithmeticOverflow`).
- `programs/accord/src/instructions/finalize_round.rs`: early resolve pins
  `reveal_end = now` (shrink-only guard `now < reveal_end`; timeout path is a
  no-op write).
- `programs/accord/src/state.rs` / `reveal.rs` / `draw_seat.rs`: doc comments
  updated to the re-anchoring reality (docs-match-reality).
- `programs/accord/tests/reanchor_litesvm.rs` (NEW, TDD RED→GREEN): 5 tests —
  panel-full re-anchor (+partial-commit no-op), reveal closes at the
  re-anchored end, early-resolve re-anchors appeal+finality (appeal accepted
  inside / rejected past `resolve_ts + appeal_window`; `finalize_dispute`
  eligible exactly at `resolve_ts + appeal_window`), late finalize never
  extends, re-anchored round + redraw still zeroes + re-anchors cleanly.
- `programs/accord/tests/accumulator_litesvm.rs`: `commit_reveal_votes`
  reveals immediately on full-commit (the commit_end warp overshoots the
  re-anchored end); `scalar_vote_panel` likewise; `finalize_round_for` lands
  exactly ON `reveal_end` (equality gate) so the locally-1s appeal window
  stays usable — these harness fixes also repair 12 suite failures that the
  earlier `MIN_APPEAL_WINDOW_SECS=1` local hack (f870724e) had left broken.
- `tests/src/draw-harness.ts`: new shared `warpToRevealWindow` — fresh round
  read + lands at `min(commit_end, reveal_end − panel − 3)` (re-anchored
  branch reserves ~1s per reveal tx; Surfnet clock advances ~1s/tx).
- `tests/src/*.spec.ts` (appeal, canon.challenge, full-lifecycle, jurat,
  quorum-redraw ×6, scalar, synod.full-lifecycle, voting): reveal warps
  migrated to `warpToRevealWindow` (appeal.spec uses a local copy).
- `tests/src/voting.spec.ts`: NEW e2e "ADR-0038: eager panel reaches Final at
  resolve_ts + appeal_window" — green against Surfpool.
- `apps/jurat/src/duty/tracker.ts` + `tracker.test.ts`: header documents the
  live-field requirement (`reveal_end` mutates shrink-only); new test pins
  `dutyPhase` final-on-re-anchored-`revealEnd`.
- ADR-0038 (new) + `apps/docs/adr/accord/index.md` (table + footer bump),
  MkDocs `reference/state-machine.md`, `reference/accounts.md`,
  `integration/draw-voting.md`, `integration/appeals.md`,
  `programs/accord/SPEC.md`, `CONTEXT.md`.
- `.changeset/loud-rays-reanchor.md` (patch, fixed group).
- Drive-by: `apps/cli/src/commands/dispute/cancel.ts` one-blank-line prettier
  fix — pre-existing lint failure on HEAD blocking the workspace lint gate.

## Verification

- `cargo test --features accord/no-entrypoint`: reanchor 5/5, accumulator
  85/85, everything green except the pre-existing
  `gated_stake_rejects_soon_expiring_attestation` (fails identically on the
  pristine baseline — attestation-expiry-vs-SVM-clock, unrelated).
- Surfpool e2e (fresh Surfnet, runbook deploy): 25/27 suites, 117 tests
  green incl. the new eager-panel spec; the 2 failing suites
  (`attestation.spec`, `lifecycle.pause.timelock.spec`) fail identically
  against the pre-change binary (verified via git stash + redeploy) —
  pre-existing, unrelated.
- `pnpm run -r --filter "./packages/*" --filter "./apps/*" build` + `lint`
  green; `cargo fmt` clean; `make verify-sbf` OK (sBPFv3 flags 0x3).
