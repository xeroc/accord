---
# accord-tksq
title: 'Per-file delivery GET: juror/complete/leaf gates + re-encrypt'
status: completed
type: task
priority: normal
created_at: 2026-09-22T11:35:20Z
updated_at: 2026-09-22T13:09:22Z
parent: accord-85jo
blocked_by:
    - accord-mco5
---

TDD: GET /evidence/:dispute/for/:juror/:round/*path — drawn-juror gate, 409 incomplete, leaf gate, watermark, re-encrypt, one plaintext in memory.

## Summary of Changes

- deliverFile(): drawn-juror + non-sentinel round + manifest integrity + tracked-entry lookup + derived completeness (409 incomplete) + file decrypt + leaf gate + watermark + re-encrypt; synod filers → 404 (no per-path namespace); one plaintext in memory
- 3 pipeline tests (happy/incomplete/404 matrix); 35/35 in tests/pipeline.test.ts
