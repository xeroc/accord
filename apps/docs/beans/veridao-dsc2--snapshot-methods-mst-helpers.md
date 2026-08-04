---
# veridao-dsc2
title: Snapshot methods + MST helpers
status: todo
type: task
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-04T21:51:58Z
parent: veridao-gqzm
---

src/methods/snapshot.ts: post_snapshot, challenge_snapshot, finalize_snapshot. Plus CLIENT-SIDE MST helpers (ADR-0009): rebuild the Merkle-Sum Tree from the leaf set {juror, stake, cum_after} sorted by pubkey; produce inclusion proof + JurorMembership per selected slot r_i for draw. Unit-test the MST assembly independent of the chain. Acceptance: MST membership builder matches on-chain verify_mst_inclusion on a fixture. See ADR-0010.
