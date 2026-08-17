---
# veridao-b2sc
title: unstake instruction
status: completed
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-04T03:13:38Z
parent: veridao-wyso
blocked_by:
    - veridao-ja2w
    - veridao-ek65
---

Withdraw from vault; revert while active_draws>0. TDD: blocked-while-drawn revert; succeeds when active_draws==0; partial withdraw rounding. Security: cumulative cap, exact-remainder accounting.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.

## Dependency note (2026-08-04)

Blocked on `veridao-ja2w` (stake) and `veridao-ek65` (create_subaccord). unstake withdraws from the Subaccord stake-pool vault and decrements a `JurorStake` — both are created by stake/create_subaccord. In this Critical-risk money path the vault-authority + SPL transfer mechanics must be established once (by stake) and reused, not reverse-engineered from a withdrawal built first (risks divergence across stake/unstake/appeals-redistribution). Recommended order: create_subaccord -> stake -> unstake. Left as `todo` + blocked-by so the lane re-dispatches once unblocked.

## Summary of Changes

- `programs/accord/src/lib.rs` — added the `unstake` instruction + `Unstake` accounts
  struct. PDA-signed SPL transfer from the Subaccord PDA's vault ATA to the Juror's
  ATA (`CpiContext::new_with_signer` over the Subaccord seeds + stored bump).
  Reverts while `active_draws > 0` (StakeLocked) and caps the withdrawal at the
  Juror's exact staked balance (InsufficientBalance); exact integer remainder.
- `programs/accord/src/errors.rs` — added `InsufficientBalance` (new failure mode:
  withdrawal > stake; per fxao's note, added only because it is genuinely new).
- `programs/accord/tests/unstake_litesvm.rs` — 6 LiteSVM tests: happy (vault debited,
  juror ATA credited, JurorStake debited), partial withdraw exact remainder, full
  withdraw zeroes balance, over-withdraw reverts, blocked-while-drawn reverts, zero
  amount reverts.

## Design decisions

- **`unstake` is never paused** (no `pause_state` account). ADR-0007 halts only
  create_dispute / stake / appeal; capital must always be withdrawable so a freeze
  can never trap user funds. This is the safer user-protection default.
- **PDA-signed vault withdrawal** reuses the Subaccord PDA (vault wallet) as the
  transfer authority with `new_with_signer` over `[SEED_SUBACCORD, creator,
  domain_ref, bump]` — the canonical bump stored on the account. Establishes the
  PDA-sign-out mechanic that appeals/redistribution will also use.
- **Exact-amount accounting** (not delta): the vault sends exactly `amount` and the
  JurorStake is debited exactly `amount`. For feeless SPL token (v1) vault and
  ledger stay in lockstep; a fee-token gross-up is a v2 concern if/when a Subaccord
  picks a fee mint. `checked_sub` on the money path is belt-and-suspenders (the
  `require` already guarantees `amount <= stake`).
- **No account close on full withdraw** — the JurorStake stays open at amount=0
  (rent reclaim is a separate hardening concern; not requested here).

## Acceptance — MET

TDD RED->GREEN: `make test_unit` green (6 new + 25 existing = 31 tests).
`cargo fmt --check` clean; `cargo clippy --features no-entrypoint --tests` clean
(only pre-existing Anchor `cfg` macro noise). `make lint` clean.
