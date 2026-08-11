---
# accord-72tz
title: 'Test: manifest/options/publish — byte-stability, self-verify, publish idempotency, verifyManifestHash accept/reject'
status: todo
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T00:56:38Z
parent: accord-1d3i
blocked_by:
    - accord-2z1v
    - accord-t44l
---

node:test unit suite. See HANDOFF §6 test matrix. Cover: identical input → byte-identical buffer+sha256; verifyOptionHashes pass + tampered-label throw; publishEvidence stubbed-fetch 201 + retry idempotency; verifyManifestHash accept + reject.
