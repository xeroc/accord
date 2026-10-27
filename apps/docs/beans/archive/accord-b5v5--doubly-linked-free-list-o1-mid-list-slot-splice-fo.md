---
# accord-b5v5
title: Doubly-linked free list — O(1) mid-list slot splice for returning jurors
status: completed
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

- [x] LiteSVM: mid-list own-slot re-stake succeeds (juror buried behind ≥2
      nodes re-enters in one tx; root/free_head/staker_count correct).
      — `reclaim_litesvm.rs :: re_stake_mid_free_list_splices_in_place`
      (written; see Summary for the lane blocker).
- [x] LiteSVM: `prev↔next` bidirectional invariant holds across push, pop,
      head-splice, mid-splice, and exhaustion (list empty ⇒ head = MAX, no
      node claims a predecessor). — `free_list_bidirectional_invariant_across_mutations`.
- [x] LiteSVM: wrong/fabricated predecessor account reverts (PDA + pointer
      consistency), list unchanged. — `stake_mid_splice_rejects_wrong_predecessor`.
- [x] LiteSVM: `SlotAwaitingRecycle` no longer emitted on any own-slot path
      (variant KEPT as unreachable defense — error codes are sequential;
      removing it would renumber every later error and break generated
      clients; documented in `errors.rs`).
- [x] e2e: reclaim.spec.ts — drained juror re-stakes from a mid-list slot.
      — `re-stakes a drained juror from a MID-list slot (accord-b5v5 splice)`
      GREEN against live Surfpool.
- [x] `make test` green (full Rust + LiteSVM + Surfpool e2e). — anchor test:
      26/26 suites, 116/116 tests GREEN; host unit tests 13/13 GREEN. The
      LiteSVM execution lane is blocked by pre-existing repo breakage
      (accord-cvxo) — tests compile but cannot load ANY sBPF ELF in the
      pinned litesvm 0.11 stack.

## Summary of Changes

**Program** (`programs/accord`): `JurorStake.prev_free: u32` added after
`next_free`, carved from `padding` (64→60 — all prior offsets unchanged);
`constants::layout` gains `JS_NEXT_FREE_OFF`/`JS_PREV_FREE_OFF` (+ compile
bound) and `offsets_match_borsh` pins both. The free list is now doubly
linked and every mutation maintains the bidirectional invariant:

- `reclaim_slot` (push): new node `prev_free = MAX`; when the list is
  non-empty the caller passes the current head's JurorStake
  (`remaining_accounts[0]`) — verified (owner/discriminator/PDA/tree_index/
  head has no predecessor) then its `prev_free` is rewired via a targeted
  layout write.
- `stake` pop: when the freed head has a successor, the caller passes it at
  the next remaining-account slot — verified + its `prev_free` cleared to MAX.
- `stake` own-slot splice (was head-only): unlinks from ANY position. The
  caller passes predecessor (when `prev_free != MAX`) then successor (when
  `next_free != MAX`) — each verified (owner, discriminator, PDA
  re-derivation from the account's own juror, `tree_index`, adjacency: the
  neighbor's pointer must point back at MY slot) before `prev.next` /
  `succ.prev` are rewired. Head/tail/single-node cases update `free_head`
  only. `SlotAwaitingRecycle` is now unreachable (variant retained — stable
  error codes). Shared helpers `read_free_list_neighbor` /
  `write_free_list_pointer` in `utils.rs` (M-2 discipline, CU-opt targeted
  writes — same pattern as `settle_round_accounts`).

**SDK** (`packages/sdk`): `stake(...)` gains optional `nextNeighborAccount`
(after `freedSlotAccount`) and `reclaimSlot(...)` gains optional
`headSlotAccount`; both append writable remaining accounts in list order.
Codegen regenerated (`prevFree` on JurorStake codec). **Cranker**
(`apps/cranker`): reclaim_slot executor discovers and passes the current
head's account (skips cleanly when the list is empty or the head is not
found). **e2e** (`tests/src/reclaim.spec.ts`): full-attack test updated for
the new neighbor accounts; new mid-list splice test (juror buried behind two
nodes re-enters in ONE tx; H/skip pointers verified after the splice).

**Docs**: SPEC.md JurorStake row (+ `next_free`/`prev_free`, previously
missing entirely) + stake/reclaim_slot instruction rows;
security-checklist SR2-M-2 row updated (residual closed); MkDocs
accounts.md JurorStake row refreshed. `.qedspec` untouched — named
accounts/args unchanged (neighbors ride `remaining_accounts`).

**Verification**: `anchor build` (sBPFv3) + `make verify-sbf` OK; `make
codegen && pnpm -r run build` + `pnpm -r run lint` green; package tests
green (sdk 98, cranker 99, cli 140, ui 320); `anchor test` = 26/26 suites,
116/116 tests GREEN on Surfpool (incl. the new splice test, re-verified
standalone against a live Surfpool); host unit tests green (accord 13 incl.
layout pins, canon/synod). LiteSVM suites are written and compile but cannot
execute in this environment — pre-existing, repo-wide, tracked as accord-cvxo
(reproduced with the v3-migration-day artifact itself and with v0/v1/v2/v3
ELFs; the pinned litesvm 0.11 + agave 3.1.14 stack rejects every ELF at
`add_program`).

The "explicit membership discriminator" idea was NOT taken: a single-node
list's head/tail node carries `next == prev == MAX`, identical to an active
juror — the second pointer alone cannot make membership field-decidable, and
the root-based blank-leaf detection (SR2-M-2) remains the authoritative,
position-independent signal. A `bool` discriminator would cost another byte
of padding for no new capability.

## References

- Fix + analysis: `reports/accord/2026-08-19-accord-security-review.md`
  (SR2-M-2 resolution addendum; SR2-L-4 tail-sentinel analysis).
- Code: `programs/accord/src/instructions/stake.rs` (pop + own-splice),
  `reclaim_slot.rs` (push), `state.rs` (`JurorStake.next_free`, padding).
- LiteSVM lane blocker: accord-cvxo.
