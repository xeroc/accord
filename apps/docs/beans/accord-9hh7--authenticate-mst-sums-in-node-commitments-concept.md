---
# accord-9hh7
title: Authenticate MST sums in node commitments (CONCEPT-REVIEW Bad 5)
status: scrapped
type: task
priority: critical
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T16:20:23Z
parent: accord-ukqg
---

## Why

`verify_mst_inclusion` (`lib.rs:1594-1634`) computes the internal node hash as
`H(left_hash ‖ right_hash)` — the child **sums are excluded** from the hash
(`lib.rs:1616-1618`). The root hash therefore authenticates tree shape + leaf
content, but NOT the sibling sums carried in a proof. The verifier then checks
`acc_sum == root_sum` and `cum_from_left + stake == leaf.cum_after` against
**caller-/poster-supplied** sibling sums — which is circular.

Consequence: a dishonest poster can inflate a colluding juror's `cum_after`
(its selection weight / range) while keeping leaf **stakes** real (passes fraud
predicate 3, WrongStake), and **no predicate checks cumulative-sum correctness**.
The ADR-0009 claim that the MST "closes caller cherry-picking" is false at the
construction level: stake-weighted sortition is not cryptographically unforgeable.
This is the single sharpest finding in the review (CONCEPT-REVIEW §Bad 5 /
conceptual blocker #1).

## How (agreed)

1. Bind sums into the node hash:
   `H(domain ‖ left_hash ‖ left_sum ‖ right_hash ‖ right_sum)`.
2. Bind `total_stake` into the root commitment (not a free-standing stored u64).
3. `verify_mst_inclusion` derives each leaf's prefix from **authenticated**
   left-subtree sums — never caller-supplied. Merely checking that supplied sums
   add to a stored total is circular and must go.
4. Add a fraud predicate for "wrong `cum_after` / inconsistent internal sum" so a
   dishonest root is voidable during the challenge window.
5. Backward-incompatible — pre-deployment, so no migration. Update the SDK MST
   builder (`packages/sdk/src/methods/snapshot.ts`) to match.

## TDD acceptance (RED → GREEN)

- A poster-built tree with an inflated `cum_after` on one leaf but real stakes
  MUST (a) fail `verify_mst_inclusion` under the new hash, and (b) be voidable
  via the new wrong-sum predicate.
- An honest tree still verifies; the draw round-trip still works end-to-end.
- Omission/NotSorted/WrongStake predicates still pass on their fixtures.

## References

CONCEPT-REVIEW §Bad 5; ADR-0009 §1; `lib.rs:1594-1634`; beans veridao-4nyi,
veridao-utcu. Requires a superseding ADR (changes an accepted ADR-0009 mechanism).

## Reasons for Scrapping (2026-08-05)

Subsumed by the on-chain stake accumulator (ADR-0012, bean accord-g74z). Sum-binding into node hashes is no longer a standalone fix — it is HOW the accumulator verifies every incremental update. Bad 5 is resolved as a prerequisite of the accumulator, not as a separate task.
