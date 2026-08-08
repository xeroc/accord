---
# accord-sqve
title: Avoid too_many_arguments in contract
status: completed
type: task
priority: normal
created_at: 2026-08-06T22:10:52Z
updated_at: 2026-08-06T22:42:36Z
---

Avoid too too_many_arguments by using a distinct struct instead:

Good practice — wrap it. That `#[allow(clippy::too_many_arguments)]` is basically a code smell marker telling you the same thing clippy is telling you. A few concrete reasons this matters more in Solana/Anchor specifically:

**1. Instruction data size and serialization overhead**
Every one of those args gets Borsh-serialized into the instruction data individually when scalar, but if you group them into a struct, you get the same wire format (Borsh serializes structs field-by-field anyway) — so no size penalty either way. The win isn't wire size, it's ergonomics and safety.

**2. Argument-order bugs**
With 14 positional params — several of which are same-typed (`u64`, `u16`, `u8`, `u32`) sitting next to each other — it's very easy for a client or another instruction handler to transpose `review_window`/`commit_window`/`reveal_window` or `min_stake`/`fee_per_juror` and have it compile fine. A struct with named fields forces call sites to be explicit (especially if you build the struct with named-field syntax rather than positional).

**3. IDL / client codegen readability**
Anchor's IDL will list 14 flat args either way, but TS/client-side, a struct becomes one named object (`CreateSubaccordParams`) instead of a 14-argument positional call. Much harder to misuse from the client too.

**4. Extensibility (relevant given your ADR-0005 propose/execute pattern)**
Since you note most of these params later get mutated through a propose/execute governance flow, you'll likely want a matching `UpdateSubaccordParams`-style struct for that path anyway (or at least a way to diff "what changed"). Defining the params struct once now means you can reuse/derive from it later, and diffing two struct instances is much cleaner than diffing two 14-arg call signatures.

**5. Stack/CU cost**
Negligible either way at this arg count — not a real driver of the decision on Solana (unlike, say, going from 14 args to 40 where you could actually hit stack frame issues in BPF). Don't over-index on this.

A pattern that works well in practice:

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateSubaccordParams {
    pub risk_type: [u8; 32],
    pub evidence_spec: [u8; 32],
    pub staking_token: Pubkey,
    pub min_stake: u64,
    pub jurors_per_dispute: u32,
    pub alpha_bps: u16,
    pub review_window: u64,
    pub commit_window: u64,
    pub reveal_window: u64,
    pub max_appeals: u8,
    pub fee_per_juror: u64,
    pub authority: Pubkey,
    pub evidence_operator: Pubkey,
    pub depth: u8,
}

pub fn create_subaccord(ctx: Context<CreateSubaccord>, params: CreateSubaccordParams) -> Result<()> {
```

One caveat: since `risk_type` and `evidence_spec` are used as PDA seeds, double check that Anchor's `#[instruction(...)]` seed macro can still destructure them off the struct in your `Accounts` context (it can — you just reference `params.risk_type` etc. in the seeds — but it's slightly less ergonomic than having them as bare top-level args, so some teams keep seed-relevant args positional/separate and bundle only the "everything else" into a params struct). Given you only have two seed-driving fields here, that hybrid is worth considering too:

```rust
pub fn create_subaccord(
    ctx: Context<CreateSubaccord>,
    risk_type: [u8; 32],
    evidence_spec: [u8; 32],
    params: CreateSubaccordParams, // the other 12 fields
) -> Result<()>
```

That keeps seed derivation dead simple in the `Accounts` macro while still killing the too-many-arguments smell.

## NOTES

- make sure to apply this schema to all instructions with too_many_arguments!
- ensure that you update the IDL, generate the new typescript interface with codama and updat ethe SDK facade
- ensure the e2e tests/ survive this change! Make the corresponding changes!

## Summary of Changes

Grouped `create_subaccord`'s 12 non-seed args into a `CreateSubaccordParams` struct (bean accord-sqve), keeping `risk_type` + `evidence_spec` positional since `risk_type` drives the Subaccord PDA seed.

- `programs/accord/src/state.rs`: added `CreateSubaccordParams` (12 fields) next to `UpdatePayload`.
- `programs/accord/src/lib.rs`: `create_subaccord` now takes `(ctx, risk_type, evidence_spec, params: CreateSubaccordParams)`; dropped `#[allow(clippy::too_many_arguments)]`.
- `programs/accord/tests/accumulator_litesvm.rs`: 2 ix-args call sites wrapped into `params: CreateSubaccordParams { ... }`.

Scope decisions:

- `verify_and_recompute` (lib.rs:1840) is an internal helper, not an instruction — it already carries a `ponytail:` justification for its 8 args and has one caller. Left as-is; the bean targets the instruction wire surface.
- IDL regenerated via `anchor build`; Codama codegen (`make codegen`) flattens struct-typed instruction args on the wire, so the generated TS instruction types, the SDK facade (`CreateSubaccordArgs`), the adapter (`mapCreateSubaccordArgs`), and every e2e call site are byte-identical — no SDK/test changes required.

Verified: `make test_unit` (39 LiteSVM tests green), `cargo clippy --features no-entrypoint` (no `too_many_arguments`), `@accord/sdk` lint (tsc --noEmit) clean. Pre-existing evidence-daemon prettier + test-tsc Kit-generic failures confirmed unrelated.
