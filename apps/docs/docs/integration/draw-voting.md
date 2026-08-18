# Draw & Voting

The crank sequence from `Created` to `RoundResolved`. Every step after `commit_vrf_callback` is permissionless or Juror-driven. The juror-set root is the Subaccord's live **stake accumulator**, frozen on the dispute at VRF-commit ([ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)). `finalize_round` only resolves the round if enough drawn jurors reveal (reveal-quorum threshold, [ADR-0021](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0021-reveal-quorum-shortfall-redraw-draw-attempt.md)); a shortfall hands the round to `redraw` instead.

| Step | Instruction           | Caller     | Gate                                                         | Next state                                              |
| ---- | --------------------- | ---------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| 1    | `request_vrf`         | crank      | `committed_vrf.is_none()`                                    | (VRF oracle armed)                                      |
| 2    | `commit_vrf_callback` | VRF oracle | identity-constrained; writes `committed_vrf` + `frozen_root` | (root frozen)                                           |
| 3    | `draw_seat` × N       | crank      | MST proof + sortition vs `frozen_root` (one tx per seat)     | `Drawn` (on last seat)                                  |
| 4    | `commit`              | Juror      | `review_end ≤ now < commit_end`                              | `Commit` (on first)                                     |
| 5    | `reveal`              | Juror      | `commit_end ≤ now < reveal_end` ∨ all committed              | `Reveal` (first / panel-full)                           |
| 6    | `finalize_round`      | crank      | `now ≥ reveal_end` ∨ all revealed                            | `RoundResolved` (quorum + decisive tally) / `RedrawEligible` (shortfall ∨ Plurality tie, ADR-0026) |
| 7    | `redraw`              | crank      | `state == RedrawEligible` (ADR-0021)                         | `Created` (re-draw) / `Failed` (exhausted)              |

## Commit hash

```
commitment = hash(vote_le ‖ salt ‖ juror_pubkey)
```

- `vote_le` = the vote serialized as an **8-byte little-endian u64** (72 preimage bytes: 8 + 32 + 32) — the same preimage for an option index (`Plurality`) and a scalar value (`Median`).
- `salt` = `[u8; 32]`.
- `juror_pubkey` is bound in to prevent commit-copying (a copier can never reveal).

On-chain (`hashv`):

```rust
use solana_program::hash::hashv;
let commitment = hashv(&[&vote.to_le_bytes(), &salt, juror_pubkey.as_ref()]).to_bytes();
require!(computed == committed, AccordError::RevealMismatch);
```

The reveal gate depends on the pool's aggregation ([ADR-0025](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0025-scalar-voting.md)): `Plurality` requires `vote < num_options`; `Median` requires `vote != u64::MAX` (the no-reveal sentinel). See [scalar voting](#scalar-voting-median) below.

## Sortition (per seat `i`)

```
vrf_seed   = hash(committed_vrf ‖ dispute ‖ round_idx ‖ draw_attempt ‖ seat_index i)
r_hash     = hash(vrf_seed ‖ i_le)
r_i        = u64::from_le_bytes(r_hash[0..8]) % total_stake
chosen     = leaf where prefix ≤ r_i < prefix + stake      (prefix = sum of left-sibling sums on the proof path)
```

`draw_attempt` ([ADR-0021](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0021-reveal-quorum-shortfall-redraw-draw-attempt.md)) is
orthogonal to `round_idx`: a shortfall redraw increments it to re-seed the panel
at the **same** size (no appeal consumed, no bigger fee). `(round_idx=0, draw_attempt=0)`
is the initial draw; each redraw bumps `draw_attempt` while `round_idx` is unchanged.

The cranker builds each seat's membership proof against `frozen_root` from its
tracked tree state and submits one `draw_seat` tx per seat. Sampling is
**deterministic and without replacement** — there is no caller cherry-pick and
no collision-retry stall (bean `accord-tzo0`). The caller cannot cherry-pick: the
VRF seed selects the seat, and the submitted leaf must cover it.

## Reveal quorum + shortfall redraw (ADR-0021)

`finalize_round` is gated on a reveal-fraction threshold (`Subaccord.reveal_threshold_bps`,
default 6_666 = 2/3, frozen into `CaseTerms` at filing):

- **Quorum met** (`reveal_count ≥ ceil(panel × bps / 10_000)`): tally per `terms.aggregation` — Plurality: modal option index, **unless the top count is tied** (ADR-0026: ≥2 options share the max → non-decisive round, treated exactly like a shortfall); Median: median of revealed scalars (see below) — each revealer credited `fees_earned += fee_per_juror`, `fee_paid` decremented →
  `RoundResolved` (appeal window / finalization).
- **Shortfall or Plurality tie**: no credits, no result → `RedrawEligible`. The permissionless
  `redraw` crank then slashes the no-shows into `stake_delta` (pending, not
  `staked` — the frozen-root inflation guard still holds), releases the round's
  `active_draws` + `slash_reserve`, bumps `round.draw_attempt`, clears the round,
  and re-opens `Created` for fresh seats at the same panel size. After
  `max_draw_attempts` shortfalls the dispute transitions to `Failed` — the filer's
  `fee_paid` is refunded, the no-shows' accumulated slashes stand, and outstanding
  appeal bonds remain claimable via `claim_appeal_refund`. A `> (1 − threshold)`
  stake holder can force `Failed` but never a wrong ruling; the abstention is
  **priced** (`α · min_stake × seats × attempts`) and **bounded**.

## Scalar voting (Median)

A Subaccord created with `aggregation: Median` adjudicates **scalar** questions
— "what is the fair price?", "what damages are owed?" — instead of enumerated
options ([ADR-0025](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0025-scalar-voting.md)):

- **Filing:** `create_dispute` passes **zero** options (`num_options = 0`); the
  question and its unit live in the evidence/rules, not on-chain.
- **Votes:** each Juror commits/reveals a **u64 fixed-point value in the
  settlement mint's base units** (e.g. 6 decimals for USDC — `1_000_000` =
  1 USDC). Same commit preimage as Plurality:
  `hash(vote_le8 ‖ salt ‖ juror)`.
- **Reveal gate:** `vote != u64::MAX` (the universal no-reveal sentinel); any
  other u64 is valid.
- **Tally (`finalize_round`):** the round `result` is the **median** of the
  revealed values. Panels are odd, but non-revealers can leave an even reveal
  count — then the **upper middle** element (`sorted[n/2]`) wins
  (deterministic, biased high).
- **Coherence (settlement):** not exact equality but a band — a vote is
  coherent iff `|vote − final_ruling| · 10_000 ≤ final_ruling ·
  coherence_tol_bps`. `coherence_tol_bps` is set once at `create_subaccord`
  (default `100` = ±1% of the final median; `0` = exact; ceiling `10_000`),
  frozen onto `CaseTerms` at filing, and **immutable** — it defines the pool's
  coherence game. Inert on `Plurality` pools (exact option equality).

`get_ruling` returns the final median as `Option<u64>`; the Arbitrable
interprets the fixed-point value against the settlement mint's decimals.

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

Why: [ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md) (accumulator — supersedes the snapshot layer of 0003/0008/0009). Trust chain detail: [sortition & VRF](../security/sortition-vrf.md).
