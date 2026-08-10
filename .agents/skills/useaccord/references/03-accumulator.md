# Accumulator — Offline MST Helpers

The Merkle-Sum Tree (MST) is the backbone of Accord's verifiable sortition.
These CLI commands are **pure** — no chain interaction, no signer needed.

## Commands

### `accumulator:build`

Build a full MST from leaf data. Returns the root hash + total sum.

```bash
# leaves.json: [{"juror":"Addr1...","stake":5000},{"juror":"Addr2...","stake":3000}]
useaccord accumulator:build --leaves leaves.json --depth 4
# → { rootHash: "ab12...", rootSum: 8000 }
```

SDK: `buildAccumulator(leaves, depth)`

### `accumulator:proof`

Generate a Merkle membership proof for a leaf at a given index.

```bash
useaccord accumulator:proof --leaves leaves.json --depth 4 --index 0
# → [{ siblingHash, siblingSum }, ...]
```

SDK: `proofFor(tree, index)`

### `accumulator:empty-root`

Compute the root of an all-zero tree at a given depth (initial state).

```bash
useaccord accumulator:empty-root --depth 20
# → "0000..."
```

SDK: `emptyRoot(depth)`

### `accumulator:verify`

Verify a membership proof against a known root. Returns the cumulative-from-left
prefix (the sortition range start for that leaf).

```bash
useaccord accumulator:verify \
  --leaf '{"juror":"Addr1...","stake":5000}' \
  --index 0 \
  --path proof.json \
  --root ab12... \
  --root-sum 8000
# → { ok: true, prefix: 0 }
```

SDK: `verifyMembership(leaf, index, path, rootHash, rootSum)`

### `accumulator:prepare-stake-proof`

Fetch JurorStake accounts from chain, rebuild the tree, and derive the proof
for a specific juror. This is what `staking:stake` and `staking:reconcile` use
internally in auto-path mode.

```bash
useaccord accumulator:prepare-stake-proof \
  --subaccord cordh... \
  --juror Addr1...
# → { path: [...], index: 0, isNewStaker: false }
```

SDK: `prepareStakeProof(subaccord, stakes, juror)`

## How the MST works

- **Leaf hash**: `H(juror ‖ stake_le)`
- **Node hash**: `H(left_hash ‖ left_sum ‖ right_hash ‖ right_sum)`
- Sums are bound into every hash — stake-weighted ranges are cryptographically
  authenticated (no separately posted root to withhold or fabricate).
- The on-chain `Subaccord.root_hash` is maintained incrementally on every
  `stake`/`request_withdraw`/`reconcile_stake` via `verify_and_recompute`.
- For `draw_seat`, the frozen root (`dispute.frozen_root`) authenticates the
  pool state at VRF commit time.

See: ADR-0012, `programs/accord/src/lib.rs` (`mst_leaf_hash`, `mst_node_hash`,
`verify_and_recompute`, `verify_membership_and_prefix`).
