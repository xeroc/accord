---
# veridao-7iiv
title: jest integration suite vs Surfpool (Kit SDK)
status: todo
type: task
priority: normal
created_at: 2026-08-04T21:52:11Z
updated_at: 2026-08-04T22:25:02Z
parent: veridao-5y8e
blocked_by:
    - veridao-gqzm
    - veridao-vxe9
---

First real jest files in tests/. Drive the Accord facade end-to-end against Surfpool via @solana/rpc (standard JSON-RPC, Surfpool-compatible). Cover the full dispute lifecycle per milestone test matrix: create_subaccord -> stake -> create_dispute -> snapshot -> VRF/draw -> commit/reveal -> finalize -> get_ruling; plus appeal, unstake guard, timelock update. Acceptance: `pnpm --filter @veridao/tests test` green against `make run_surfpool`. See ADR-0010.

## Blocker — cannot proceed, acceptance unsatisfiable today (2026-08-05)

**Status: BLOCKED. Not completed. Bean left in-progress; `hordr done` intentionally
NOT called (no completion to signal). Requires human re-dispatch once dependencies
land.**

The acceptance criterion — drive the `Accord` SDK facade end-to-end, full dispute
lifecycle, `pnpm --filter @veridao/tests test` green — cannot be met because the
SDK the suite is supposed to drive **does not exist yet**. Verified in worktree
`veridao-5y8e`:

- `packages/sdk/src/index.ts` is a 661-byte stub exporting only `SDK_NAME` and
  `SDK_VERSION`. No `Accord` class, no `methods/`, no `wallet.ts`/`pda.ts`/
  `constants.ts`/`errors.ts`/`types.ts`/`fetch.ts`.
- `packages/sdk/src/generated/` — does not exist (Codama codegen never ran).
- `target/idl/accord.json` — does not exist (program not built in this worktree).
- No `node_modules` at repo root, `packages/sdk`, or `tests` (deps never installed).

The bean graph confirms this is a premature dispatch. This task's parent epic
`veridao-5y8e` (Tests & release) is `blocked_by: [veridao-gqzm]` (Facade methods
& domain logic), which is itself `blocked_by: [veridao-vxe9]` (SDK foundation &
codegen). Both are `status: todo`. The entire SDK surface is unbuilt:

- `veridao-qlnn` (Codama codegen pipeline + generated Kit client) — todo
- `veridao-iw8e` (Accord facade shell + wallet adapter + constants/errors/types) — todo
- `veridao-690e` (Canonical PDA helpers) — todo
- `veridao-zxuv` (Typed account fetchers) — todo
- `veridao-erv7` (Subaccord lifecycle methods) — todo
- `veridao-o8ki` (Staking methods) — todo
- `veridao-rrxs` / `veridao-dsc2` (dispute intake / snapshot + MST helpers) — todo
- `veridao-j7tx` / `veridao-fr1x` (VRF choreography / draw) — todo
- `veridao-a0mc` / `veridao-pq1s` (voting / ruling) — todo
- `veridao-50qy` (Arbitrable CPI API: create_dispute + get_ruling) — todo
- `veridao-yny6` (Appeal & refund methods) — todo

The Accord program itself (Rust, `programs/accord/`) is fully implemented — 21
instructions across all 8 groups, with passing LiteSVM unit tests in
`programs/accord/tests/*_litesvm.rs`. The gap is purely the TypeScript client.

### Why I did not fabricate the suite anyway

Writing the lifecycle tests against a non-existent facade would be speculative
slop: the code could not compile (no `@veridao/sdk` exports to import), could not
run green (the acceptance's defining property), and would encode an invented API
shape that the facade-method beans would then have to match or rewrite. That
violates YAGNI, "no speculative abstractions", and the bean's own acceptance
(verify green). It would also race the facade-method tasks: if they choose
different method signatures, the fabricated tests are discarded — wasted work.

### Why I did not build the SDK facade within this bean either

That would consume ~11 other beans' explicitly-decomposed scope (the entire
`veridao-vxe9` + `veridao-gqzm` epics), violating "Do ONLY that task's work" and
the fleet's parallel-safe per-module decomposition (ADR-0010: "each `methods/*.ts`
module is standalone ... a facade-method task therefore adds a file and fills its
body without touching a shared class"). The SDK is intentionally split across
dispatchable beans; re-collapsing it into the tests bean defeats the fleet model.

### What is genuinely unblocked and reusable (for whoever picks this up next)

Once the SDK lands, this bean's work is mechanical against the milestone test
matrix (ADR-0010 § Test Matrix, reproduced in the milestone HANDOFF). The Rust
LiteSVM tests in `programs/accord/tests/` are the per-instruction oracle for
account shapes, arg layouts, and expected state transitions — they already encode
the full lifecycle (see `stake_litesvm.rs`, `create_dispute_litesvm.rs`,
`snapshot_litesvm.rs`, `draw_litesvm.rs`, `voting_litesvm.rs`, `appeal_litesvm.rs`,
`unstake_litesvm.rs`, `update_litesvm.rs`) and are the correct reference for the
TypeScript integration tests. The `health` instruction (`lib.rs:61`) is the
natural first smoke test for the harness↔Surfpool↔program pipeline.

### Recommended unblock path for the operator

1. Dispatch `veridao-vxe9` (SDK foundation) — unblocks `veridao-qlnn`, `iw8e`, `690e`, `zxuv`.
2. Dispatch `veridao-gqzm` (facade methods) — unblocks the 8 method-group tasks.
3. Re-dispatch `veridao-7iiv` (this bean) once `veridao-gqzm` lands. The `blocked_by`
   added below keeps it out of the ready queue until then.

The `blocked_by: [veridao-gqzm, veridao-vxe9]` lines in the frontmatter above make
the task-level dependency explicit (the parent epic already carried it, but the
task did not).
