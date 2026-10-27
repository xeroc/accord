---
"@useaccord/tests": patch
---

Fix e2e `#6036 RevealWindowClosed` failures on slow CI runners (ADR-0038
follow-up, bean accord-9952; broke release merges #27/#28):

- `warpToRevealWindow` no longer reserves a fixed `panel + 3` seconds of
  Surfnet clock against the re-anchored `reveal_end` — that budget assumed
  ~1s of clock burn per tx, but a loaded CI runner burns ~5s/tx, so the
  reveal txs themselves overran the deadline. It now branches on panel
  state: full panel ⇒ reveal is already open via the `all committed` arm
  with the whole re-anchored `reveal_window` (2d) as headroom (no warp);
  partial panel ⇒ no re-anchor ever fired, so warp to `commit_end` with the
  whole scheduled `reveal_window` as headroom. Machine-speed independent.
- `voting.spec` ADR-0038 test pinned `revealEnd − commitEnd === 1n`, which
  only holds when the commit loop burns zero clock (fast laptop; CI burned
  15s ⇒ got `16n`). It now pins the re-anchor formula
  `revealEnd = last_commit + reveal_window` via burn-independent bounds.
- `appeal.spec`: dropped its stale local copy of `warpToRevealWindow` for
  the shared (fixed) helper.
