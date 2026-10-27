---
"@useaccord/sdk": patch
"@useaccord/evidence-daemon": patch
---

evidence-daemon + sdk: trace ingest authentication (ADR-0037, bean accord-sith) — `@useaccord/sdk/evidence` gains the shared ADR-0037 wire contract `canonicalJson` / `buildTraceBatchMessage` / `verifyTraceBatchSig` (Ed25519 by the juror hot key over sha256 of the canonical batch JSON, one implementation shared by the jurat signer and the daemon verifier); the daemon pipeline now gates in order: envelope shape → signature verify (403) → live `Round.jurors[]` membership via the same chain reader as delivery (403) → `seq <= last` idempotent 200 no-op (new `TraceStore.lastSeq`, fs last-line / s3 max-seq-key) → append → fan-out callback seam. Store write failure logs and still fans out. Batch caps unchanged (64 events / 256 KiB). The lockstep bump for the rest of the workspace comes from the fixed group.
