---
# veridao-ek65
title: create_subaccord instruction
status: completed
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-04T02:47:39Z
parent: veridao-wyso
---

Permissionless; init Subaccord PDA; domain_ref+evidence_spec immutable; store authority (Pubkey::default=immutable) + evidence_operator + all params. TDD: happy path + re-init guard + canonical bump. Security: init-if-needed guard, namespace capture check.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.

## Summary of Changes

- `programs/accord/src/lib.rs` — added the `create_subaccord` instruction
  (permissionless Subaccord init) + `CreateSubaccord` accounts struct. Seeds
  `[SEED_SUBACCORD, creator, domain_ref]`; `init` (not `init_if_needed`)
  gives the re-init guard + namespace-capture prevention for free. Canonical
  bump stored via `ctx.bumps.subaccord`. `domain_ref`/`evidence_spec` are
  the immutable identity hashes; `authority == Pubkey::default()` => immutable
  (ADR-0005). Namespace guard rejects `domain_ref == [0;32]`. Emits
  `SubaccordCreated`.
- `programs/accord/tests/create_subaccord_litesvm.rs` — 5 LiteSVM tests:
  happy (all fields persist), re-init at same PDA fails, canonical bump ==
  find_program_address bump, zero domain_ref rejected, same-creator different
  domain_ref yields distinct coexisting PDAs.

## Design decisions

- **Re-use `InvalidOptions` error** for the zero-`domain_ref` namespace guard
  rather than adding a new variant — it's a degenerate-identity rejection and
  the existing message covers it. No new error/event needed (state bean already
  provisioned `SubaccordCreated`).
- **`init` over `init_if_needed`** — the re-init guard and namespace-capture
  prevention are both free, and `init_if_needed` would require a manual
  `require` on discriminator/owner. Matches the pause instruction pattern.
- **`domain_ref` first in the arg list** so the `#[instruction]` attribute on
  `CreateSubaccord` stays minimal (only the seed-referenced arg is declared).
- **No param-validation beyond the namespace guard** — jurors_per_dispute /
  windows / alpha are creator-owned, opt-in, and fully mutable via
  propose/execute (ADR-0005); misconfig only harms the creator's own pool.
  Kept validation to the security-relevant trust-boundary check (ponytail:
  trust-boundary validation stays, courtesy checks don't).

## Acceptance — MET

TDD RED->GREEN proven: `make test_unit` green (5 new + 14 existing = 19 tests).
`cargo fmt --check` clean; `cargo clippy --features no-entrypoint --tests`
clean (only pre-existing Anchor `cfg` macro noise). `make lint` clean.
