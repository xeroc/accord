---
# veridao-50qy
title: Arbitrable CPI API (create_dispute + get_ruling)
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-05T00:00:00Z
parent: veridao-gqzm
---

src/methods/dispute.ts: the PRIMARY external surface. create_dispute (filed by an Arbitrable via CPI; filer pays full fee) and get_ruling (lazy read returning Option<u8>). Must be the cleanest API in the SDK — external integrators depend on it. Acceptance: create_dispute initializes the Dispute PDA; get_ruling returns None until finalized. See ADR-0010 + test matrix row 3.

## Summary of Changes

Implemented `packages/sdk/src/methods/dispute.ts` — the Arbitrable CPI API surface (`createDispute` + `getRuling`), wired through the package entrypoint (`src/index.ts`).

**Design (ADR-0010).** The module is pure facade orchestration over a typed seam (`AccordDisputeClient`) that the SDK Foundation task (`veridao-iw8e`) wires to the Codama-generated Kit client + typed fetcher. Kit types are imported type-only (erased at runtime); the PDA derivation lazy-imports `@solana/kit` so importing the module never loads the runtime unless needed. No `@solana/web3.js`, no hand-rolled Borsh codecs (those are exactly what the generated client replaces — writing them now would be throwaway).

**Domain logic (real, stable, sourced from the program):**

- `findDisputePda` — `["dispute", filer, nonce.to_le()]` (state.rs:1872) via Kit `getProgramDerivedAddress`.
- `requiredFee` — `jurors_per_dispute * fee_per_juror` with u64 overflow → `null` (mirrors lib.rs:421-423 `checked_mul`).
- `assertValidOptions` — `2..=MAX_OPTIONS`, each `[u8;32]` (lib.rs:418); plus `assertValidEvidenceHash` / `assertValidNonce` guards.
- `disputeSeeds` — pure, deterministic seed construction (the unit-test entry point).
- `getRuling` — fetches the Dispute account and returns `final_ruling` (`number | null`); `null` until `state == Final` and if the account is absent.

**Verification.** `make lint` green; `pnpm --filter @veridao/sdk run build` emits `dist/methods/dispute.{js,d.ts}` cleanly; `pnpm --filter @veridao/sdk run test` → 5/5 (`node --test`) covering seeds construction, fee math (incl. u64 overflow), and option/evidence/nonce validation. Public surface (`createDispute`, `getRuling`, `ACCORD_PROGRAM_ID`, `MAX_OPTIONS`, types) re-exported from `@veridao/sdk` entrypoint and importable by a consumer.

**Dependency note.** The parent epic `veridao-gqzm` is `blocked_by` the foundation epic `veridao-vxe9` (Codama codegen `veridao-qlnn`, pda.ts `veridao-690e`, fetch.ts `veridao-zxuv`, facade shell `veridao-iw8e` — all `todo`). Per ADR-0010 the method modules are standalone seams by design, so `dispute.ts` compiles and its logic is verifiable today; the concrete `AccordDisputeClient` adapter + end-to-end Surfpool integration (test-matrix row 3) land when the foundation does and are exercised by the jest suite (`veridao-7iiv`). Added `@solana/kit` to the SDK deps (declared runtime stack; granular dep set finalized by Foundation).
