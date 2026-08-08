---
# accord-ewzf
title: "Accumulator — SDK: subtree-sum MST builder, per-seat draw_seat, drop snapshot methods (ADR-0012)"
status: completed
type: task
priority: high
created_at: 2026-08-05T17:12:02Z
updated_at: 2026-08-06T01:35:00Z
parent: accord-g74z
blocked_by:
  - accord-yz7c
---

## Summary of Changes

Rewrote `@accord/sdk` to match the ADR-0012 accumulator IDL produced by
`accord-yz7c`. Regenerated the Codama tree from the rebuilt IDL (`codama run
js`), then adapted the hand-written facade to the subtree-sum accumulator +
per-seat draw + frozen-root VRF flow.

### Generated tree (`src/generated/`)

- Regenerated from `target/idl/accord.json`. Now reflects: `drawSeat`,
  `cancelDispute`, `settleRound` instructions; no `postSnapshot`/
  `challengeSnapshot`/`finalizeSnapshot`/`draw`; no `Snapshot` account;
  `Stake`/`Unstake` data args carry `path`; `CreateSubaccord` carries `depth`;
  `LeafClaim` is `{ juror, stake }` (no `cumAfter`).

### MST builder (`src/methods/mst.ts` — NEW; replaces `snapshot.ts`)

- Subtree-sum accumulator: `leafHash = H(juror‖stake_le)`,
  `nodeHash = H(left_hash‖left_sum‖right_hash‖right_sum)` (sums bound — Bad 5).
- `buildAccumulator(leaves, depth)`, `proofFor(tree, index)` (the client-supplied
  path for stake/unstake), `recomputeRoot`, `verifyMembership` (returns the
  cumulative-from-left prefix for sortition), `emptyRoot(depth)`.
- Byte-exact match to on-chain `mst_leaf_hash`/`mst_node_hash`/`empty_tree_root`/
  `verify_and_recompute`/`verify_membership_and_prefix`. Deleted `snapshot.ts`
  (post/challenge/finalize + the old cumulative-from-left builder).

### staking (`methods/staking.ts`)

- `stake`/`unstake` seams + functions take a `path: MSTNode[]` (ADR-0012). The
  adapter threads it into the generated instruction data args.

### VRF + draw (`methods/vrf.ts`)

- One-shot `draw` → per-seat `drawSeat(seat, membership)`. `vrfSeed` drops
  `draw_attempt`; `seatSlot` derives `r_i` per seat; `findLeafForSlot` resolves
  the winning leaf + proof against a tracked tree; `drawSeat` builds one seat's
  instruction (round `init_if_needed`, JurorStake as remaining_accounts[0]).
- `awaitCommittedVrf` unchanged. Deterministic collision re-rülle (sampling
  without replacement) remains bean `accord-tzo0` — the SDK exposes the
  per-seat primitives it will compose.

### Types / PDA / fetch / errors / constants / index

- `types.ts`: dropped `SnapshotStatus`/`FraudProof`/`JurorMembership` re-exports.
- `pda.ts`: dropped `findSnapshotPda` + `SEED_SNAPSHOT`.
- `fetch.ts`: dropped `fetchSnapshot`/`fetchSnapshotMaybe`.
- `errors.ts`: renumbered to match the new `errors.rs` enum order (accumulator
  block at 18–19; removed the 7 snapshot/fraud variants; added `InvalidMerklePath`,
  `TreeFull`).
- `constants.ts`: dropped `SNAPSHOT_CHALLENGE_WINDOW_SECS`; added
  `DEFAULT_TREE_DEPTH` (20).
- `index.ts`: removed all snapshot exports + `getSnapshotDecoder`; exports the
  MST accumulator builder surface.

### Lifecycle / voting

- `CreateSubaccordArgs` += `depth` (u8) — flows through to the generated ix.
- `VotingAccounts` += optional `stakingToken`/`jurorTokenAccount`/`vault`
  (reveal pays the participation fee — surfaces a pre-existing gap the regen
  exposed as a type error).

### Verification

- `pnpm --filter @accord/sdk run lint` (tsc --noEmit) → 0 errors.
- `pnpm --filter @accord/sdk test` → 42 passed, 0 failed (incl. 6 new
  `mst.test.ts` cases + 5 rewritten `vrf.test.ts` per-seat cases).

Out of scope (separate beans): the `tests/` jest e2e suite rewrite (accord-btel)
and the deterministic collision-free sampling composition (accord-tzo0).

## Why

