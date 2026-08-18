---
# accord-8pd1
title: e2e specs — open/join/file/refund/claim per-instruction
status: todo
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-ndl9
blocked_by:
    - accord-al8h
---

assigned: tester
One spec file per instruction group (synod.open-join / synod.file / synod.refund / synod.claim) covering every HANDOFF §6 matrix row: validation errors, full-roster file + vault invariant, roster-miss refunds + idempotency, winner pot / neutral floor+remainder / Failed full refund, Median gate, N*S>fee gate. fetchDecoded + account decoders re-exported from @useaccord/synod — NOT facade fetch methods needing ClientWithRpc (setup/assertions rule). Whole suite must run GREEN together on one Surfnet.
