---
"@useaccord/evidence-daemon": patch
---

evidence-daemon: durable TraceStore seam for jury telemetry (ADR-0037, bean accord-flxc) — `src/store/trace.ts` trait (`appendBatch` / `readEvents(dispute, juror?, fromSeq?)` with verbatim-event invariants), FsTraceStore (append-only JSONL `traces/{sub}/{dispute}/{juror}.jsonl`, seq-check-on-append idempotency) and S3TraceStore (one immutable object per batch at `traces/{sub}/{dispute}/{juror}/{seq}.json`, Head-first same-seq no-op, replay = paginated prefix list + sort). Store-only — the ingest pipeline and HTTP routes land with accord-sith/accord-lmcc; the lockstep bump for the rest of the workspace comes from the fixed group.
