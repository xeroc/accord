---
# accord-n7x0
title: apps — useDomainDoc hook + six-surface wiring
status: todo
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T20:35:24Z
parent: accord-zcjj
blocked_by:
    - accord-yizt
---

Thin per-app `useDomainDoc(daemonUrl, hash)` (~10 lines over SDK fetchDomainDoc, cache keyed by hash; fetch/verify logic stays single-source in the SDK). Wire DomainDocCard into: apps/app SubaccordDetailPage + Voting; apps/canon ListDetailPage + ItemDetailPage + ChallengePage + SubmitItemPage. Daemon URL from existing VITE_EVIDENCE_DAEMON_URL config.

Verify: tsc green both apps; manual smoke against local daemon (fs backend) with a published doc.
