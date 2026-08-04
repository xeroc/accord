---
# veridao-nhbj
title: Hardening & Formal Spec
status: completed
type: epic
priority: normal
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-03T23:09:55Z
parent: veridao-rlno
blocked_by:
  - veridao-pxr5
---

Security audit pass + formal verification scaffold.

## Tasks

- [x] Apply safe-solana-builder security checklist (shared-base sections as applicable); document High-Risk Decisions (admin keys, upgrade authority, irreversible transitions)
- [x] Create `programs/accord/accord.qedspec`; regenerate formal_verification dir (AGENTS.md Beans)

## Acceptance

Checklist fully applied with file:line findings; qedspec covers invariants (slash math, distinct draw, bond conservation, active_draws balance).

## Summary of Changes

Deliverables (audit + formal-spec scaffold for the Accord v1 program):

- **`programs/accord/security-checklist.md`** — safe-solana-builder `shared-base.md`
  checklist (sections 1–31) applied to the Accord with `file:line` findings. Risk
  level Critical. Headline High-Risk Decisions:

  - **H-1 (Critical):** `draw` accepts a caller-supplied `vrf_result` and does NOT
    verify Switchboard on-chain (`lib.rs:696-744`, no VRF account in the `Draw`
    context) — a cranker can choose the sortition seed. Must wire real VRF before
    mainnet TVL.
  - **H-2 (Critical):** `PauseState.authority` is immutable after `initialize_pause`
    (`lib.rs:74-80`) — no rotation path; key loss/compromise is permanent.
  - **H-5 (Critical):** a voided snapshot permanently stalls the dispute and traps
    the filer fee (`lib.rs:607`, `639-642`, `482-485`) — no re-snapshot path.
  - Plus H-3 (one-step Subaccord authority rotation), H-4 (upgrade authority is
    off-chain policy), H-6 (no-coherent-juror pool surplus trapped), H-7 (snapshot
    fraud proof covers only duplicate-Juror class), and hardening notes on §16
    (window bounds), §17/§23 (no Token-2022/mint validation at `create_subaccord`),
    §18/§29 (unbounded permissionless params). Sections 1–6, 8, 9, 12, 14, 20, 22,
    25, 26, 30, 31 marked satisfied with citations.

- **`programs/accord/accord.qedspec`** — focused formal spec covering the four
  acceptance invariants as qedgen `property` clauses over a flattened State:
  `slash_bounded`, `distinct_panel`, `bond_conservation`,
  `active_draws_{inc_on_draw,dec_on_finalize,untouched_by_claim}`. Slot-parameterized
  handlers (`draw_slot`, `finalize_coherent_slot`, `finalize_incoherent_slot`,
  `claim_appeal_refund`) mirror the on-chain branches. `qedgen check`: **0 errors,
  100% operation coverage** (4/4 ops covered by at least one property). Remaining
  warnings are documented qedgen v2.47 quantifier-lowering limitations (placeholder
  harness bodies) — the declarations are the regression guards; full lowering lands
  when the VRF/param-bounds hardening (H-1, §18) is in and the spec is bound to the
  deployed handlers.

- **`formal_verification/`** — Lean 4 project scaffolded via `qedgen init`
  (lakefile.lean, lean-toolchain v4.24.0, lean_solana/ support lib, Spec.lean).
  `qedgen codegen --lean` (the qedspec to Spec.lean translation) requires the
  Leanstral API/network which is unavailable in this sandbox — the Spec.lean body
  must be regenerated in a Lean-tooled environment (documented). The project
  structure is in place and builds once the translation lands.

- **`programs/accord/.qed/`** — qedgen project pin (`config.json` points at
  `programs/accord/accord.qedspec`) plus `plan/` ledger scaffold.

Verification: `cargo check --manifest-path programs/accord/Cargo.toml` green
(program source untouched by this bean; 15.6s, pre-existing warnings only).
`qedgen check --spec programs/accord/accord.qedspec` green (0 errors).

Follow-ups (non-urgent, draft-worthy): H-1 Switchboard VRF wiring; H-2 pause
authority rotation; H-5 voided-snapshot recovery / fee return; §17/§23 mint
validation + Token-2022 rejection at `create_subaccord`; §18/§29 permissionless
param bounds; full Lean translation of accord.qedspec into Spec.lean.
