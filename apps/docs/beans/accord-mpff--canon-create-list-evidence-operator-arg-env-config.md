---
# accord-mpff
title: Canon create_list evidence_operator arg (env-configured deployment operator)
status: completed
type: feature
priority: normal
created_at: 2026-08-18T22:08:51Z
updated_at: 2026-08-18T22:18:37Z
---

create_list currently CPIs create_subaccord with evidence_operator = Pubkey::default() (create_list.rs:78) — canon challenges can never encrypt evidence (claimantEncrypt throws; keys.ts now guards with a clear error). Change: create_list takes evidence_operator: Pubkey (non-default enforced), app passes it from VITE_EVIDENCE_OPERATOR_ADDRESS (deployment env, same pattern as VITE_EVIDENCE_DAEMON_URL). Cascade: program → codegen → @useaccord/canon SDK → apps/canon call sites → LiteSVM + e2e tests → SPEC/ADR docs.
