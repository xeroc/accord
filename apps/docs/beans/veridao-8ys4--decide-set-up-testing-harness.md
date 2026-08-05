---
# veridao-8ys4
title: Decide + set up testing harness
status: completed
type: task
priority: high
created_at: 2026-08-03T23:10:13Z
updated_at: 2026-08-04T03:45:00Z
parent: veridao-wyso
---

Resolve safe-solana-builder Step 1b: LiteSVM (fast Rust unit/TDD) vs jest/Surfpool (integration). Likely both. Wire the chosen harness into programs/accord + tests/. Block: nothing. Acceptance: a hello-world instruction round-trips RED->GREEN through the harness.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.

## Design decisions

- **Both harnesses, complementary** (resolves the "open decision" in the milestone):
  - **LiteSVM** (`programs/accord/tests/*.rs`, `make test_unit`) — fast in-process
    Rust unit/TDD per instruction. No validator; deterministic; full sysvar/clock
    control.
  - **jest + Surfpool** (`tests/`) — full e2e: CPI chains, VRF, real
    validator behaviour.
- **Wiring: `anchor-litesvm` 0.1.x.** This is the ONLY line pinned to anchor-lang
  0.31 (0.2+ jumped to anchor 1.x; raw litesvm 0.11/0.15 pull a solana-crate split
  that doesn't compile against anchor 0.31 — verified). It wraps litesvm 0.6 with a
  single, self-consistent solana-2.x dep set and a typed Anchor builder
  (`ctx.program().request().accounts(..).args(..).instruction()` ->
  `ctx.execute_instruction(ix, &[&kp]).assert_success()`).
- **`references/litesvm.md` (safe-solana-builder) stays the checklist/pattern
  authority** for every subsequent instruction bean (happy/auth/reinit/time-lock/
  arithmetic/closure, sysvar, CU) — wiring differs, concepts don't.
- **`--features no-entrypoint`** for Rust tests: the program's `entrypoint!`
  symbol collides with a builtin when the program crate is statically linked into
  the test binary. The `.so` (built separately WITH the entrypoint) is what
  LiteSVM loads. `make test_unit` does both.
- **Program id:** the placeholder `1111..111` collides with SystemProgram and
  makes litesvm dispatch to the wrong program (`InstructionFallbackNotFound`).
  Provisioned a real keypair by hand (`solana-keygen`) ->
  `5DjgEFpkzXk37uENkfGptfARTEmr4aUoZXcSAXMYKzLZ`; `declare_id!` + `Anchor.toml`
  updated. (`anchor build` would normally do this; it's blocked — see toolchain
  note.)

## Summary of Changes

- `programs/accord/Cargo.toml` — added `anchor-litesvm 0.1` + `solana-sdk 2` as
  `cfg(not(target_os = "solana"))` dev-dependencies.
- `programs/accord/src/lib.rs` — added the `health` instruction (liveness probe +
  harness anchor), `Health` accounts struct (`Signer` named `caller`), and
  `HealthChecked` event; set a real `declare_id!`.
- `programs/accord/tests/health_litesvm.rs` — LiteSVM test that round-trips
  `health` (RED -> GREEN, proven). Documents the dual-harness decision + dev loop.
- `Makefile` — `test_unit` target: `cargo build-sbf --tools-version v1.52` then
  `cargo test --features no-entrypoint`.
- `AGENTS.md` — Testing Instructions section rewritten to record the decision,
  the `no-entrypoint` convention, and the platform-tools v1.52 toolchain note.
- `Anchor.toml` — real program id in `[programs.localnet]/[programs.devnet]`.

## Acceptance — MET

`health` round-trips RED -> GREEN through the LiteSVM harness:
`make test_unit` -> `test health_round_trips ... ok`. `cargo fmt` clean; `cargo
clippy` clean (only pre-existing Anchor `cfg` macro noise). `cargo test --lib`
passes Anchor's generated `test_id`.

## Follow-up

- `veridao-cr11` (draft) — `anchor build` is still blocked (bundled cargo 1.84 <
  edition2024), so the jest/Surfpool path and IDL generation don't work yet. The
  LiteSVM path is fully functional via `make test_unit`.
