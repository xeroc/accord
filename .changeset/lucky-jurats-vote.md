---
"@useaccord/jurat": patch
---

feat(jurat): duty pipeline — commit path, failure path, duty tracker

- Commit path (`src/vote/commit.ts`): 32-byte salt generation with persist-before-send, SDK `commitHash`+`commit` wiring gated to the on-chain commit window `[review_end, commit_end)`, and a `DRY_RUN` gate that logs + notifies instead of sending a transaction (bean accord-0ytn).
- Failure path (`src/duty/failures.ts` + `src/duty/types.ts`): every failure source maps to a persisted abstention + Telegram alert; the module structurally cannot cast a vote (bean accord-5mpb).
- Duty tracker (`src/duty/tracker.ts`): decoded `Round` → `DutyRecord` for our seat (`Round.jurors[0..juror_count)`), chain-clock window math mirroring the commit.rs/reveal.rs gates (incl. early reveal on full panel), ADR-0021 redraw supersession (same round_idx, attempt+1 → fresh duty or `redrawn-out` closure), idempotent reconcile rescan (bean accord-fgxw).
