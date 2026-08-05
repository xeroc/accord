---
# veridao-7iiv
title: jest integration suite vs Surfpool (Kit SDK)
status: todo
type: task
priority: normal
created_at: 2026-08-04T21:52:11Z
updated_at: 2026-08-05T00:35:02Z
parent: veridao-5y8e
blocked_by:
    - veridao-mcvw
---

First real jest files in tests/. Drive the Accord facade end-to-end against Surfpool via @solana/rpc (standard JSON-RPC, Surfpool-compatible). Cover the full dispute lifecycle per milestone test matrix: create_subaccord -> stake -> create_dispute -> snapshot -> VRF/draw -> commit/reveal -> finalize -> get_ruling; plus appeal, unstake guard, timelock update. Acceptance: `pnpm --filter @veridao/tests test` green against `make run_surfpool`. See ADR-0010.

## RE-EVALUATION (2026-08-05) — supersedes the prior blocker below

**Status: still NOT completable. `hordr done` intentionally NOT called. Prior
"SDK does not exist" blocker is RESOLVED (epics `veridao-gqzm` + `veridao-vxe9`
landed; git log shows the merges). Two NEW, different blockers now apply. The
prior claim "once the SDK lands this work is mechanical" is proven FALSE.**

### What now EXISTS (the prior blocker's premises are stale)

Verified in worktree `veridao-5y8e`:

- `packages/sdk/src/index.ts` — 108 lines, re-exports the full facade surface.
- `packages/sdk/src/accord.ts` — the `Accord` class exists.
- `packages/sdk/src/{wallet,pda,constants,errors,types,fetch}.ts` — all present.
- `packages/sdk/src/generated/{accounts,errors,instructions,pdas,programs,types}/` — Codama tree committed; `generated/programs/accord.ts` exposes all 21 instruction builders (`getCreateDisputeInstruction`, `getDrawInstruction`, …).
- `packages/sdk/src/methods/{dispute,lifecycle,staking,snapshot,vrf,voting,appeal}.ts` — all 8 modules present, each with a sibling `*.test.ts` (pure unit tests: hardcoded vectors / mock seams, run via `node:test`, NOT chain tests).

So the SDK _files_ are built. The blockers are elsewhere.

### Blocker A — the `Accord` facade is a shell; no seam adapter exists (code gap)

`packages/sdk/src/accord.ts:36-53` defines `Accord` with exactly four members:
`PROGRAM_ID`, `rpc`, `signer`, `client`. **Zero chain-driving methods.** It never
calls any `methods/*.ts` function.

Every methods module declares a typed seam and off-hand says _"Foundation wires
the concrete adapter"_ — but no such adapter was ever written:

- `methods/dispute.ts:87` `AccordDisputeClient.buildCreateDispute` / `fetchDispute`
- `methods/lifecycle.ts:218` `AccordLifecycleClient.buildCreateSubaccord` / …
- `methods/vrf.ts:197` `AccordVrfClient.buildRequestVrf` / `buildDraw` / `fetchCommittedVrf`
- `methods/snapshot.ts`, `staking.ts`, `voting.ts`, `appeal.ts` — same pattern.

Grep confirms **zero implementors** anywhere in `packages/sdk/src`. The generated
Codama client exposes differently-named builders (`getCreateDisputeInstruction`,
not `buildCreateDispute`) and full-account fetchers (not the minimal shaped views
the seams declare, e.g. `DisputeRulingView={finalRuling}`). So `AccordClient`
does not satisfy any seam. **The facade cannot build, sign, send, or fetch a
single instruction end-to-end.** Driving it "against Surfpool" is therefore
impossible until an adapter lands.

