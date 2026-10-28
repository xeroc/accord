---
# accord-9pdg
title: TraceSink interface + RemoteTraceSink
status: completed
type: task
created_at: 2026-10-23T09:32:57Z
updated_at: 2026-10-23T12:10:00Z
parent: accord-c19g
---

jurat src/trace/sink.ts: `TraceEvent` union + envelope types (HANDOFF §2), `TraceSink.emit(e): void` — sync, never throws; RemoteTraceSink: bounded queue (256, drop-oldest), batches `{v, seq, events[], sig}` (Ed25519 with the hot key), fetch POST with 2s timeout, drop-on-failure. Config `JURAT_TRACE_URL` (unset = no-op sink), `JURAT_TRACE_MODE=sealed|open`. RED→GREEN per HANDOFF §6: dead endpoint never rejects/stalls the pipeline, queue bound drops oldest, sig is deterministic over canonical JSON.

## Summary of Changes

- `apps/jurat/src/trace/sink.ts` (new): `TraceEvent` union (duty-open / evidence / verdict / commit / reveal / abstain + the runner's agent-start & step events, reused by reference — no second definition), `TraceEnvelope` + `TraceBatchBody` wire types (HANDOFF §2), `TraceSink { emit(e): void; drain(): Promise<void> }` — emit is sync and never throws.
- `makeTraceSink`: unset `url` → no-op sink. Remote path: bounded queue (`TRACE_QUEUE_CAP` 256, drop-oldest), flush coalesces queued events into ≤64-event chunks (`TRACE_MAX_BATCH_EVENTS` — daemon ingest 413s above 64), `seq` = first-event seq per batch (per-juror-per-dispute monotonic), `sig = signTraceBatch(...)` = Ed25519(hot-key seed) over sha256(canonical JSON of {v, juror, dispute, seq, events}) reusing `canonicalJson` from the agent runner, `fetch` POST to `/trace/:sub/:dispute/:juror` with `AbortSignal.timeout(TRACE_PUSH_TIMEOUT_MS = 2s)`, drop-on-failure (warn log, no requeue). Open mode strips verdict `unsealAt` at emit (demo release-at-push).
- `apps/jurat/src/config.ts`: `TraceConfig { url, mode }` — `JURAT_TRACE_URL` (unset = off), `JURAT_TRACE_MODE=sealed|open` (default sealed; garbage or mode-without-URL throws).
- Tests (RED→GREEN): one coalesced signed POST on the right route with sig verified by an independent application of the HANDOFF formula; 65 events → 2 chunks with seq 1 / 65; open-mode unsealAt strip; 300 pushes → 256 delivered, oldest (f1..f44) dropped; dead + hung endpoints resolve via drain without throwing; no-op sink; signTraceBatch determinism (key-order independent), identity/payload sensitivity, public-key verification. Config: unset/default/open/throw paths.
- Docs: SPEC module map + config table rows, `.env.example` entries. Changeset added.
- Verification: `bun test` 193 pass / 0 fail, `tsc --noEmit` clean, `eslint` clean in @useaccord/jurat.
