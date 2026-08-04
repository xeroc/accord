---
# veridao-7iiv
title: jest integration suite vs Surfpool (Kit SDK)
status: todo
type: task
priority: normal
created_at: 2026-08-04T21:52:11Z
updated_at: 2026-08-04T22:10:02Z
parent: veridao-5y8e
---

First real jest files in tests/. Drive the Accord facade end-to-end against Surfpool via @solana/rpc (standard JSON-RPC, Surfpool-compatible). Cover the full dispute lifecycle per milestone test matrix: create_subaccord -> stake -> create_dispute -> snapshot -> VRF/draw -> commit/reveal -> finalize -> get_ruling; plus appeal, unstake guard, timelock update. Acceptance: `pnpm --filter @veridao/tests test` green against `make run_surfpool`. See ADR-0010.
