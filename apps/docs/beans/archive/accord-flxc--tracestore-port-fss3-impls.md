---
# accord-flxc
title: TraceStore port + fs/s3 impls
status: completed
type: task
created_at: 2026-10-23T09:32:57Z
updated_at: 2026-10-23T10:55:00Z
parent: accord-06nn
---

TRACE: interface `appendBatch(b)` / `readEvents(dispute, juror?, fromSeq?)`; FsTraceStore appends JSONL lines to `traces/{sub}/{dispute}/{juror}.jsonl`; S3TraceStore puts one immutable object per batch at `traces/{sub}/{dispute}/{juror}/{seq}.json` — never read-modify-write. RED→GREEN: fs append/read roundtrip ordered by seq; re-append same seq idempotent (fs: seq-check on append, s3: same-key put is a no-op); s3 replay = prefix list + sort; path hygiene per HANDOFF §2. Mirror delivery-key/domain store file shapes (~60-130 ln/impl).

## Summary of Changes

- `src/store/trace.ts` — TraceStore trait + `TraceBatch`/`TraceEnvelope` records, verbatim serialize + shape-validated parse, base58 path-hygiene gate (`assertTraceAddress`), `(juror, seq)` replay ordering helper.
- `src/store/trace-fs.ts` — FsTraceStore: append-only JSONL at `traces/{sub}/{dispute}/{juror}.jsonl`; seq-check-on-append idempotency (seq ≤ last ⇒ no-op, first write wins); `readEvents` scans every subaccord shard for the dispute (read API is dispute-keyed, path is subaccord-sharded).
- `src/store/trace-s3.ts` — S3TraceStore: one immutable object per batch at `traces/{sub}/{dispute}/{juror}/{seq}.json` — Head-first, same-seq re-append is a no-op, never read-modify-write; replay = paginated ListObjectsV2 prefix list + segment match + sort. No delete in either impl — keep forever; retention sweeps never touch `traces/`.
- Tests: `trace-fs.test.ts` (8) + `trace-s3.test.ts` (6) — append/read roundtrip ordering, idempotent re-append, stale-seq guard, juror/fromSeq filters, file layout, list pagination, path hygiene (traversal rejected before any fs/S3 call). RED→GREEN; daemon suite 362 pass, `tsc --noEmit` + eslint clean.
