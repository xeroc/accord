---
# accord-ukqg
title: Resolve CONCEPT-REVIEW findings — correctness, liveness, positioning
status: completed
type: milestone
priority: critical
created_at: 2026-08-05T15:25:44Z
updated_at: 2026-08-06T04:26:27Z
---

Resolve the actionable findings from `CONCEPT-REVIEW.md`. The review's "good" needs
no action; a defined subset of the "bad" + all "ugly" items are in scope. Items that
are explicit accepted ADR trade-offs or v2 mechanism changes are out of scope and
listed below so the milestone is honest about what was considered and deferred.

The review was validated against the code (`programs/accord/src/lib.rs`, `state.rs`,
`constants.rs`), all 11 ADRs, git history, and the referenced beans (`veridao-*`).
Two of the reviewer's findings are the sharpest and load-bearing: (1) the MST node
hash excludes child sums so stake-weighted ranges are not cryptographically
authenticated (Bad 5); (2) multi-round appeals never settle earlier-round jurors —
hard fund-lock + accounting bug (Ugly 5). Both are correctness-critical.

## In scope (child tasks)

Tier 1 — correctness-critical (block any security claim):

- Bad 5  — authenticate MST sums in node commitments
- Ugly 1 + Ugly 7 — deterministic weighted sampling without replacement (drop draw_attempt grind + collision liveness)
- Ugly 5 — multi-round settlement (per-round crank, final-ruling coherence, immediate participation fee)

Tier 2 — procedural / liveness:

- Ugly 2 — pause must not consume appeal deadlines (split-scope: appeal/finalize never pausable)
- Ugly 6 — freeze case terms at filing
- Ugly 3 — re-post snapshot after void
- Ugly 4 — general escape path (Failed state + cancel_dispute)

Tier 3 — positioning / docs:

- Ugly 8 — honest trust/positioning profile
- Bad 16 — reconcile stale ADR-0009 VRF text with the shipped callback architecture

## Explicitly deferred (accepted trade-off or v2 — NOT in this milestone)

- Bad 1  distinct keys ≠ independent humans (ADR-0001/0003/0009) — v2 court profile / identity model
- Bad 2  anchor↔draw liveness (ADR-0008) — epoch machinery is v2
- Bad 3  stake maturity — v2
- Bad 4  snapshot data availability — significant; recommend a follow-up milestone (predicates are meaningless if watchers can't reconstruct the tree)
- Bad 6  challenge-bond capital threshold — future
- Bad 7  snapshot bond vs dispute value — application responsibility
- Bad 8  cranker incentives — operational; partial overlap with Ugly 4
- Bad 9  participation quorum / inconclusive outcome — real gap; recommend follow-up milestone
- Bad 10 plurality weakness — accepted for v1 binary default; follow-up
- Bad 11 evidence cryptography — owned by the Evidence Operator milestone (accord-yjno)
- Bad 12 subaccord quality / curation — application responsibility
- Bad 13 flat slashing (ADR-0002/0003) — accepted; v2 court profile
- Bad 14 Schelling ≠ proof of truth — inherent to ADR-0001
- Bad 15 ruling enforcement — application responsibility (ADR-0004)

## Sequencing (encoded as bean blockers)

Bad 5 → (Ugly 1+7) [shared draw/MST code, avoid rework]
Ugly 6 → (Ugly 5, Ugly 4) [frozen case terms feed settlement + cancel timeouts]
Ugly 3 and Ugly 4 together close the snapshot-fraud recovery loop.

## Authority

- `CONCEPT-REVIEW.md` (the review)
- `apps/docs/docs/adr/0001`–`0011`
- `programs/accord/src/lib.rs`, `state.rs`, `constants.rs`
- Beans: veridao-utcu, veridao-4nyi, veridao-crbf, veridao-i4jm, veridao-rrxs, veridao-63v3, veridao-y63e

## PIVOT — on-chain accumulator (2026-08-05; supersedes scope notes above)

Bad 4 (data availability), previously DEFERRED, is pulled IN SCOPE and resolved together with Bad 5 by replacing the optimistic snapshot layer with a live on-chain stake accumulator (ADR-0012, bean accord-g74z). The accumulator makes the juror-set root canonical by construction — no poster, no bond, no challenge window, no fraud predicates — so there is no posted root to withhold and sums are bound into node hashes by construction.

Bean changes:

- NEW accord-g74z (feature, critical) — the accumulator. Resolves Bad 4 + Bad 5.
- SCRAPPED accord-9hh7 (Bad 5 MST sums) — subsumed; sum-binding is how the accumulator verifies updates.
- SCRAPPED accord-gh3k (re-post after void) — mooted; no void, no snapshot.
- accord-tzo0 (Ugly 1+7 sampling) — now blocked-by accord-g74z; also absorbs the per-seat draw_seat split forced by the 1232-byte tx limit.

Retained unchanged: anchor-slot leaf witness + inflation guard (ADR-0008), active_draws lock, VRF callback, and the rest of the in-scope tier-1/2/3 tasks (settlement accord-r6ti, case terms accord-4e7p, escape path accord-18fb, pause accord-hh61, profile accord-wuzs, VRF-doc accord-z61k).

Net: the system LOSES post_snapshot/challenge_snapshot/finalize_snapshot + the bond + window + four predicates, and GAINS a 45-byte accumulator on the Subaccord + per-seat draw. Pool size becomes unbounded (depth-bound), capital stays fully live (no freeze).
