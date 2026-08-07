# `@accord/sdk` — Codama codegen + Solana Kit runtime + custom facade

## Status

**Accepted.** The canonical TypeScript client for the Accord program is generated
from the Anchor IDL with Codama (`@codama/renderers-js` → Solana Kit), wrapped by
a hand-written `Accord` facade that owns domain logic and multi-instruction
orchestration. This ADR is the **build handoff** for the implementing agent;
milestone `veridao-<sdk>` `## HANDOFF` references it.

## Context

The Accord program (ADR-0001…0009, bean `veridao-rlno`) ships ~21 instructions
across eight logical groups — Subaccord lifecycle, staking, dispute intake,
snapshot trust, VRF-backed draw, commit-reveal voting, finalization, and appeal.
The SDK is the **primary consumer surface**:

- **Arbitrables** integrate via two methods: `create_dispute` (CPI from their
  program) and `get_ruling` (lazy read). This is the load-bearing external API.
- **Frontends / indexers** drive the dispute lifecycle end to end.
- **The cranker** runs `finalize_*` and retries `draw` on collision.

Raw codegen cannot express what makes the SDK useful, because the hard parts are
**orchestration and client-side cryptography**, not account wiring:

- `commit` requires `hash(vote ‖ salt ‖ juror_pubkey)` computed off-chain.
- `draw` requires assembling `memberships: Vec<JurorMembership>` from the
  finalized MST snapshot (ADR-0009) — proof + cumulative-range computation.
- `request_vrf → commit_vrf_callback → draw` is a multi-tx choreography with
  retry-on-collision (`draw_attempt++`).
- `propose_subaccord_update → execute_subaccord_update` is a timelock-aware
  two-tx flow (48h `execute_after_slot`).
- `stake` requires an associated token account + transfer; `unstake` is blocked
  while `active_draws > 0`.

So the architecture is **two layers**: a generated, drift-free client (Codama)
and a thin hand-written facade (domain logic). The runtime stack is
**Solana Kit** (`@solana/kit` and granular `@solana/{rpc,transactions,addresses,
codecs,keys}` packages) — **not** `@solana/web3.js`. web3.js is retired from the
SDK package; new code is written against Kit.

## Decision

### Pipeline

```
anchor build --ignore-keys
  └─ target/idl/accord.json          (Anchor IDL, program RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe)

codama  (packages/sdk/codama.json points at the Anchor IDL; auto-converts to Codama IDL)
  └─ codama run js  →  @codama/renderers-js
       └─ packages/sdk/src/generated/   (committed; Kit-shaped client: codecs, Ix builders, account fetchers)
```

Codama accepts the Anchor IDL directly and converts it; no separate Codama macro
extraction is required for v1. The generated tree is **committed** (library
consumers must not need `codama` installed) and regenerated via a Makefile target
that runs after `anchor build`.

### Layers

```
packages/sdk/src/
  generated/      ← Codama output (regen, not hand-edited)
  accord.ts       ← Accord facade class — composes the layers below
  wallet.ts       ← Keypair | IWallet  →  Kit Signer + transaction signer adapter
  pda.ts          ← canonical PDA derivations (seeds sourced from programs/accord/src/state.rs)
  constants.ts    ← v1 defaults (windows, alpha, min stake, panel sizes) — ADR table in AGENTS.md
  errors.ts       ← typed mapping of AccordError codes (from errors.rs)
  types.ts        ← domain enums (DisputeState, SnapshotStatus, RoundKind, …)
  fetch.ts        ← typed account fetchers (Subaccord, Dispute, Snapshot, Round, JurorStake, PauseState)
  methods/
    lifecycle.ts  ← create_subaccord, propose/execute_subaccord_update, pause quartet
    staking.ts    ← stake, unstake (+ ATA/transfer wiring, active_draws guard)
    dispute.ts    ← create_dispute, get_ruling  (Arbitrable CPI API)
    snapshot.ts   ← post/challenge/finalize_snapshot + MST membership/proof helpers
    vrf.ts        ← request_vrf → commit_vrf_callback → draw choreography + memberships builder
    voting.ts     ← commit (hash helper) / reveal / finalize_round / finalize_dispute
    appeal.ts     ← appeal / claim_appeal_refund
```

Each `methods/*.ts` module is **standalone** — it exports async functions that
take the generated client + args. `accord.ts` (built once in the Foundation task)
pre-wires delegation to every module; a facade-method task therefore adds a file
and fills its body without touching a shared class. This keeps facade tasks
parallel-safe (separate files) under fleet dispatch.

### Runtime stack

- `@solana/kit` (umbrella) or granular `@solana/rpc`, `@solana/rpc-types`,
  `@solana/transactions`, `@solana/addresses`, `@solana/keys`, `@solana/codecs`.
- `bn.js` for all u64 amounts (matches the Rust `u64` field types).
- The SDK package **does not** import `@coral-xyz/anchor`'s `Program` client nor
  `@solana/web3.js`. (`@anchor-lang/core` is the correct Anchor-1.0.2 TS package
  name and remains the toolchain's IDL source on the Rust side; it is not an SDK
  runtime dependency under this architecture. The exact dep set is finalized in
  the Foundation task.)

