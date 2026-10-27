---
# accord-firh
title: Rename the packages to @useaccord/* repo wide
status: completed
type: task
priority: normal
created_at: 2026-08-07T02:47:27Z
updated_at: 2026-08-07T02:47:27Z
---

We now registered an organization on npmjs.com called `useaccord` and thus need
to rename our packages into that namespace using `@useaccord` before we can
publish them.

might as well use `git grep "@accord"` to find the places to rename

## Summary of Changes

Renamed the npm scope `@accord/` → `@useaccord/` repo-wide via a single
mechanical `sed` pass over every tracked file that contained the old scope,
excluding the immutable/historical record directories.

Packages renamed (package.json `name` + workspace deps):

- `@accord/sdk` → `@useaccord/sdk` (`packages/sdk`)
- `@accord/tests` → `@useaccord/tests` (`tests`)
- `@accord/evidence-daemon` → `@useaccord/evidence-daemon` (`apps/evidence-daemon`)
- `@accord/landing` → `@useaccord/landing` (`apps/landing`)

Touched 61 files total: 4 `package.json`, all TS imports + comments, docs
(AGENTS.md, README, quickstart, sdk, integration/security guides, SPECs,
Dockerfile, Makefile, Anchor.toml, landing assets), and regenerated
`pnpm-lock.yaml` workspace-importer entries via `pnpm install`.

Deliberately NOT touched (immutable-once-deployed / historical records, per
AGENTS.md):

- `apps/docs/adr/accord/*` — ADRs 0010 & 0015 + index still reference
  `@accord/sdk`; they record decisions under the name at the time. ADRs are
  not edited in place; a future ADR supersedes if needed.
- `apps/docs/beans/accord-*` — bean records are historical work logs; the old
  scope name is part of that history.

Secondary fix: renaming `@accord/sdk/evidence` → `@useaccord/sdk/evidence`
pushed `apps/evidence-daemon/src/keys/keyring.ts:2` past prettier's print
width; ran `lint:fix` to wrap the import multiline.

Verification:

- `make lint` — GREEN (sdk `tsc --noEmit` + evidence-daemon `eslint .`)
- `pnpm --filter @useaccord/sdk run build` — GREEN
- `pnpm --filter @useaccord/sdk run test` — 65/65 unit tests pass
