---
# veridao-ja2w
title: stake instruction
status: completed
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-04T03:08:56Z
parent: veridao-wyso
---

SPL transfer staking_token into Subaccord PDA vault; init/update JurorStake (amount). TDD: happy path balance assertions; wrong mint revert; wrong vault owner revert. Security: token-account ownership, fee-on-transfer delta handling.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.

## Summary of Changes

- `programs/accord/src/lib.rs` — added the `stake` instruction + `Stake` accounts
  struct. SPL-transfers `amount` from the Juror's ATA into the **Subaccord PDA's**
  vault ATA (lazily created via `init_if_needed` + `associated_token` on first
  stake). `JurorStake` PDA init'd on first stake, topped up thereafter
  (`active_draws` intentionally never touched). Credits the **actual vault delta**
  after reload (fee-on-transfer safe: Token-2022 transfer fees). Enforces the
  ADR-0007 circuit breaker (`require!(!paused)`).
- `Cargo.toml` (workspace) — enabled `init-if-needed` on anchor-lang; added
  `anchor-spl` (`token` + `associated_token` features).
- `programs/accord/Cargo.toml` — added `anchor-spl` dep; `spl-associated-token-account`
  - `spl-token` dev-deps (pinned to litesvm-utils' resolved versions) for vault
  ATA derivation + balance assertions.
- `programs/accord/tests/stake_litesvm.rs` — 6 LiteSVM tests: happy (vault funded,
  source debited, JurorStake credited), top-up accumulates + active_draws
  preserved, wrong mint reverts, wrong vault owner reverts, pause blocks stake,
  zero amount reverts.

## Design decisions

- **`init_if_needed` for JurorStake + vault ATA.** Top-up staking is core to the
  product, and the vault must exist before any stake — lazily creating both on
  first stake avoids a separate init-vault instruction and a deployment-ordering
  footgun. Safe here: both accounts are zero-fill on init with no privileged init
  logic (Anchor's discriminator check prevents the classic re-init exploit).
- **Vault = Subaccord PDA's ATA** (wallet = subaccord PDA), so the program can
  PDA-sign transfers out on `unstake`/redistribution. Passively created by the
  first stake.
- **Fee-on-transfer delta accounting**: `vault.reload()` after the CPI, credit
  `after - before` rather than the nominal `amount`. Correct under Token-2022
  transfer fees (and a no-op for feeless SPL token). The `Staked` event reports
  the credited delta.
- **`active_draws` never assigned in stake** — it is 0 on fresh init and
  preserved on top-up. A regression test mutates it to 2 on-chain and verifies a
  subsequent stake leaves it at 2.
- **Pause enforcement included now** (ADR-0007): stake requires the read-only
  `pause_state` PDA and reverts when paused. The pause bean explicitly listed
  stake as a halted instruction; wiring it here avoids a later retrofit.
- **No `min_stake` enforcement at stake time** — min_stake is a draw-eligibility
  threshold (enforced in the draw/snapshot beans), not a stake gate. Allowing
  incremental sub-min stakes supports dollar-cost staking; a sub-min stake simply
  isn't drawable. (ponytail: trust-boundary validation stays, courtesy checks don't.)

## Acceptance — MET

TDD RED->GREEN: `make test_unit` green (6 new + 19 existing = 25 tests).
`cargo fmt --check` clean; `cargo clippy --features no-entrypoint --tests`
clean (only pre-existing Anchor `cfg` macro noise). `make lint` clean.
