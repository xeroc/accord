---
# veridao-zxuv
title: Typed account fetchers (fetch.ts)
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:39Z
updated_at: 2026-08-05T01:20:00Z
parent: veridao-vxe9
blocked_by:
  - veridao-qlnn
---

Typed fetchers in `src/fetch.ts` over the generated account codecs: getSubaccord, getDispute, getSnapshot, getRound, getJurorStake, getPauseState (each nullable + throwing variant). Facade methods and tests depend on these. Acceptance: each account type in state.rs has a fetcher returning decoded + typed data. See ADR-0010.

## Summary of Changes

- **src/fetch.ts**: 16 typed fetcher functions covering all 8 account types in
  state.rs (Subaccord, JurorStake, Dispute, Round, Snapshot, PendingUpdate,
  AppealBond, PauseState). Each has a throwing variant (`fetchX`) and a nullable
  variant (`fetchXMaybe`). Thin wrappers over the generated client's
  `addSelfFetchFunctions` — accept the `Accord` facade and delegate to
  `accord.client.accord.accounts.X.{fetch,fetchMaybe}`.
- **src/index.ts**: Added all 16 fetcher exports to the barrel.

### Verification

- `make lint` exits 0.
- `make sdk` exits 0.
