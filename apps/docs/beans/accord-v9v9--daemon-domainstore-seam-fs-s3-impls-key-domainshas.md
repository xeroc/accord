---
# accord-v9v9
title: Daemon DomainStore seam — fs + s3 impls, key domains/{hash}
status: todo
type: task
tags:
    - implementer
created_at: 2026-08-18T23:00:04Z
updated_at: 2026-08-18T23:00:04Z
parent: accord-iq0j
---

TDD. DomainStore trait mirroring EvidenceStore (apps/evidence-daemon/src/store/), key domains/{hash}, content-type stored + round-trips on both backends. Acceptance: HANDOFF §5 content-type round-trip bullet. No parsing — bytes in, bytes out.
