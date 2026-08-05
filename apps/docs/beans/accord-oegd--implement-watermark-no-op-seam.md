---
# accord-oegd
title: Implement Watermark no-op seam
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-zv7j
---

---

assigned: implementer
---

src/pipeline/watermark.ts: Watermark trait + pass-through apply(plaintext,juror)==plaintext. Seam for v1.1 per-juror attribution (bean accord-1acp).

See milestone accord-yjno HANDOFF §4 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
-----------------

- Added `apps/evidence-daemon/src/pipeline/watermark.ts`: the `Watermark` trait
  (`apply(plaintext, juror) => Uint8Array`) and the v1 `NoOpWatermark` impl that
  returns plaintext unchanged (identity, length-preserving, juror-independent).
- Typed on `Uint8Array` deliberately — zero-dependency, no `@solana/kit`
  coupling (the deliver handler already handles juror bytes for X25519); keeps
  the module lint/typecheck-clean before the package scaffold lands.
- Sync signature matching the SPEC §"Delivery re-encryption" pseudo-code; v1.1
  (bean `accord-1acp`) owns the evolution to real per-juror attribution.
- Added `apps/evidence-daemon/tests/watermark.test.ts`: 4 green checks pinning
  the v1 contract (identity, juror-independence, empty round-trip, trait
  conformance). Uses `node:test` + `node:assert/strict` per repo convention;
  runs under bun (`4 pass`).

Verification
------------

- `watermark.ts` typechecks clean standalone (`tsc --noEmit --strict`, exit 0).
- Tests green: `bun test apps/evidence-daemon/tests/watermark.test.ts` → 4 pass.
- Remaining test-file tsc warnings (`Cannot find module 'node:*'`) are the
  missing `@types/node`/`bun-types` from the not-yet-landed scaffold
  (`accord-qzca`); not a defect in this bean's code.

Out of scope (deliberately not done)
------------------------------------

- Package scaffold (`package.json`/`tsconfig.json`/deps) — that is `accord-qzca`.
- Real watermarking — that is v1.1 `accord-1acp`.
