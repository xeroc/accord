---
# accord-g1dy
title: Daemon - juror deliver bridge + synod route tests
status: todo
type: task
created_at: 2026-08-18T19:14:01Z
updated_at: 2026-08-18T19:14:01Z
parent: accord-7k2y
---

GET /evidence/:dispute/for/:juror serves the assembled synod group when Dispute.filer is a case PDA (chain reader resolves filer->case->group). Tests: slot guard, 409 post-file push, manifest verify happy + mismatch, deliver bridge.