→ Surfaced as **draft bean `veridao-mcvw`** ("SDK facade adapter — wire Accord
shell to generated Codama client"). This bean is now `blocked_by: [veridao-mcvw]`.

### Blocker B — the VRF tail is environmentally un-runnable on Surfpool (design gap)

The dispute lifecycle from `draw` onward requires committed VRF randomness:

- `lib.rs:793` `request_vrf` — CPIs into `ephemeral_vrf_sdk` (magicblock oracle) via `invoke_signed_vrf`.
- `lib.rs:832-844` `commit_vrf_callback` — **only the VRF program can call this**; the account context pins `vrf_program_identity` to `VRF_PROGRAM_IDENTITY` (Anchor address check). It is the sole setter of `dispute.committed_vrf`.
- `lib.rs:892` `draw` — reads `committed_vrf`; without it → `VrfNotCommitted`.

The Rust LiteSVM tests bypass this by mutating `dispute.committed_vrf` directly
in-process (`mock_commit_vrf`, `tests/draw_litesvm.rs:540-551`). **That is
impossible over JSON-RPC** — you cannot forge the VRF program's signature.

Whether Surfpool can satisfy the magicblock VRF oracle CPI is **unverified**.
`surfpool` is installed (`~/.local/bin/surfpool`, "Start a local Surfnet") but
its ability to simulate the VRF program / oracle queue is unknown. If it cannot,
then `draw → commit → reveal → finalize_round → finalize_dispute → appeal` is
un-runnable on Surfpool as the program is written today, and the "full dispute
lifecycle green against Surfpool" acceptance is unreachable regardless of SDK
work. Resolution option is an **operator decision**, e.g.:

1. Confirm/enable Surfpool VRF oracle simulation (preferred — keeps the env), OR
2. Add a `#[cfg(feature = "local-vrf")]` test bypass to the program
   (direct-commit path), OR
3. Split the suite: run the VRF tail against devnet (where the oracle lives)
   instead of Surfpool.

This is a design/env question above this bean's scope; it is **not** a missing
TS task, so no draft bean was created for it — flagged here for the operator.

### Why I did not fabricate the suite / build the adapter here

- Writing lifecycle tests against a facade that has no driving surface and an
  unverified VRF env would not compile (nothing to import that drives the chain),
  could not run green (acceptance's defining property), and would encode an
  invented adapter API that `veridao-mcvw` would then have to match or rewrite.
  Speculative slop; violates YAGNI + "no speculative abstractions".
- Building the adapter inside this bean would consume `veridao-mcvw`'s explicitly
  decomposed scope — violating "Do ONLY that task's work" and ADR-0010's
  parallel-safe per-module decomposition.

### Genuinely unblocked + recommended path for the operator

1. Dispatch `veridao-mcvw` (facade adapter) — removes Blocker A.
2. Decide the VRF/test-env question (Blocker B): verify Surfpool VRF support, or
   pick option 2/3 above. The `health` instruction (`lib.rs:61`) is the natural
   first smoke test for the jest↔Kit↔Surfpool↔program pipeline once the adapter
   lands; the non-VRF slice (create_subaccord, stake, create_dispute,
   post/challenge/finalize_snapshot, unstake guard, timelock update) can go green
   immediately on `mcvw` landing; the VRF tail depends on (2).
3. Re-dispatch `veridao-7iiv` once both resolve. The `tests/` package also needs
   dep wiring per ADR-0010 (currently has `@anchor-lang/core` + `@solana/web3.js`,
   which ADR-0010 retires; needs `@veridao/sdk` + `@solana/kit`) — that wiring is
   in-scope for this bean when it lands, sibling `veridao-sl3x` owns build/publish.

The Rust LiteSVM tests in `programs/accord/tests/*_litesvm.rs` remain the
per-instruction oracle (account shapes, arg layouts, state transitions) for the
TypeScript integration tests.

---

## PRIOR BLOCKER (2026-08-04, superseded above — kept for audit)

The original blocker asserted the entire SDK was unbuilt (`index.ts` a 661-byte
stub, no `generated/`, no `methods/`, deps uninstalled) and listed
`veridao-{qlnn,iw8e,690e,zxuv,erv7,o8ki,rrxs,dsc2,j7tx,fr1x,a0mc,pq1s,50qy,yny6}`
as todo. That premise is **resolved** — all those modules/beans landed. The
`blocked_by: [veridao-gqzm, veridao-vxe9]` it added is removed from the
frontmatter (both epics are done) and replaced with `blocked_by: [veridao-mcvw]`.
