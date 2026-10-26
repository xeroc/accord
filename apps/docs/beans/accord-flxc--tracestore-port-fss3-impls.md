---
# accord-flxc
title: TraceStore port + fs/s3 impls
status: todo
type: task
created_at: 2026-10-23T09:32:57Z
updated_at: 2026-10-23T09:32:57Z
parent: accord-06nn
---

TRACE: interface `appendBatch(b)` / `readEvents(dispute, juror?, fromSeq?)`; FsTraceStore appends JSONL lines to `traces/{sub}/{dispute}/{juror}.jsonl`; S3TraceStore puts one immutable object per batch at `traces/{sub}/{dispute}/{juror}/{seq}.json` — never read-modify-write. RED→GREEN: fs append/read roundtrip ordered by seq; re-append same seq idempotent (fs: seq-check on append, s3: same-key put is a no-op); s3 replay = prefix list + sort; path hygiene per HANDOFF §2. Mirror delivery-key/domain store file shapes (~60-130 ln/impl).
