---
"@useaccord/sdk": patch
"@useaccord/jurat": patch
---

sdk/jurat: fix every trace batch carrying a `step` event 403ing the daemon ingest (`signature does not verify for juror`, bean accord-r64v). `stepEvent` passes ai@7's `LanguageModelUsage` through raw, and its normalization materializes optional fields as explicit `undefined` (e.g. `inputTokenDetails.cacheWriteTokens`). jurat signs the canonical JSON of the IN-MEMORY batch while the daemon re-canonicalizes the parsed wire body — `Object.entries` kept those keys (rendered as literal `undefined`) while `JSON.stringify` drops them, desyncing the sha256 and failing Ed25519 verification. Observed live: all investigation-step batches dropped (MinIO trace gap 3–6), verdict/commit/reveal unaffected — same class as the earlier `unsealAt` fix. `canonicalJson` now mirrors `JSON.stringify` for `undefined` exactly (object entries skipped, array elements `null`), making the shared canonical form JSON-round-trip stable by construction. Pinned by an SDK wire-round-trip test and a jurat regression that drives the real provider normalization (mock-llm + real `@ai-sdk/openai-compatible`) and signs→wire→verifies the emitted step events.
