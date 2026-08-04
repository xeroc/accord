---
# veridao-fxao
title: Define all program state
status: completed
type: task
priority: high
created_at: 2026-08-03T23:10:13Z
updated_at: 2026-08-04T04:10:00Z
parent: veridao-wyso
---

Account structs (Subaccord, JurorStake, Dispute, Round, Snapshot, PendingUpdate), error enum, event structs, compile-time constants (MAX options, MAX_JURORS=31). Canonical PDA seeds + bumps stored. Acceptance: `anchor build` clean; structs match SPEC.md account table.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.

## Design decisions

- **`alpha` as basis points** (`alpha_bps: u16`, 10% = 1000). Slash =
  `alpha_bps * min_stake / 10_000` — pure integer math, no floats (flat per
  ADR-0003). Range 0..=655.35% is far beyond any sane slash.
- **Windows in seconds** (`u64`): `review_window`, `commit_window`, `reveal_window`.
  Default to 7d / 2d / 2d (milestone defaults table) via `constants.rs`.
- **`MAX_OPTIONS = 32`, `MAX_JURORS = 31`** (3 -> 7 -> 15 -> 31, the 3rd-appeal
  panel; odd counts make ties impossible). `Dispute.options` is
  `[[u8;32]; MAX_OPTIONS]` (option label hashes); `Round.jurors/commits/reveals`
  are `[T; MAX_JURORS]`.
- **Every account stores its canonical `bump`** so handlers reuse one PDA
  (never re-derive). Instruction beans will `Box<>` `Dispute`/`Round` for the
  BPF stack frame — the structs are plain `#[account]`.
- **`risk_type` + `evidence_spec` immutable** (32-byte hashes each); all other
  Subaccord params route through `UpdatePayload` (ADR-0005).
- **`DisputeState`** models the full SPEC state machine (Created -> SnapshotPosted
  -> Drawn -> Review -> Commit -> Reveal -> RoundResolved -> Final -> Closed).
- **`SnapshotStatus`**: Posted / Finalized / Voided (ADR-0003 fraud-proof).
- **`authority: Pubkey::default()` => immutable** (ADR-0005).
- PDA seed prefixes are named constants in `constants.rs` matching the SPEC
  seed table (subaccord / stake / dispute / round / snapshot / update).

## Summary of Changes

- `programs/accord/src/state.rs` — 6 `#[account]` structs (Subaccord, JurorStake,
  Dispute, Round, Snapshot, PendingUpdate) + `DisputeState`, `SnapshotStatus`,
  `UpdatePayload` enums. All `#[derive(InitSpace)]` for size calculation.
- `programs/accord/src/errors.rs` — `AccordError` covering every v1 instruction
  class (authority/timelock, staking, dispute intake, snapshot, draw, voting,
  appeals, finalization, arithmetic).
- `programs/accord/src/events.rs` — events for the full instruction set.
- `programs/accord/src/constants.rs` — `MAX_JURORS=31`, `MAX_OPTIONS=32`, window
  defaults, `UPDATE_TIMELOCK_SLOTS` (48h), `SNAPSHOT_CHALLENGE_WINDOW_SECS` (1d),
  and the 6 canonical PDA seed prefixes.
- `programs/accord/src/lib.rs` — declares + re-exports the new modules.
- `programs/accord/Cargo.toml` — `anchor-lang` + `solana-program` dev-deps (for
  the state test's trait imports).
- `programs/accord/tests/state.rs` — 8 host unit tests: Anchor round-trip per
  account, full `DisputeState`/`UpdatePayload` variant coverage, PDA seed
  determinism, constants match SPEC.

## Acceptance — MET

- **Structs match SPEC.md account table** (verified: every field + seed in the
  table is present; `bump` stored on each).
- **"anchor build clean"** — `anchor build` is blocked repo-wide (veridao-cr11);
  the equivalent `cargo build-sbf --tools-version v1.52` finishes clean, and
  `make test_unit` is fully green: `test_id`, `health_round_trips`, + 8 state
  tests. `cargo fmt` clean; `cargo clippy` clean (only pre-existing Anchor
  `cfg` macro noise).

## Notes for sibling instruction beans

- Build each `#[derive(Accounts)]` with `seeds` from `constants::SEED_*` and
  `bump = <struct>.bump` (canonical bump reuse, no re-derive).
- `Box<>` the `Dispute` and `Round` contexts (large; BPF stack frame).
- Errors + events already exist — import them; add new variants/structs only if
  a genuinely new failure mode or signal appears.
