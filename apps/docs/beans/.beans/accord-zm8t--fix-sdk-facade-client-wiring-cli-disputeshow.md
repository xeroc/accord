---
# accord-zm8t
title: Fix SDK facade client wiring + CLI dispute:show
status: completed
type: task
priority: normal
created_at: 2026-10-12T07:25:55Z
updated_at: 2026-10-12T07:41:52Z
---

Facade passes raw RPC into accordProgram() but kit 7 program-client contract requires ClientWithRpc ({ rpc, rpcSubscriptions }) — every facade-mediated fetch (fetchCommittedVrf, dispute/jurorStake/pendingUpdate reads) dies with 'rpc.getAccountInfo is not a function'. Fix wiring, add regression test, then add 'useaccord dispute:show' command rendering all on-chain Dispute fields. Update useaccord skill + changeset.
