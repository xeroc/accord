---
# accord-krjn
title: ""
status: completed
type: task
priority: normal
created_at: 2026-08-20T18:12:33Z
updated_at: 2026-08-20T16:23:15Z
---

## Todos

- [x] Kit: DepthPicker pattern (tests first) + stories + export
- [x] apps/app: replace local DepthPicker with kit component
- [x] apps/canon: replace raw Tree depth CourtField with kit DepthPicker
- [x] Verify: kit tests+build, app + canon builds/tests

## Summary of Changes

- `packages/ui/src/patterns/depth-picker.tsx` — DepthPicker: the curated
  juror-seat ladder Select ("16 seats — testing" … "65,536 seats — max"),
  promoted from apps/app SubaccordCreatePage. Kit stays SDK-free: the
  program's depth ceiling arrives as a `maxDepth` prop; the ladder trims to
  it and the highest option is relabeled "… — max". Field description
  unifies both apps' help text (2^depth seats, irreversible, Merkle-proof
  tx-size bound interpolated with maxDepth).
- apps/app SubaccordCreatePage: local DEPTH_OPTIONS + DepthPicker deleted;
  kit component wired with `maxDepth={MAX_SAFE_TREE_DEPTH}` (16).
- apps/canon CreateListPage: raw "Tree depth" text CourtField removed from
  ADVANCED_COURT; kit DepthPicker rendered in the advanced court grid with
  `maxDepth={MAX_LIST_TREE_DEPTH}` (8) → ladder trims to 16/64/256 seats,
  "256 seats — max".

Verification: kit vitest 280/280 (3 new DepthPicker tests incl. Radix
select interaction; 2 stories), kit build+lint green, app tsc green +
37/37, canon tsc green + 74/74.
