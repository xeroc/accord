---
# accord-sith
title: Ingest pipeline — sig verify + Round gate + append
status: todo
type: task
created_at: 2026-10-23T09:32:57Z
updated_at: 2026-10-23T09:32:57Z
parent: accord-06nn
---

src/pipeline/trace.ts: canonical batch hash (sorted keys, no whitespace) → Ed25519 verify against the juror ADDRESS from a live `Round.jurors[]` read (cache per round like delivery) → seq > last[juror] → appendBatch → fan-out callback. Batch caps 64 events / 256 KiB. RED→GREEN per HANDOFF §6: bad sig 403 / non-drawn juror 403 / stale seq 200 no-op / gap accepted / oversize 413 / store failure still fans out.
