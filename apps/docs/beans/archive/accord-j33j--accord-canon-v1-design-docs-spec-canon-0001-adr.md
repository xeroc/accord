---
# accord-j33j
title: Accord Canon v1 — design docs (SPEC + canon-0001 ADR)
status: completed
type: feature
priority: high
created_at: 2026-08-07T19:47:17Z
updated_at: 2026-08-07T19:47:39Z
parent: accord-gf0b
---

Write the Canon v1 design artifacts from the locked 12-decision grilling (2026-08-07): programs/canon/SPEC.md (implementation reference) + apps/docs/adr/canon/0001 (architecture + Stake-Curate economics + token-agnostic create_list ADR). Updates canon/index.md. Parent: accord-gf0b (Canon epic). Decisions locked: name=Accord Canon; general TCR factory (token-auth flagship); Stake-Curate economics (permanent deposits + progressive protection + challenger accountability + full-accumulated bounty); windowed-then-listed lifecycle; 1:1 list-creates-Subaccord; Canon canonical dispute-mechanism defaults; token-agnostic (creator picks stake_mint + fee_mint, may be same); permissionless creation; withdrawal via timelock+challengeable.

## Summary of Changes (2026-08-07): Wrote programs/canon/SPEC.md (account/PDA model, 7 instructions, item state machine, Stake-Curate economics, token model, edge cases) + apps/docs/adr/canon/0001 (architecture ADR: Canon = Arbitrable over Accord, 1:1 list-creates-Subaccord, token-agnostic create_list, Stake-Curate, windowed-then-listed lifecycle). Updated canon/index.md with the 0001 row. Captures all 12 locked grilling decisions. Implementation beans (scaffold, instructions, TDD) are follow-on children of accord-gf0b
