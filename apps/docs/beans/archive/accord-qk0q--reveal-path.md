---
# accord-qk0q
title: Reveal path
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T14:00:00Z
parent: accord-ji4v
---

src/vote/reveal.ts: at reveal-window open, SDK reveal with persisted salt+vote; DRY_RUN gate. AC: unit tests; salt-loss → alert+abstain (never guess).

## Summary of Changes

- `apps/jurat/src/vote/reveal.ts`:
  - `revealVote(deps, plan, dryRun)` — builds the SDK `reveal` instruction
    from the EXACT persisted preimage (`VoteRecord.salt`/`.vote` from
    commit.ts's store) and sends it at window open. The client-side gate
    mirrors reveal.rs: `(now >= commit_end || all_committed) && now <
    reveal_end` — early open included (`RevealPlan.allCommitted`).
  - DRY_RUN: instruction built + logged + notified, no tx, `revealedAt`
    never stamped. Real path stamps `revealedAt` (new optional
    `VoteRecord` field — additive, commit path untouched) after the send.
  - Idempotent: a `revealedAt` record short-circuits
    (`alreadyRevealed`, no build, no send — chain rejects
    `AlreadyRevealed` anyway).
  - Salt loss → alert + `SaltLostError`, never a guess: missing record,
    uncommitted record, corrupted salt hex (≠ 32 bytes), or non-decimal
    vote all fire the notify alert and throw; the pipeline abstains with
    kind `salt-lost`. There is no salt-generation code in this module —
    structurally nothing to guess with (the chain recomputes the hash and
    any wrong preimage is a guaranteed RevealMismatch).
- `apps/jurat/src/vote/reveal.test.ts` — 8 node:test cases: real path
  (exact persisted salt+vote reach `buildReveal`, signature returned,
  `revealedAt` stamped), dry-run (no tx, not marked revealed),
  already-revealed no-op, window-edge table (1999/2000/2999/3000/3500 ×
  allCommitted early-open), salt-loss matrix (missing record, uncommitted,
  bad salt ×2, bad vote) with one alert each and nothing sent.
- Verified: `pnpm --filter @useaccord/jurat test` 52/52 green; `pnpm -r
  run build` + `pnpm -r run lint` green workspace-wide.
