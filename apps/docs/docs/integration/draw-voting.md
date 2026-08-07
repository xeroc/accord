# Draw & Voting

The crank sequence from `Created` to `RoundResolved`. Every step after `commit_vrf_callback` is permissionless or Juror-driven. The juror-set root is the Subaccord's live **stake accumulator**, frozen on the dispute at VRF-commit ([ADR-0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)).

| Step | Instruction           | Caller     | Gate                                                         | Next state             |
| ---- | --------------------- | ---------- | ------------------------------------------------------------ | ---------------------- |
| 1    | `request_vrf`         | crank      | `committed_vrf.is_none()`                                    | (VRF oracle armed)     |
| 2    | `commit_vrf_callback` | VRF oracle | identity-constrained; writes `committed_vrf` + `frozen_root` | (root frozen)          |
| 3    | `draw_seat` × N       | crank      | MST proof + sortition vs `frozen_root` (one tx per seat)     | `Drawn` (on last seat) |
| 4    | `commit`              | Juror      | `review_end ≤ now < commit_end`                              | `Commit` (on first)    |
| 5    | `reveal`              | Juror      | `commit_end ≤ now < reveal_end`                              | `Reveal` (on first)    |
| 6    | `finalize_round`      | crank      | `now ≥ reveal_end`                                           | `RoundResolved`        |

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

## Sortition (per seat `i`)

```
vrf_seed   = hash(committed_vrf ‖ dispute ‖ round_idx ‖ seat_index i)
r_hash     = hash(vrf_seed ‖ i_le)
r_i        = u64::from_le_bytes(r_hash[0..8]) % total_stake
chosen     = leaf where prefix ≤ r_i < prefix + stake      (prefix = sum of left-sibling sums on the proof path)
```

The cranker builds each seat's membership proof against `frozen_root` from its
tracked tree state and submits one `draw_seat` tx per seat. Sampling is
**deterministic and without replacement** — there is no `draw_attempt` grind and
no collision-retry stall (bean `accord-tzo0`). The caller cannot cherry-pick: the
VRF seed selects the seat, and the submitted leaf must cover it.

## Gates each `draw_seat` must satisfy

- `dispute.frozen_root` is set (VRF committed).
- MST proof verifies against `frozen_root` (hash + sum, sums bound into node hashes).
- `prefix ≤ r_i < prefix + stake` (sortition criterion, prefix from authenticated sibling sums).
- `leaf.stake ≥ subaccord.min_stake`.
- `JurorStake.amount ≥ leaf.stake` (inflation guard — live read).
- seat not already filled (distinctness across the N seats).

```typescript
import {
  requestVrf,
  drawSeat,
  resolveSeat,
  commit,
  reveal,
  commitHash,
} from "@useaccord/sdk";

await requestVrf(accord.adapter, accord.PROGRAM_ID, { dispute });
// VRF oracle calls commit_vrf_callback → dispute.frozen_root set …
for (let seat = 0; seat < panel; seat++) {
  const membership = await resolveSeat(frozenRoot, committedVrf, seat); // off-chain
  await drawSeat(accord.adapter, accord.PROGRAM_ID, {
    dispute,
    seatIndex: seat,
    membership,
  });
}
await commit(accord.adapter, accord.PROGRAM_ID, {
  dispute,
  commitment: commitHash(vote, salt, juror),
});
await reveal(accord.adapter, accord.PROGRAM_ID, { dispute, vote, salt });
```

Why: [ADR-0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md) (accumulator — supersedes the snapshot layer of 0003/0008/0009). Trust chain detail: [sortition & VRF](../security/sortition-vrf.md).
