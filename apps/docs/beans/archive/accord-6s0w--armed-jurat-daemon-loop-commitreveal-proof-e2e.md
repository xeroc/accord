---
# accord-6s0w
title: Armed jurat — daemon-loop commit+reveal proof (e2e)
status: completed
type: feature
priority: normal
created_at: 2026-10-27T08:27:48Z
updated_at: 2026-10-27T08:51:17Z
---

The daemon already composes commit+reveal behind JURAT_DRY_RUN, but the e2e hand-drives every stage; runDaemon has never run armed against a validator. Prove the armed loop: boot the real daemon against Surfnet with dryRun=false, let its own scan discover the drawn duty, run the mock-LLM verdict, send the real commit tx, then reveal after the window opens. Document the operator arming env (JURAT_DRY_RUN=false + evidence + LLM) and fix the SPEC verification claim to match reality.


## Progress (2026-10-27)

- Armed-loop e2e added to tests/src/jurat.spec.ts: real `runDaemon` booted against
  Surfpool with dryRun=false, never-join policy, live chain clock; asserts the
  daemon's OWN scan discovers the duty, sends commit (commitCount >= 2), duty
  record -> committed, then after warpToRevealWindow sends reveal
  (reveals[seat] == verdict, record -> revealed) + verdict notice.
- ROOT-CAUSE BUG found by the armed loop (this is why it mattered): handleJoins
  calls deps.tokenBalance BEFORE gate rejection; both seam impls (main.ts
  joinChain, spec joinChain) did raw getTokenAccountBalance on a maybe-missing
  ATA -> JSON-RPC "account not found" -> ENTIRE scan throws -> duties never
  processed. On any chain with a foreign pool whose mint the operator never
  held, the daemon was dead in the water. Fix: getAccountInfo existence probe,
  missing ATA = 0n balance (join gate rejects on insufficient balance).
- README "Arming (live voting)" section + SPEC verification block updated
  (staged vs armed-loop distinction; the old "full duty loop" claim overstated —
  every stage was hand-driven).

- [x] armed-loop e2e spec
- [x] tokenBalance missing-ATA fix (main.ts + spec seam)
- [x] README/SPEC arming docs
- [x] full jurat suite green
- [x] e2e green on Surfpool


## Addendum (2026-10-27, later)

- runDaemon.stop() now awaits the in-flight scan (was: resolved immediately,
  leaving a dangling RPC scan after stop — surfaced as jest "did not exit").
  Unit-tested deterministically (no wall-clock timers).
- runtime.test.ts makeDeps: chain overrides now MERGE with the default chain
  (the old `...overrides` spread replaced deps.chain wholesale with the
  Partial — a typed contract lie; a partial override made reconcile throw on
  the missing method).


## Summary of Changes

- tests/src/jurat.spec.ts: armed-loop e2e — the REAL runDaemon booted against
  Surfpool with dryRun=false; its own scan discovers the drawn duty, runs the
  mock-LLM verdict, sends commit, and (after warpToRevealWindow) reveal.
  Asserts Round.commitCount/revealCount, reveals[seat] == verdict, duty record
  transitions open→committed→revealed, daemon log lines, verdict notice.
  Also: tokenBalance seam hardened (missing ATA = 0n).
- apps/jurat/src/main.ts: joinChain.tokenBalance existence-probes the ATA
  (getAccountInfo) before getTokenAccountBalance — a missing ATA previously
  threw "account not found" and killed EVERY scan (join pre-gate ran before
  gate rejection), so any chain with a foreign pool starved all duties.
- apps/jurat/src/runtime.ts: runDaemon tracks the in-flight scan (incl.
  chained re-kicks); stop() awaits it — no dangling RPC after shutdown.
- apps/jurat/src/runtime.test.ts: deterministic stop() test (signal-driven
  entry + microtask drain, no wall-clock); makeDeps chain overrides now merge
  with defaults instead of replacing deps.chain wholesale.
- apps/jurat/README.md: "Arming (live voting)" section (JURAT_DRY_RUN=false +
  evidence + LLM + stake prerequisites; dry-run verdict re-commit semantics).
- apps/jurat/SPEC.md: verification block now distinguishes the staged loop
  from the armed-loop test (the old "full duty loop" claim overstated).

Verification: bun suite 202/202, tsc build clean, eslint clean, jurat e2e
3/3 on fresh Surfnet (happy, failing-LLM, armed loop).
