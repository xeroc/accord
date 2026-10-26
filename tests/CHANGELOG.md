# @useaccord/tests

## 0.7.0

### Patch Changes

- [#24](https://github.com/xeroc/accord/pull/24) [`6303d7b`](https://github.com/xeroc/accord/commit/6303d7b440ff60f076e54c7d6566b229c8c2f60c) Thanks [@xeroc](https://github.com/xeroc)! - Jurat Surfpool e2e: `tests/src/jurat.spec.ts` drives the full agentic-juror duty loop green (reconcile scan → join gates → auto-join → dispute → VRF draw → mock-LLM verdict through the real provider ladder + runner → commit → reveal, with `Round.reveals` and the verdict notice asserted, dryRun OFF) plus the failing-LLM twin (retry ladder exhausted → clean abstain + alert, no vote). Joining the suite required a `loadBook` robustness fix: the first-run ENOENT path now duck-types `code` instead of `instanceof Error`, which breaks on cross-realm errors (jest ESM vm contexts, workers).
- Updated dependencies [[`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd), [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79)]:
  - @useaccord/sdk@0.7.0
  - @useaccord/canon@0.7.0
  - @useaccord/synod@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd), [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79), [`a23b1d2`](https://github.com/xeroc/accord/commit/a23b1d20aa7a8de469594546b8e9a60cf86977f5)]:
  - @useaccord/sdk@0.6.0
  - @useaccord/canon@0.6.0
  - @useaccord/synod@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.5.2
  - @useaccord/sdk@0.5.2
  - @useaccord/synod@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.5.1
  - @useaccord/sdk@0.5.1
  - @useaccord/synod@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.5.0
  - @useaccord/sdk@0.5.0
  - @useaccord/synod@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.4.0
  - @useaccord/sdk@0.4.0
  - @useaccord/synod@0.4.0

## 0.3.1

### Patch Changes

- [#10](https://github.com/xeroc/accord/pull/10) [`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8) Thanks [@xeroc](https://github.com/xeroc)! - bump version number
- Updated dependencies [[`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8)]:
  - @useaccord/canon@0.3.1
  - @useaccord/sdk@0.3.1
  - @useaccord/synod@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [[`6b5e6b8`](https://github.com/xeroc/accord/commit/6b5e6b8b2097f26c23820699802cb53afd28a990)]:
  - @useaccord/sdk@0.3.0
  - @useaccord/canon@0.3.0
  - @useaccord/synod@0.3.0

## 0.2.1

### Patch Changes

- Make ci go through again as we don't require evidence server in ci just yet
- Updated dependencies []:
  - @useaccord/canon@0.2.1
  - @useaccord/sdk@0.2.1
  - @useaccord/synod@0.2.1

## 0.2.0

### Minor Changes

- intial changeset release

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.2.0
  - @useaccord/sdk@0.2.0
  - @useaccord/synod@0.2.0
