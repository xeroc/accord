---
# veridao-mcvw
title: SDK facade adapter — wire Accord shell to generated Codama client (seam impls)
status: completed
type: task
priority: high
created_at: 2026-08-05T00:32:06Z
updated_at: 2026-08-05T00:53:34Z
parent: veridao-5y8e
---

The Accord facade (packages/sdk/src/accord.ts) is a shell: it holds
rpc/signer/client but exposes NO chain-driving methods. Every src/methods/_.ts
module declares a typed seam (AccordDisputeClient, AccordLifecycleClient,
AccordVrfClient, AccordSnapshotClient, AccordStakingClient, AccordVotingClient,
AccordAppealClient) with method names like buildCreateDispute / fetchDispute,
and each says 'Foundation wires the concrete adapter'. No concrete adapter
exists (grep: zero implementors; seam names buildX != generated getXInstruction;
seam fetchers return minimal shaped views vs generated full-account decoders).
So the facade cannot drive any instruction end-to-end. Deliverable: a concrete
adapter implementing every seam against the generated Codama client
(getXxxInstruction builders) + packages/sdk/src/fetch.ts, surfaced as Accord
methods or a single wired client. Unblocks the jest integration suite
(veridao-7iiv). Sources of truth: ADR-0010; packages/sdk/src/accord.ts;
packages/sdk/src/methods/_.ts (seam interfaces);
packages/sdk/src/generated/programs/accord.ts (generated surface).

## Summary of Changes

The Accord facade now drives every instruction end-to-end. A concrete adapter
binds all seven `Accord*Client` seams to the Codama-generated Solana Kit client,
surfaced as `accord.adapter` (raw seam client) and `accord.methods` (bound
orchestration across all eight method groups).

### New files

- **`packages/sdk/src/adapter.ts`** — `createAccordAdapter(accord): AccordAdapter`.
  Implements every seam method 1:1 against the generated `getXxxInstruction`
  sync builders + the generated account fetchers:
  - Builders map seam accounts → generated instruction input, using the facade's
    wallet (`accord.signer`) as the `TransactionSigner` for each signing account.
  - Fetchers unwrap generated accounts into the minimal seam views
    (`DisputeRulingView`, `JurorStakeView`, `committedVrf`, `executeAfterSlot`),
    including Kit `Option<T>` unwrapping.
  - `draw` converts SDK MST `JurorMembership` (32-byte juror) → on-chain args
    (`Address` juror via `getAddressDecoder`) and appends JurorStake PDAs as
    writable remaining-account metas; `finalize_dispute` does the same for its
    remaining accounts.
- **`packages/sdk/src/methods.ts`** — `createAccordMethods(adapter, programId)`
  returning `AccordMethods`: the bound namespace forwarding to every pure
  orchestration function in `src/methods/*.ts`.

### Facade wiring

- **`packages/sdk/src/accord.ts`** — lazy `get adapter()` + `get methods()`
  getters on the `Accord` class.
- **`packages/sdk/src/index.ts`** — re-exports `createAccordAdapter`,
  `AccordAdapter`, `createAccordMethods`, `AccordMethods`.

### Seam extensions (required for faithful generated-client wiring)

The method-module seams were authored before the generated surface landed and
lacked accounts the sync builders require; extended minimally (additive only —
pure orchestration logic untouched, all 43 existing self-checks still green):

- `methods/dispute.ts` `CreateDisputeAccounts`: + `subaccord`, `stakingToken`,
  `vault`, `pauseState`.
- `methods/snapshot.ts` `SnapshotAccounts`: + `stakingToken`, `vault`,
  `posterTokenAccount`; `buildChallengeSnapshot` + `challengeSnapshot`:
  - `challengerTokenAccount`.
- `methods/vrf.ts` `RequestVrfExtras`: + `programIdentity`.

### Verification

- `pnpm --filter @veridao/sdk run lint` (`tsc --noEmit`): **green** — the
  adapter structurally satisfies all seven seams (compile-time proof).
- `pnpm --filter @veridao/sdk run build`: **green**.
- `pnpm --filter @veridao/sdk run test`: **43/43 pass** (no regression to the
  pure MST / commit-hash / sortition self-checks).

### Notes / follow-ups

- Signing model: the facade's loaded wallet is the signer for every
  instruction; multi-party flows construct one `Accord` per signer.
- `request_vrf`'s oracle-specific optional accounts (`vrfProgram`, `slotHashes`)
  are left to the caller / integration suite (magicblock deployment-specific).
- Runtime end-to-end coverage lands in the sibling jest/Surfpool suite
  (veridao-7iiv), now unblocked.
