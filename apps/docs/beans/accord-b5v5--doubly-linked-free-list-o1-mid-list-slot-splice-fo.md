---
# accord-b5v5
title: Doubly-linked free list — O(1) mid-list slot splice for returning jurors
status: todo
type: bug
priority: low
tags:
    - reclaim-leaf
    - sr2-m-2
created_at: 2026-08-19T17:47:53Z
updated_at: 2026-08-19T17:47:53Z
---

## Motivation (residual of SR2-M-2, security review 2026-08-19)

The RECLAIM-LEAF free list is a **singly**-linked LIFO threaded through
`JurorStake.next_free` (head = `Subaccord.free_head`). The SR2-M-2 fix lets a
drained juror re-claim their own reclaimed slot only when it is the **head**
(O(1) unlink). Mid-list, `stake` reverts with `SlotAwaitingRecycle` — the
juror must wait until the slots ahead of theirs are recycled.

That residual is a soft grief vector: an attacker who stakes with N wallets,
drains them (3-day `WITHDRAWAL_DELAY` each) and reclaims them can push N nodes
in front of a target's reclaimed slot, delaying **that wallet's** re-entry
into the pool. Mitigations today: the target re-enters instantly under a fresh
wallet (each such stake also pops the head, eroding the burial); the burial
costs the attacker N × (`min_stake + α·min_stake`) of temporarily-locked
capital and donates recyclable slots to the pool. No funds are ever at risk
(reclaim requires a fully-drained account). Accepted for v1 — this bean is the
upgrade path.

## Recommendation

Make the free list **doubly linked** so a returning juror can splice their
node out of the list from ANY position and re-enter the accumulator tree
immediately — `SlotAwaitingRecycle` becomes unreachable.

### Implementation sketch

- Add `prev_free: u32` to `JurorStake`, carved out of the trailing `padding`
  (same zero-offset-drift technique as `Dispute.drawn_seats`, H-2 precedent).
  Sentinel `u32::MAX` = no predecessor / not on list.
- Maintain both pointers in every list mutation: `reclaim_slot` (push),
  `stake` pop (head advance must now also clear the NEW head's `prev_free`),
  `stake` own-slot splice (unlink at arbitrary position: wire
  `prev.next = node.next` and `next.prev = node.prev`; head/tail cases update
  `Subaccord.free_head`).
- The predecessor account becomes a `remaining_accounts` input (the caller
  discovers it off-chain by reading the head node's `prev_free` chain, or
  index the list off-chain). Verify its PDA + `tree_index`/`next_free`
  consistency before unlinking (M-2 discipline: PDA re-derivation + owner
  check on every raw account).
- Keep the existing root-based blank-leaf detection (SR2-M-2) — it is
  position-independent and already correct.
- Consider an explicit membership discriminator while touching the layout:
  the `next_free == MAX` tail-sentinel ambiguity (SR2-L-4 analysis) could be
  retired with the second pointer, making head/tail membership decidable from
  fields alone.
- **Change coupling:** new field ⇒ layout offsets (`constants::layout`),
  `offsets_match_borsh` runtime pin, fixtures constructing `JurorStake`,
  SDK codegen (`make codegen && pnpm -r run build`), `.qedspec` only if the
  instruction contract (accounts/args) changes — passing the predecessor as a
  remaining account does not change named accounts.

### TDD acceptance criteria

- [ ] LiteSVM: mid-list own-slot re-stake succeeds (juror buried behind ≥2
      nodes re-enters in one tx; root/free_head/staker_count correct).
- [ ] LiteSVM: `prev↔next` bidirectional invariant holds across push, pop,
      head-splice, mid-splice, and exhaustion (list empty ⇒ head = MAX, no
      node claims a predecessor).
- [ ] LiteSVM: wrong/fabricated predecessor account reverts (PDA + pointer
      consistency), list unchanged.
- [ ] LiteSVM: `SlotAwaitingRecycle` no longer emitted on any own-slot path
      (remove the error variant + generated-client regen, or keep as
      unreachable defense).
- [ ] e2e: reclaim.spec.ts — drained juror re-stakes from a mid-list slot.
- [ ] `make test` green (full Rust + LiteSVM + Surfpool e2e).

## References

- Fix + analysis: `reports/accord/2026-08-19-accord-security-review.md`
  (SR2-M-2 resolution addendum; SR2-L-4 tail-sentinel analysis).
- Parent feature: accord-dc8y (RECLAIM-LEAF).
- Code: `programs/accord/src/instructions/stake.rs` (pop + own-splice),
  `reclaim_slot.rs` (push), `state.rs` (`JurorStake.next_free`, padding).
