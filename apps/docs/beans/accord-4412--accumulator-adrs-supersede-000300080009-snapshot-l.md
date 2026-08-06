---
# accord-4412
title: "Accumulator — ADRs: supersede 0003/0008/0009 snapshot layer, reconcile status (ADR-0012)"
status: completed
type: task
priority: high
created_at: 2026-08-05T17:12:02Z
updated_at: 2026-08-05T20:04:24Z
parent: accord-g74z
---

## Why

ADR-0012 supersedes the snapshot layer of 0003/0008/0009, but those files still
read as current. The reviewer also flagged a status mismatch (index says
Accepted; 0008/0009 files say Proposed). Reconcile to a single consistent story.

## Scope

- **ADR-0003**: add a superseded-note header — snapshot/poster/bond/window layer
  → 0012; retained: the draw-over-Merkle + distinct-juror intent.
- **ADR-0008**: mark superseded by 0012 (anchor-slot pattern + four fraud
  predicates deleted; inflation guard retained and restated in 0012). Reconcile
  the status label.
- **ADR-0009**: mark superseded by 0012 (cumulative-from-left MST → subtree-sum;
  `commit_vrf` → `frozen_root` in the callback; sortition criterion retained in
  subtree-sum form). Reconcile the status label.
- **ADR index**: make 0003/0008/0009 statuses consistent and point the
  snapshot/draw authority at 0012.

## Acceptance

- One consistent story across ADRs 0003/0008/0009/0012 + the index.
- No Proposed/Accepted mismatch.
- Every superseded file points to 0012.

## References

ADR-0012; CONCEPT-REVIEW (status-mismatch caveat); `accord-g74z`.

## Summary of Changes

Reconciled ADRs 0003/0008/0009 + the ADR index to a single consistent story
under ADR-0012 (the on-chain stake accumulator).

- **ADR-0003** (`0003-…-distinct-vrf.md`): added a "Partially superseded by
  ADR-0012" banner noting the snapshot/poster/bond/1-day-window layer → 0012,
  retained: draw-over-Merkle intent, distinct Jurors, VRF sortition (subtree-sum
  over a VRF-frozen root), and the `active_draws` unstake lock.
- **ADR-0008** (`0008-…-sortition.md`): banner + Status section flipped from
  **Proposed** → **Partially superseded by ADR-0012**. Anchor-slot pattern +
  all four fraud predicates deleted; draw-time inflation guard retained (live
  read, restated in 0012). Resolves the index-Accepted / file-Proposed mismatch.
- **ADR-0009** (`0009-…-committed-vrf.md`): banner + Status section flipped from
  **Proposed** → **Partially superseded by ADR-0012**. Cumulative-from-left MST
  → subtree-sum (fixes Bad 5); caller-supplied `commit_vrf` → root frozen in the
  VRF callback (`frozen_root`); Omission/NotSorted predicates deleted (fixes Bad
  4); stake-weighted sortition criterion retained in subtree-sum form.
- **ADR index** (`adr/index.md`): status column for 0003/0008/0009 → "Partially
  superseded by 0012"; reading order now routes newcomers through 0012 (0003/
  0008/0009 framed as historical); the Auditing note corrected — it previously
  claimed 0012 "retains the anchor-slot leaf witness", contradicting ADR-0012
  which _drops_ the anchor-slot witness / `last_change_slot` and retains only the
  inflation guard + sortition criterion.

Acceptance: one consistent story across 0003/0008/0009/0012 + index; no
Proposed/Accepted mismatch remains (0008/0009 file+index now agree as partially
superseded; 0012 file+index agree as Proposed — its status flip is the parent
bean's call); every superseded file points to 0012.

Verification: `poetry run mkdocs build --strict` — the only warnings are
pre-existing repo-root cross-links (`PROJECT.md`/`CONTEXT.md`/`SPEC.md`) in the
docs-root `index.md` and `reference/index.md` (a documented pattern); none
reference the changed ADR files, and all new 0012 links resolve.
