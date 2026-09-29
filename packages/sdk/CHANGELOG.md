# @useaccord/sdk

## 0.3.1

### Patch Changes

- [#10](https://github.com/xeroc/accord/pull/10) [`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8) Thanks [@xeroc](https://github.com/xeroc)! - bump version number

## 0.3.0

### Minor Changes

- [#6](https://github.com/xeroc/accord/pull/6) [`6b5e6b8`](https://github.com/xeroc/accord/commit/6b5e6b8b2097f26c23820699802cb53afd28a990) Thanks [@xeroc](https://github.com/xeroc)! - Minimum juror position is now `min_stake` (ADR-0035): `draw_seat` requires free stake ≥ `min_stake` (the per-draw α·min_stake bond is reserved out of the floor — a juror holding exactly `min_stake` is drawable), the `stake` opening gate floors the first deposit at `min_stake`, and `reconcile_stake` ejects a fold landing strictly between 0 and `min_stake` — zero-weight leaf, remainder returned via the two-phase withdraw rail. An incoherent vote now drops the juror below the floor and ejects them outright. No IDL change.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- intial changeset release
