---
# veridao-iw8e
title: Accord facade shell + wallet adapter + constants/errors/types
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:39Z
updated_at: 2026-08-05T01:10:00Z
parent: veridao-vxe9
blocked_by:
  - veridao-qlnn
---

Build the facade skeleton. `src/accord.ts`: Accord class holding the generated client + Kit RPC + signer; pre-wire delegation stubs to every src/methods/_.ts module. `src/wallet.ts`: Keypair | IWallet -> Kit Signer + transaction signer adapter. `src/constants.ts`: v1 defaults from AGENTS.md (review/commit/reveal windows, alpha, min stake, panel sizes). `src/errors.ts`: typed map of AccordError codes from programs/accord/src/errors.rs. `src/types.ts`: domain enums (DisputeState, SnapshotStatus, RoundKind, FraudProof variants, UpdatePayload) from state.rs. Decide granular @solana/_ deps vs @solana/kit umbrella (Open Question 7). Acceptance: `make sdk` compiles the shell; constants/errors/types match state.rs. See ADR-0010.

## Summary of Changes

### Open Question 7 resolved: `@solana/kit` umbrella only

The codegen task (veridao-qlnn) set `kitImportStrategy: "rootOnly"` — all
generated code imports from `@solana/kit`. This task confirms that decision:
no granular `@solana/*` packages needed. Removed `@anchor-lang/core`,
`@solana/web3.js`, `@solana/spl-token` from the SDK deps (ADR-0010: Kit-only).

### Files created

- **src/accord.ts**: `Accord` class — holds Kit RPC + `TransactionSigner` +
  extended client (via `accordProgram()`). Exposes `client.accord.{accounts,
instructions,pdas}` for method tasks to build on.
- **src/wallet.ts**: `IWallet` interface (publicKey + signMessage),
  `signerFromKeypairBytes` (Kit KeyPairSigner factory), `signerFromWallet`
  (adapts IWallet → Kit TransactionPartialSigner).
- **src/constants.ts**: v1 defaults from constants.rs + AGENTS.md —
  MAX_JURORS/MAX_APPEALS/MAX_OPTIONS, timelocks, windows, alpha, panel ladder
  functions (`panelSizeForRound`, `maxAppealPanelSize`).
- **src/errors.ts**: `AccordErrors` const record — 47 error variants with
  sequential codes (6000+i) and messages matching errors.rs exactly.
- **src/types.ts**: Re-exports domain types from `./generated/types/`
  (DisputeState, SnapshotStatus, UpdatePayload, FraudProof, JurorMembership,
  LeafClaim, MSTNode) — no hand-written duplicates.
- **src/methods/{lifecycle,staking,dispute,snapshot,vrf,voting,appeal}.ts**:
  7 stub files (doc comments only) — facade-method tasks fill these.
- **src/index.ts**: Barrel exports for the full public surface.

### Verification

- `make lint` exits 0.
- `make sdk` exits 0 (dist/ emitted with all modules).
- Runtime smoke: constants (jurors=3, panels 3→7→31), error codes
  (Unauthorized=6000, ArithmeticOverflow=6046), and messages all match source.