`packages/sdk` currently implements the ADR-0009 cumulative-from-left MST
builder, the one-shot `draw` choreography, and the snapshot methods
(post/challenge/finalize). ADR-0012 replaces all three. Plus the two locked
decisions: `Dispute.frozen_root` (written by `commit_vrf_callback`; SDK reads
it), `JurorStake` drops `last_change_slot` + gains `tree_index`, `Subaccord`
gains the accumulator fields.

## Scope

- **MST builder → subtree-sum**: node = `H(left_hash ‖ left_sum ‖ right_hash ‖
right_sum)`; `LeafClaim` drops `cum_after` (prefix computed from the path);
  build/proof/verify must match on-chain `verify_mst_inclusion` exactly.
- **Incremental-update helper** (indexer side): produce the client-supplied
  Merkle path for a `stake`/`unstake` against the current root.
- **VRF flow**: `commit_vrf_callback` now also sets `frozen_root`; the SDK reads
  `dispute.frozen_root` for the draw (not a snapshot root).
- **draw choreography → per-seat `draw_seat(i)`**: replaces one-shot `draw`. On
  `SortitionMismatch` the submission was simply wrong — no retry (deterministic
  sampling). Deterministic collision re-roll computed client-side to match the
  chain. Shared with bean `accord-tzo0`.
- **Delete**: `post_snapshot`, `challenge_snapshot`, `finalize_snapshot` methods
  - types (`Snapshot`, `FraudProof`, `SnapshotStatus`, bond flows).
- **Types**: `Subaccord` +`root/total_stake/next_index/depth`; `JurorStake` +`tree_index`, −`last_change_slot`; `Dispute` +`frozen_root`.

## Acceptance

- MST builder unit-test matches on-chain verify on a fixture.
- Per-seat `draw_seat` round-trips end-to-end via the SDK.
- Snapshot methods + types removed from the package entrypoint.
- Types match the rebuilt IDL after `accord-g74z`.

## References

ADR-0012; `accord-g74z`; `accord-tzo0` (per-seat draw + sampling); ADR-0010
(SDK facade).

**Correction (2026-08-06):** the first re-block pointed `blocked_by` at the
parent `accord-g74z` — that is a **deadlock**. A parent can never reach
`completed` while a child is open (status flows up), so a child blocked on its
own parent can never be unblocked. Fixed by creating `accord-yz7c` (the
previously-missing on-chain Rust implementation bean, child of `accord-g74z`)
and repointing this bean's `blocked_by` there. `accord-g74z`'s four original
children were docs / ADRs / SDK / tests — **none owned the Rust program**, which
is the real prerequisite for both the SDK (the IDL it produces) and the tests
(the `.so`).

`accord-yz7c` is `status: draft` pending human review (the on-chain work is
substantial and TDD-pairs with `accord-btel`); promote to `todo` to dispatch it.
`accord-btel` should also block on `accord-yz7c`.

Evidence the prerequisite is unmet (re-verified 2026-08-06):

- `JurorStake` still has `last_change_slot` (state.rs:69); no `tree_index`.
- `Subaccord` has no accumulator fields (`root_hash`/`total_stake`/`next_index`/
  `depth`).
- `Dispute` has `committed_vrf` but no `frozen_root` (state.rs:124).
- `Snapshot` struct + `post_snapshot`/`challenge_snapshot`/`finalize_snapshot`
  instructions still exist (lib.rs:485-792).
- `draw` is still one-shot (no `draw_seat`).
- `verify_mst_inclusion` (lib.rs:1894) is still cumulative-from-left, NOT
  subtree-sum.
- No `target/idl/`, no `target/deploy/*.so`, no `target/types/` — nothing built.

All four acceptance criteria are unmeetable until `accord-yz7c` lands:

1. **"Types match the rebuilt IDL after accord-g74z"** — no IDL exists; the
   `generated/` tree is Codama output produced from it.
2. **"MST builder unit-test matches on-chain verify on a fixture"** — on-chain
   `verify_mst_inclusion` is still the old design; a subtree-sum builder written
   now is an unverifiable guess at the on-chain byte layout and risks rework.
3. **"Per-seat `draw_seat` round-trips end-to-end"** — `draw_seat` does not
   exist on-chain or in any IDL.
4. **"Snapshot methods + types removed from entrypoint"** — the live program
   still defines them; removing now orphans the SDK↔IDL lockstep and the e2e
   suite.

Action: `blocked_by: accord-yz7c`, status `todo`. **No speculative SDK code
written** — will match the real IDL in one verified pass once `accord-yz7c`
lands the accumulator + rebuilt IDL.
