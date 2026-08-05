---
# veridao-pxfz
title: '`@veridao/sdk` — Codama + Solana Kit client'
status: completed
type: milestone
priority: normal
created_at: 2026-08-04T21:50:09Z
updated_at: 2026-08-05T03:31:30Z
---

## HANDOFF

Canonical TypeScript client for the Accord program. Generated Solana Kit client (Codama) + hand-written `Accord` facade. **Full spec: ADR-0010** (`apps/docs/docs/adr/0010-sdk-codama-solana-kit-facade.md`) — read it before any task.

### 1. Happy Path

1. `make codegen` runs `anchor build` -> `target/idl/accord.json`, then `codama run js` -> `packages/sdk/src/generated/`.
2. Foundation builds the `Accord` facade shell, wallet adapter, PDA helpers, typed fetchers, constants/errors/types.
3. Facade-method tasks fill `src/methods/*.ts` (one file per instruction group).
4. Tests run the full dispute lifecycle against Surfpool via the Kit SDK.

### 2. Data Contract

- Public surface: `Accord` class; `create_dispute()` / `get_ruling()` (Arbitrable CPI API); per-group modules in `src/methods/`.
- Sources of truth: `programs/accord/src/{lib,state,errors}.rs`; AGENTS.md "v1 Defaults".
- Program ID: `RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe`.
- Runtime deps: `@solana/kit` (+ granular `@solana/*`), `bn.js`. NO `@coral-xyz/anchor` Program client, NO `@solana/web3.js` in the SDK package.
- Generated tree (`src/generated/`) is committed; regen via `make codegen`.

### 3. Edge Cases & Constraints

- Method-group modules are standalone (no shared-class mutation) so facade tasks stay parallel-safe.
- `voting.commit` hash, `snapshot` MST memberships, VRF choreography are CLIENT-SIDE crypto/logic — unit-test independently of the chain.
- `unstake` blocked while `active_draws > 0`; facade surfaces a typed guard.
- `draw` retry: on collision increment `draw_attempt`, reuse the committed VRF (never re-request).
- Never hand-edit `src/generated/`.

### 4. Business Logic (key client-side logic)

- commit: `sha256(vote_byte | salt[32] | juror_pubkey[32])`.
- memberships: rebuild MST (ADR-0009 leaf {juror, stake, cum_after} sorted by pubkey), produce inclusion proof + JurorMembership per selected slot r_i.
- VRF: `request_vrf` -> await `commit_vrf_callback` -> `draw(draw_attempt, memberships)`; retry on mismatch.
- timelock: `propose_subaccord_update` -> wait `execute_after_slot` -> `execute_subaccord_update`.

### 5. Definition of Done

- [ ] `make codegen` produces `src/generated/` with no manual edits.
- [ ] `Accord` facade exposes all eight method groups; `create_dispute`/`get_ruling` are the clean Arbitrable API.
- [ ] Client-side crypto (commit hash, MST memberships) unit-tested.
- [ ] jest runs the full dispute lifecycle against Surfpool via the Kit SDK.
- [ ] `make lint` + `make sdk` green.

### 6. Test Matrix (Given/When/Then)

- Given a finalized snapshot, When the cranker calls draw, Then the SDK assembles correct memberships and the panel is VRF-determined.
- Given a drawn dispute, When a juror commits then reveals, Then the hash verifies and the vote counts.
- Given an Arbitrable, When it calls create_dispute via the SDK, Then the Dispute PDA is initialized and get_ruling returns None until finalized.
- Given staked capital with active_draws>0, When the juror calls unstake, Then the facade rejects before tx (matches on-chain error).

### 7. Open Questions

- Granular `@solana/*` deps vs `@solana/kit` umbrella — decide in Foundation.
- Commit `src/generated/` (recommended) vs gitignore+CI regen.