### Build integration

Add to `Makefile` (the root orchestrator; no root `package.json` scripts):

```make
codegen: ## Regenerate the Codama Kit client from the Accord IDL (run after `anchor build`)
 anchor build --ignore-keys
 cd packages/sdk && codama run js

sdk: ## Build the SDK package only
 cd packages/sdk && pnpm run build
```

`make build` gains a `codegen` step so the generated client is always fresh.

## Considered Options

- **Hand-written Anchor/web3.js facade** (the original suggestion, mirroring a
  prior project's pattern): mature, matches the repo's prior stack. Rejected — we
  are standardizing on Solana Kit (web3.js is not an argument against Kit), and
  we want Codama's drift-free multi-language client generation.

- **Raw Codama client, no facade**: zero hand-written code, fully regenerated.
  Rejected — loses every orchestration helper above (commit hash, memberships
  builder, VRF choreography, timelock flows, stake ATA wiring). Those are the
  SDK's actual value; they are hand-written on top of *any* generated client.

- **Codama + Solana Kit + custom facade** (chosen): generated client removes the
  per-instruction boilerplate and drift; the facade owns the logic Codama can't
  express. Multi-language clients (Go/Rust/Python via other renderers) become
  available later without touching the canonical JS SDK — non-lock-in.

## Consequences

- **A codegen step enters the build.** `make codegen` runs `anchor build` then
  `codama run js`. The generated tree is committed and regenerated on IDL
  change; the TDD loop for SDK features is "regen → write facade/test → build."

- **The jest/Surfpool suite drives the Kit SDK.** The `tests/` harness is
  scaffolded but empty; SDK integration tests will be the first real jest files
  and exercise the facade against Surfpool's JSON-RPC (Kit's `@solana/rpc`
  speaks standard JSON-RPC, Surfpool-compatible).

- **Facade owns client-side cryptography.** `voting.commit` hash, `snapshot`
  MST membership assembly (ADR-0009 leaf/proof format), and VRF-choreography
  state live in the SDK and must be unit-tested independently of the chain.

- **`@anchor-lang/core` / web3.js leave the SDK package.** Migration of any
  existing web3.js usage elsewhere is a separate follow-up; the SDK package is
  Kit-only from day one.

- **Drift protection is automatic.** Regenerating on IDL change keeps the client
  in sync; the facade imports typed codecs/builders so account-shape changes
  surface as compile errors.

## Build handoff (for the implementing agent)

### Pipeline commands (exact)

```sh
make codegen        # anchor build → packages/sdk/codama run js → src/generated/
make sdk            # tsc build of packages/sdk
cd packages/sdk && codama run js     # regen only
```

`packages/sdk/codama.json` (create in Foundation task):

```json
{ "idl": "../../target/idl/accord.json", "scripts": { "js": ["@codama/renderers-js"] } }
```

### Data contract — sources of truth

- **Instruction surface + args:** `programs/accord/src/lib.rs` (21 `pub fn`s).
- **Account structs / PDA seeds:** `programs/accord/src/state.rs` (PDA seeds for
  `pda.ts`; derive via the generated client's `getProgramAddress` helpers).
- **Error codes:** `programs/accord/src/errors.rs` → `errors.ts`.
- **Domain enums:** `DisputeState`, `SnapshotStatus`, `RoundKind`, `FraudProof`
  variants, `UpdatePayload` — from `state.rs` → `types.ts`.
- **v1 defaults / constants:** AGENTS.md "v1 Defaults" table → `constants.ts`.
- **Orchestration logic (hard parts):**
  - commit hash: `voting.ts` — `sha256(vote_byte ‖ salt[32] ‖ juror_pubkey[32])`.
  - memberships builder: `snapshot.ts` — reconstruct the MST (ADR-0009 leaf
    `{juror, stake, cum_after}`, sorted by pubkey), then for each selected slot
    `r_i` produce the inclusion proof + `JurorMembership`.
  - VRF choreography: `vrf.ts` — `request_vrf` then poll/await
    `commit_vrf_callback`, then `draw(draw_attempt, memberships)`; on
    `SortitionMismatch`/collision, increment `draw_attempt` and retry (same
    committed VRF).
  - timelock: `lifecycle.ts` — `propose_subaccord_update` returns
    `execute_after_slot`; `execute_subaccord_update` is dispatched once the slot
    passes.

### Definition of Done

- [ ] `make codegen` produces `src/generated/` with no manual edits.
- [ ] `Accord` facade exposes all eight method groups; `create_dispute` and
      `get_ruling` are the clean Arbitrable CPI API.
- [ ] Client-side crypto (commit hash, MST memberships) has unit tests.
- [ ] jest integration tests run the full dispute lifecycle against Surfpool.
- [ ] `make lint` and `make sdk` green; `tests/` exercises the Kit SDK.

### Open questions (record an assumption and proceed)

- Exact granular `@solana/*` dep set vs the `@solana/kit` umbrella (Foundation).
- Whether to commit `src/generated/` wholesale or gitignore + regen in CI
  (recommend: commit, regen in `make codegen`).
