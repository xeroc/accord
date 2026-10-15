---
"@useaccord/jurat": patch
---

feat(jurat): vote executor commit path — 32-byte salt generation with persist-before-send, SDK `commitHash`+`commit` wiring gated to the on-chain commit window `[review_end, commit_end)`, and a `DRY_RUN` gate that logs + notifies instead of sending a transaction (bean accord-0ytn)
