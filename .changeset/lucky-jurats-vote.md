---
"@useaccord/jurat": patch
---

feat(jurat): vote executor — commit path + failure path

- Commit path (`src/vote/commit.ts`): 32-byte salt generation with persist-before-send, SDK `commitHash`+`commit` wiring gated to the on-chain commit window `[review_end, commit_end)`, and a `DRY_RUN` gate that logs + notifies instead of sending a transaction (bean accord-0ytn).
- Failure path (`src/duty/failures.ts` + `src/duty/types.ts`): every failure source (evidence unavailable, retry ladder exhausted, malformed verdict, window closed, salt lost) maps to a persisted abstention + Telegram alert; the module structurally cannot cast a vote (bean accord-5mpb).
