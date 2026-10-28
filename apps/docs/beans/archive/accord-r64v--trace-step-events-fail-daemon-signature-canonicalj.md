---
# accord-r64v
title: Trace step events fail daemon signature — canonicalJson desyncs on explicit undefined (ai@7 usage)
status: completed
type: bug
priority: normal
created_at: 2026-10-28T13:37:06Z
updated_at: 2026-10-28T13:41:36Z
---

Every batch containing a kind:"step" event is rejected 403 "signature does not verify for juror": stepEvent passes step.usage through raw, and ai@7 usage normalization materializes optional fields as explicit undefined (e.g. inputTokenDetails.cacheWriteTokens). Object.entries keeps them (canonicalJson renders literal text undefined) while JSON.stringify drops them on the wire — the daemon re-canonicalizes a different object → different sha256 → Ed25519 verify fails. Same class as the unsealAt fix (changeset jurat-trace-sig-base64). Observed live: dispute 2KZ4HRNn… seq 4/5/6 dropped, MinIO traces gap 3-6.

## Acceptance (TDD)
- [x] RED: SDK trace.test.ts — canonicalJson matches JSON.stringify round-trip for objects with explicit undefined entries and arrays containing undefined; sign→wire→verify passes for a usage-shaped event
- [x] RED: jurat cross-contract — a real SDK step event (mock-llm + real @ai-sdk/openai-compatible) signs and verifies across the JSON round-trip
- [x] GREEN: fix in the shared canonicalJson (packages/sdk/src/evidence/trace.ts): skip object entries with undefined values, render array undefined as null (mirror JSON.stringify); update its doc claim that undefined never occurs
- [x] sdk + jurat + evidence-daemon trace suites green; lint clean; changeset

## Summary of Changes

Root cause: jurat's sink signs canonicalJson of the in-memory batch; the daemon re-canonicalizes the parsed wire body. ai@7 usage normalization materializes optional fields as explicit undefined (inputTokenDetails.cacheWriteTokens etc.) — Object.entries kept them (rendered literal undefined) while JSON.stringify drops them, so the sha256 desynced and every step-event batch 403'd and was dropped (no retry, by design). MinIO gaps 3-6 = the three investigation step events; batch seq 3 never existed (the seq-2 batch carried evidence+agent-start, nextSeq += events.length).

Fix (one guard, class-level, in packages/sdk/src/evidence/trace.ts): canonicalJson now mirrors JSON.stringify for undefined — object entries with undefined values are skipped, array elements render null — so the canonical form is JSON-round-trip stable by construction; daemon side unchanged (post-parse objects never contain undefined). Doc claim that undefined never occurs replaced with the real contract.

Tests: SDK trace.test.ts (undefined mirroring, round-trip stability, sign->wire->verify) + jurat runner regression driving the REAL provider normalization (mock-llm + @ai-sdk/openai-compatible) and signing the emitted step events. RED->GREEN verified. Suites: sdk 0 fail, jurat 239 pass/0 fail, evidence-daemon 419 pass/0 fail. Lint clean (sdk tsc, jurat eslint). Changeset: .changeset/trace-canonical-undefined.md. Deployment note: evidence-daemon/jurat images must rebuild against the new sdk dist — already-deployed jurat keeps dropping step batches until then.
