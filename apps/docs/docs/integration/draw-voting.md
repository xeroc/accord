# Draw & Voting

The crank sequence from `SnapshotPosted` to `RoundResolved`. Every step after `commit_vrf_callback` is permissionless or Juror-driven.

| Step | Instruction           | Caller     | Gate                                          | Next state                            |
| ---- | --------------------- | ---------- | --------------------------------------------- | ------------------------------------- |
| 1    | `post_snapshot`       | indexer    | bond `1×max-appeal-fee`                       | `SnapshotPosted`                      |
| 2    | `finalize_snapshot`   | crank      | `challenge_deadline` passed                   | `SnapshotPosted` (status `Finalized`) |
| 3    | `request_vrf`         | crank      | `committed_vrf.is_none()`; snapshot finalized | (VRF oracle callback armed)           |
| 4    | `commit_vrf_callback` | VRF oracle | identity-constrained                          | (writes `committed_vrf`)              |
| 5    | `draw`                | crank      | MST proofs + sortition + inflation guard      | `Drawn`                               |
| 6    | `commit`              | Juror      | `review_end ≤ now < commit_end`               | `Commit` (on first)                   |
| 7    | `reveal`              | Juror      | `commit_end ≤ now < reveal_end`               | `Reveal` (on first)                   |
| 8    | `finalize_round`      | crank      | `now ≥ reveal_end`                            | `RoundResolved`                       |

## Commit hash

```
commitment = hash(vote_le ‖ salt ‖ juror_pubkey)
```

- `vote_le` = single byte (`[vote]`).
- `salt` = `[u8; 32]`.
- `juror_pubkey` is bound in to prevent commit-copying (a copier can never reveal).

On-chain (`hashv`):

```rust
use solana_program::hash::hashv;
let commitment = hashv(&[&[vote], &salt, juror_pubkey.as_ref()]).to_bytes();
require!(computed == committed, AccordError::RevealMismatch);
```

## Sortition (per drawn slot `i`)

```
vrf_seed   = hash(committed_vrf ‖ dispute ‖ round_idx ‖ draw_attempt)
r_hash     = hash(vrf_seed ‖ i_le)
r_i        = u64::from_le_bytes(r_hash[0..8]) % total_stake
chosen     = leaf where cum_before ≤ r_i < cum_after
```

The caller **cannot cherry-pick** — the VRF seed selects the slot, the submitted leaf must cover it. On collision the whole `draw` reverts; retry with `draw_attempt + 1` (same committed VRF, no re-request).

## Gates the crank must satisfy

- snapshot `status == Finalized`.
- `len(memberships) == panel` (closed form `(J+1)·2^k − 1`).
- each MST proof verifies root hash + root sum + cumulative-range consistency.
- each `leaf.stake ≥ subaccord.min_stake`.
- each `JurorStake.amount ≥ leaf.stake` (inflation guard).
- all drawn jurors distinct (O(N²), N ≤ 31).

```typescript
import {
  postSnapshot,
  finalizeSnapshot,
  requestVrf,
  draw,
  resolvePanel,
  commit,
  reveal,
  commitHash,
} from "@accord/sdk";

await postSnapshot(accord.adapter, accord.PROGRAM_ID, {
  dispute,
  merkleRoot,
  totalStake,
});
await finalizeSnapshot(accord.adapter, accord.PROGRAM_ID, { dispute });
await requestVrf(accord.adapter, accord.PROGRAM_ID, { dispute });
// VRF oracle calls commit_vrf_callback …
const memberships = await resolvePanel(snapshot, committedVrf); // retries on collision
await draw(accord.adapter, accord.PROGRAM_ID, {
  dispute,
  drawAttempt,
  memberships,
});
await commit(accord.adapter, accord.PROGRAM_ID, {
  dispute,
  commitment: commitHash(vote, salt, juror),
});
await reveal(accord.adapter, accord.PROGRAM_ID, { dispute, vote, salt });
```

Why: [ADR-0003](../adr/0003-accord-draw-merkle-snapshot-distinct-vrf.md), [ADR-0009](../adr/0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md). Trust chain detail: [sortition & VRF](../security/sortition-vrf.md).
