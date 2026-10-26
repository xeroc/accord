---
"@useaccord/jurat": patch
"@useaccord/tests": patch
---

Jurat Surfpool e2e: `tests/src/jurat.spec.ts` drives the full agentic-juror duty loop green (reconcile scan → join gates → auto-join → dispute → VRF draw → mock-LLM verdict through the real provider ladder + runner → commit → reveal, with `Round.reveals` and the verdict notice asserted, dryRun OFF) plus the failing-LLM twin (retry ladder exhausted → clean abstain + alert, no vote). Joining the suite required a `loadBook` robustness fix: the first-run ENOENT path now duck-types `code` instead of `instanceof Error`, which breaks on cross-realm errors (jest ESM vm contexts, workers).
