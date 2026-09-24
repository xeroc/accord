# Group C — Randomness and the draw

Illustration targets for the Accord docs site. Each concept gets one individual, self-contained looping motion illustration (~3–8s) that makes the concept click without narration.

**What Accord is:** a Schelling-point arbitration primitive on Solana. Any program (an *Arbitrable*) files a Dispute via CPI; Accord draws stake-weighted Jurors from a live Merkle-Sum-Tree accumulator using VRF randomness, collects commit-reveal votes, and emits a Ruling. Coherent Jurors earn fees plus slashed stake; incoherent Jurors are slashed. Appeals double the panel (3→7→15→31) at exponentially rising bond cost.

---

## C1. Stake-weighted sortition — the number line

The canonical draw visualization: total stake as a ruler `[0, total_stake)`, each juror owning a sub-segment proportional to their stake; the VRF-derived `r_i` is a dart, and whoever's segment it lands in takes the seat (`prefix ≤ r_i < prefix + stake`). Illustrate exactly that — dart, segments, width ∝ stake ∝ probability — then a second frame marking drawn segments as excluded to show distinctness (sampling without replacement via `draw_attempt` re-derivation, never per-slot re-rolls).

## C2. The MST accumulator (root on-chain, tree off-chain)

The live Merkle-Sum Tree maintained incrementally on every `stake`/`unstake`; only `{root_hash, total_stake, next_index, depth}` lives on-chain, indexers hold the full tree. Illustrate as a split-screen: a tiny on-chain account box (45 bytes) beside the big off-chain tree, with one stake change rippling up a single leaf-to-root path while all sibling subtrees stay frozen — captioning the O(log N) property. Add the historical contrast as a small inset: the old posted-snapshot model with its bond and fraud window crossed out, because "the root is canonical by construction — nothing to withhold or fabricate" only lands when you show what it replaced.

## C3. VRF delivery + root freeze (the manipulation-proof timing)

The subtlest security property in the system: randomness arrives only via an oracle-authenticated callback that atomically writes `committed_vrf` **and** freezes the accumulator root, so pre-callback stake manipulation is blind (VRF unknown) and post-callback manipulation is inert (root frozen). Illustrate as a sequence diagram (cranker → `request_vrf` → MagicBlock oracle → `commit_vrf_callback` → `draw_seat` × N) with a vertical "freeze line" at the callback, and the two attack windows annotated on either side with why each fails. Also mark the escape: a silent oracle stalls but any cranker can `cancel_dispute` → refund.
