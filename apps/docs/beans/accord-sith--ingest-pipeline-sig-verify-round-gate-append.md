---
# accord-sith
title: Ingest pipeline — sig verify + Round gate + append
status: completed
type: task
created_at: 2026-10-23T09:32:57Z
updated_at: 2026-10-23T12:45:00Z
parent: accord-06nn
---

src/pipeline/trace.ts: canonical batch hash (sorted keys, no whitespace) → Ed25519 verify against the juror ADDRESS from a live `Round.jurors[]` read (cache per round like delivery) → seq > last[juror] → appendBatch → fan-out callback. Batch caps 64 events / 256 KiB. RED→GREEN per HANDOFF §6: bad sig 403 / non-drawn juror 403 / stale seq 200 no-op / gap accepted / oversize 413 / store failure still fans out.

## Summary of Changes

- `packages/sdk/src/evidence/trace.ts` — the ADR-0037 §2 wire contract lives in the SDK (ADR-0015 rule): `canonicalJson` (recursive key sort, no whitespace), `buildTraceBatchMessage` (sha256 digest), `verifyTraceBatchSig` (Ed25519, false on malformed lengths). Exported from the evidence barrel; 6 `node:test` cases pin canonical form + sign/verify/tamper/wrong-key.
- `src/pipeline/trace.ts` — full gate order: envelope shape → sig verify (base64 sig, 403) → live `Round.jurors[]` membership via an injected `TraceChainReader` (403; no round ⇒ 403) → `seq <= lastSeq` ⇒ 200 idempotent no-op → `appendBatch` → optional `fanout` callback fired exactly once per accepted batch; store write failure logs (`log` seam) and still fans out.
- `TraceStore.lastSeq(subaccord, dispute, juror)` — fs: last JSONL line's seq; s3: max seq key under the juror prefix (LIST only). Store tests cover both; wire/synod memory stubs updated.
- `wire.ts` — traceIngest now uses `deliverChain` (the same live-Round reader as delivery) and maps 200|201; `handlers.ts` result union gains 200 + 403.
- Route suite reworked to real signatures: drawn juror keypair signs via `buildTraceBatchMessage`; matrix adds bad-sig 403, non-drawn 403, no-round 403, stale-seq 200 (no append, no fan-out), gap accepted, store-failure-still-fans-out. Daemon suite 378 pass; `tsc --noEmit` + eslint clean in daemon AND sdk.
