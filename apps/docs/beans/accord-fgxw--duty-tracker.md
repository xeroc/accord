---
# accord-fgxw
title: Duty tracker
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T10:15:00Z
parent: accord-wryi
---

src/duty/tracker.ts: DutyRecord per (dispute, round, our seat) from Round.jurors; window math from Subaccord/CaseTerms (commit/reveal deadlines vs chain clock); state persistence. AC: unit tests for window edges, redraw (round_idx same, attempt+1), duplicate idempotency.

## Summary of Changes

- `apps/jurat/src/duty/tracker.ts`:
  - `trackRound(deps, round)` — upserts a `DutyRecord` for our operator key
    from a structural view of the decoded SDK `Round` (accepts its bigint
    ends via `roundWindows`). Seat detection slices `jurors` to
    `jurorCount` — dead fixed-array slots beyond it never count as drawn.
  - Window math reads `Round.review/commit/revealEnd` (CaseTerms-frozen,
    computed on-chain) rather than re-deriving from terms — accounts are
    authoritative (milestone decision 4), no second implementation to
    drift. `dutyPhase(windows, now, allCommitted)` mirrors the gates
    exactly: commit `[review_end, commit_end)`, reveal
    `[commit_end, reveal_end)` with the reveal.rs `all_committed`
    early-open relaxation, `final` from `reveal_end`.
  - Redraw (ADR-0021, same round_idx + draw_attempt+1): drawn again →
    fresh `open` record supersedes the voided panel's record; dropped →
    stale record closed as `redrawn-out` so no component retries a void
    duty (bookkeeping closure, not alerted).
  - Duplicate rescan idempotency: same attempt already tracked → prior
    record returned untouched, zero writes (committed/revealed/abstained
    progress and pre-tracking abstentions survive).
- `apps/jurat/src/duty/types.ts` — `DutyRecord` extended with optional
  tracker fields (`seat`, `drawAttempt`, `reviewEnd/commitEnd/revealEnd`);
  `FAILURE_KINDS` gained `redrawn-out`.
- `apps/jurat/src/duty/tracker.test.ts` — 11 node:test cases: window-edge
  phase table + early-reveal, bigint normalization, fresh-duty shape,
  dead-slot guard, duplicate no-op (one write), progress non-clobber,
  pre-tracking abstention survival, redraw drawn-again reset, redraw
  drop-out closure, same-attempt prior untouched.
- Verified: `pnpm --filter @useaccord/jurat test` 27/27 green; `pnpm -r
  run build` + `pnpm -r run lint` green workspace-wide.
