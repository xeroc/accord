---
# accord-4412
title: 'Accumulator — ADRs: supersede 0003/0008/0009 snapshot layer, reconcile status (ADR-0012)'
status: todo
type: task
priority: high
created_at: 2026-08-05T17:12:02Z
updated_at: 2026-08-05T17:12:02Z
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
