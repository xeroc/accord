---
# accord-wnqf
title: Surfpool e2e — full duty loop green
status: completed
type: task
priority: normal
created_at: 2026-10-15T07:33:06Z
updated_at: 2026-10-15T07:33:50Z
parent: accord-mehu
blocked_by:
    - accord-n5v4
    - accord-ji4v
    - accord-3tlt
    - accord-f3ir
---


## Summary of Changes

- `tests/src/jurat.spec.ts` — the e2e: pool of exactly PANEL_SIZE (2 harness
  jurors + jurat, so jurat's seat is structural) → beforeAll drives the real
  pipeline: reconcile scan → `evaluateJoinGate` (full conservative gate set,
  config-fed policy) → `joinSubaccord` (real accumulator slot resolution +
  free-list; harness tree synced from jurat's on-chain leaf). Two `it`s:
  (1) happy loop — dispute → VRF inject → draw → background commit opens the
  duty (Drawn→Commit: reconcile surfaces actionable states only) → scan +
  `trackRound` → mock-LLM verdict through the REAL provider ladder + agent
  runner (real chain readers as tools) → `commitVote` dryRun OFF → warp →
  `revealVote` → asserts `Round.reveals[seat] === verdict`, commit/reveal
  counts, verdict notice emitted; (2) failing-LLM twin — 500s on both ladder
  attempts → `RetryLadderExhaustedError` → real `abstain()` path → duty
  marked `retry-ladder-exhausted`, alert fired, commitCount stays 1.
- `tests/src/setup/mock-llm.ts` — node:http openai-compatible mock (the
  accord-f3ir rig is `Bun.serve`-bound; jest runs node). Same wire contract,
  request capture, keep-alive-safe stop.
- `apps/jurat/src/join/book.ts` — `loadBook` ENOENT path now duck-types
  `code` instead of `instanceof Error` (breaks on cross-realm errors under
  jest ESM vm contexts; first-run join crashed the e2e before this).
- `tests/src/draw-harness.ts` — `armSubaccordAndJurors` gained an optional
  `nJurors` param (default unchanged) so the spec can stake 2 background
  jurors and let jurat take the third seat.
- `tests/tsconfig.json` — lib `ES2024.Promise` for `Promise.withResolvers`.
- `apps/jurat/SPEC.md` — Verification section now names the landed spec.
- Changeset: `.changeset/jurat-e2e-full-loop.md`.

Verification: `anchor test` (full jest e2e on one Surfnet) — 27 suites, 119
passed / 1 skipped (pre-existing conditional), jurat.spec PASS; jurat bun
suite 147 pass; jurat eslint clean; `pnpm -r --filter ./packages/* --filter
./apps/* run build` green; tests `tsc --noEmit` clean.
e2e: fresh Surfnet, create gate-passing subaccord → jurat auto-joins → file dispute → VRF inject (harness vrf.ts) → draw → mock-LLM verdict → commit → warp → reveal → verify Round.votes + notification emitted; then a failing-LLM case → abstain + alert, no vote. dryRun OFF in this spec only. AC: jest spec green alongside the existing suite on one Surfnet (idempotent singleton guard).
