---
# accord-6fgl
title: 'Test: dispute-detail Publish evidence recovery — hash gate + idempotent re-publish'
status: todo
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T00:56:38Z
parent: accord-wbic
blocked_by:
    - accord-9df9
---

Upload matching manifest → verifyManifestHash passes → publishEvidence 201. Upload wrong manifest → hash mismatch → rejected. Re-publish already-published → 201 idempotent. See HANDOFF §6.
