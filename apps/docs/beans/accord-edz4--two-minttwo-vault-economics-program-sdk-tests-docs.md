---
# accord-edz4
title: Two-mint/two-vault economics (program + sdk + tests + docs)
status: todo
type: epic
priority: high
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T18:07:45Z
parent: accord-vsyq
---

ADR-0020 implementation. Ships first. See milestone HANDOFF. Covers: state.rs renames + `fee_token`/dual-vault/`fees_earned`/layout offsets; `create_subaccord` fee_token + kit; `stake`/`withdraw`→stake_vault; `create_dispute`/`appeal`→fee_vault; `reveal` fee-removal; `finalize_round` fee-credit (threshold gate lands under E2 but the fees_earned write path is wired here); `withdraw_fees`; `assert_fund_invariants`; SDK; LiteSVM; Surfpool; ADR-0020+docs.
