---
# accord-2ue3
title: Investigate and version create_subaccord ABI migration
status: todo
type: bug
priority: high
created_at: 2026-08-10T02:17:26Z
updated_at: 2026-08-10T02:17:26Z
---

## Problem

Mint validation changed `create_subaccord` on the existing instruction discriminator by removing `staking_token` and `fee_token` from serialized `CreateSubaccordParams` and inserting them as account metas before `system_program`. The wire format changes from three accounts to five and removes 64 bytes from instruction data without introducing a version boundary.

Old clients and deployed CPI programs cannot call the new program, while new clients cannot call the old program. Canon's `create_list` account ABI also changed to forward the mint accounts, requiring a lockstep rebuild and redeploy. Existing Subaccord account layout and PDA derivation appear unchanged. New creation also intentionally accepts only initialized legacy SPL Token mints, not Token-2022.

Relevant code:

- `programs/accord/src/state.rs:384-403`
- `programs/accord/src/lib.rs:297-354`
- `programs/accord/src/lib.rs:2852-2875`
- `programs/canon/src/instructions/create_list.rs:40-74`
- `programs/canon/src/state.rs:29-66`
- `packages/sdk/src/generated/instructions/createSubaccord.ts`

## Acceptance Criteria

- [ ] Inventory deployed and published clients, CPI consumers, Canon binaries, SDK versions, and transaction builders affected by the account/data-layout change.
- [ ] Decide between a versioned `create_subaccord_v2`, a temporary compatibility instruction, or an explicitly atomic hard cutover.
- [ ] Preserve a clean failure/version boundary rather than silently reusing an incompatible discriminator where practical.
- [ ] Define Accord and Canon deployment ordering and rollback behavior.
- [ ] Regenerate and rebuild all IDL, Codama, SDK, Canon, CLI, app, and release artifacts.
- [ ] Add old-client/new-program and new-client/old-program compatibility tests or explicit rejection tests.
- [ ] Document legacy SPL Token-only behavior and the Token-2022 limitation.
- [ ] Update integration/reference documentation and release notes before deployment.
