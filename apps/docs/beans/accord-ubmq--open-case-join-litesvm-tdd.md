---
# accord-ubmq
title: open_case + join — LiteSVM TDD
status: todo
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T05:28:20Z
parent: accord-l2ad
blocked_by:
    - accord-oeem
---

assigned: implementer
Per SPEC §Instructions 1-2 and HANDOFF §4 pseudo-code. open_case: all §3 validations (2..=7 distinct, opener==parties[0], Plurality gate, N*S>fee, deadline>now) + fee frozen at open from subaccord terms. join: signer==parties[i], bitmask set-once, S transfer to case vault ATA (lazy ATA per canon precedent), evidence[i] frozen at join. LiteSVM tests: happy path, every validation error, double-join rejection, join-after-deadline rejection. Gated #![cfg(feature = "no-entrypoint")] like canon/accord litesvm files.
