---
# accord-x4cp
title: 'PUT file pipeline: gates, idempotency, limits'
status: completed
type: task
priority: normal
created_at: 2026-09-22T11:35:20Z
updated_at: 2026-09-22T12:54:11Z
parent: accord-np69
blocked_by:
    - accord-k37d
    - accord-85yu
---

TDD: ingestFile() per locked gate order (404/400/400/decrypt-verify/413/201/409).

## Summary of Changes

- ingestFile(): locked gate order (manifest-first 404 → tracked 400 → leaf 400 pre-decrypt → idempotent 201/409 → 413 doc/package caps → decrypt-verify 400 → putFile 201)
- IngestLimits grew maxDocBytes/maxPackageBytes; listFiles → FileStat[] {path, bytes} (fs stat / S3 Contents.Size — no object reads)
- package cap = stored bytes + ct length (ponytail comment: liability bound, JSON overhead ignored)
- 11 new pipeline tests; suite 314/314 green
