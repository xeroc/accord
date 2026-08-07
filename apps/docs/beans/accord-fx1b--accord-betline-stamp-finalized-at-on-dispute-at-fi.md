---
# accord-fx1b
title: Accord Betline — stamp finalized_at on Dispute at Final (reveal-window anchor)
status: in-progress
type: task
created_at: 2026-08-07T18:21:51Z
updated_at: 2026-08-07T18:21:51Z
---

Add finalized_at: i64 to Dispute (state.rs), 0 until Final. Stamp in finalize_dispute (single Final transition). Zero-init in create_dispute. Update LiteSVM + e2e tests. Needed by the Betline primitive: bettor reveal window opens at dispute Final and needs a canonical timestamp anchor Betline can read off-chain/on-chain. Minimal, surgical, no migration (Accord not deployed).
