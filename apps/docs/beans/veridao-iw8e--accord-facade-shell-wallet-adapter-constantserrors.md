---
# veridao-iw8e
title: Accord facade shell + wallet adapter + constants/errors/types
status: todo
type: task
priority: normal
created_at: 2026-08-04T21:51:39Z
updated_at: 2026-08-04T21:52:57Z
parent: veridao-vxe9
blocked_by:
    - veridao-qlnn
---

Build the facade skeleton. `src/accord.ts`: Accord class holding the generated client + Kit RPC + signer; pre-wire delegation stubs to every src/methods/*.ts module. `src/wallet.ts`: Keypair | IWallet -> Kit Signer + transaction signer adapter. `src/constants.ts`: v1 defaults from AGENTS.md (review/commit/reveal windows, alpha, min stake, panel sizes). `src/errors.ts`: typed map of AccordError codes from programs/accord/src/errors.rs. `src/types.ts`: domain enums (DisputeState, SnapshotStatus, RoundKind, FraudProof variants, UpdatePayload) from state.rs. Decide granular @solana/* deps vs @solana/kit umbrella (Open Question 7). Acceptance: `make sdk` compiles the shell; constants/errors/types match state.rs. See ADR-0010.
