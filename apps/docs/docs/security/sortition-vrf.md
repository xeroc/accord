# Sortition & VRF

The draw trust chain. Randomness is committed once; the accumulator root is
frozen atomically with it; jurors are selected deterministically per seat; every
step is on-chain verifiable.

## Trust chain

```
1. request_vrf         ─►  VRF oracle (magicblock, ephemeral_vrf_sdk)
2. commit_vrf_callback ◄─  oracle writes committed_vrf AND freezes dispute.frozen_root = subaccord.root
3. draw_seat × N       ─►  on-chain verifies MST membership + sortition + inflation + distinctness (per seat)
```

The committed VRF cannot be swapped between seats — `draw_seat` reads
`dispute.committed_vrf` immutably. The frozen root cannot be manipulated: it is
copied from the live accumulator **when the randomness becomes known**, so
pre-callback manipulation is blind (VRF unknown) and post-callback manipulation
is inert (root frozen).

## VRF seed + seat selection

```
vrf_seed = hash(committed_vrf ‖ dispute ‖ round_idx ‖ seat_index i)
r_i      = u64::from_le_bytes(hash(vrf_seed ‖ i_le)[0..8]) % total_stake
chosen_i = the unique leaf where  prefix ≤ r_i < prefix + stake
```

`prefix` = sum of left-sibling sums on the proof path = total stake of all
leaves left of the target. The cranker submits the leaf + proof; the chain
recomputes `r_i` and enforces the range. Cherry-picking is impossible — a wrong
leaf fails `SortitionMismatch`.

## Merkle-Sum Tree verification (subtree-sum form)

Leaf = `(juror, stake)`. Internal node = `H(left_hash ‖ left_sum ‖ right_hash ‖
right_sum)` with `node.sum = left_sum + right_sum`. Sums are **bound into the
hash** (CONCEPT-REVIEW Bad 5 fixed by construction). Each proof element carries
`(sibling_hash, sibling_sum)`.

`draw_seat` checks three things against `dispute.frozen_root`:

1. Root hash matches (structural integrity).
2. Root sum matches `frozen_root.total_stake` (stake consistency).
3. `prefix + stake` reconstructs correctly along the path (non-overlapping ranges).

This subtree-sum form (not ADR-0009's cumulative-from-left `cum_after` form) is
mandatory for a live accumulator: a one-leaf change touches only that leaf's
ancestors, so updates are O(log N).

## Per-seat draw

The 1232-byte transaction packet cannot hold N proofs (each ≈ `44 + 40·depth`
bytes; depth 20 ≈ 844 B). The draw is therefore **one seat per tx** (`draw_seat`),
N txs per panel (3 for v1, up to 31 for the max appeal). Sampling is
deterministic and **without replacement** — no `draw_attempt` grind, no
collision-retry stall (bean `accord-tzo0`).

## Inflation guard

For each seat, `draw_seat` reads the live `JurorStake` and requires
`JurorStake.amount ≥ leaf.stake`. Reads current state, so it is immune to the
deposit-after-freeze race. Violation ⇒ `InflatedStake`, the seat is re-resolved
deterministically.

## Cranker retry

A selected juror whose live balance has since dropped below their frozen leaf is
handled by deterministic re-draw of that seat — no new randomness, no re-request.
The same `committed_vrf` + `frozen_root` serve every seat and every appeal round
(appeals draw a larger panel from the same fixed pool).

```typescript
import { requestVrf, drawSeat, resolveSeat } from "@useaccord/sdk";

await requestVrf(accord.adapter, accord.PROGRAM_ID, { dispute });
// … commit_vrf_callback lands, dispute.frozen_root set …
for (let seat = 0; seat < panel; seat++) {
  const membership = await resolveSeat(frozenRoot, committedVrf, seat); // off-chain
  await drawSeat(accord.adapter, accord.PROGRAM_ID, {
    dispute,
    seatIndex: seat,
    membership,
  });
}
```

Why: [ADR-0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md). Accumulator trust model: [stake accumulator](fraud-proofs.md).
