---
# accord-ozfm
title: ADR-0020 + SPEC/AGENTS/CONTEXT/trust-profile + 0002 banner + index
status: completed
type: task
priority: normal
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T19:10:00Z
parent: accord-edz4
blocked_by:
  - accord-djzb
---

assigned: implementer. ADR-0020 already drafted; finalize + link. Update programs/accord/SPEC.md (account model), AGENTS.md (v1 defaults + gotchas), CONTEXT.md glossary, trust-profile.md (two-mint), integration/staking.md. Confirm 0002 banner + index rows.

## Summary of Changes

- **SPEC.md**: account/PDA model updated (Subaccord +fee_token, JurorStake staked/fees_earned/stake_delta, two vaults); instructions table (reveal vote-only, withdraw_fees added, finalize_round fees_earned credit, two-pool settlement); economics section rewritten for two-mint; references updated.
- **AGENTS.md**: v1 defaults table +fee_token row + staking_token notes; gotchas expanded with two-mint/two-vault explanation; authority line +ADR-0020.
- **CONTEXT.md**: Subaccord definition mentions fee_token; Coherence/Incoherence reference staking_token/fee_token distinction; Appeal bonds are fee_token.
- **trust-profile.md**: machine-readable profile +fee_token field.
- **integration/staking.md**: vault→stake_vault; amount→staked; added withdraw_fees section.
- **ADR-0002**: banner already present (superseded by 0020). **ADR index**: 0020 + 0021 rows + supersession map entry already present. Confirmed.
