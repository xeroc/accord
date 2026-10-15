---
# accord-0ytn
title: Commit path
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T09:05:00Z
parent: accord-ji4v
---

src/vote/commit.ts: salt gen (32B) persist-to-state, SDK commitHash+commit within commit window, DRY_RUN gate (log+notify instead of tx). AC: unit tests dry-run vs real path with fake client; window-edge rejection.

## Summary of Changes

- `apps/jurat/src/vote/commit.ts` — `commitVote(deps, plan, dryRun)`:
  - 32-byte salt via `node:crypto randomBytes`, **persisted before send**
    (crash between send and save would orphan the salt and forfeit reveal);
    retries reuse the persisted salt so the commitment is stable.
  - SDK facade wiring: `assertValidVote` (Plurality range) +
    `commit(client, …)` → `{instruction, commitment}`; commitment hex kept
    on the `VoteRecord` for bookkeeping.
  - Window gate mirrors `instructions/commit.rs` exactly:
    `review_end <= now < commit_end` (unix seconds, `CommitWindowClosedError`
    on violation, nothing built/persisted/sent).
  - DRY_RUN: instruction is still built + hashed, salt persisted, then
    log + notify instead of a tx; `committed` never flips on a dry run.
  - Idempotent: a `committed` record short-circuits (`alreadyCommitted`,
    no build, no send) — the chain would reject `CommitAlreadyExists`.
  - All IO injected (`AccordVotingClient`, `send`, `VoteStore`, `notify`,
    `now`) — no IO of its own; `VoteStore` is the narrow Epic-1 state-dir
    seam the reveal path (accord-qk0q) reads.
- `apps/jurat/src/vote/commit.test.ts` — 9 node:test cases: dry-run vs real
  path against a fake client, commitment round-trip against SDK
  `commitHash`, send-failure + retry salt reuse, dry-run→real reuse, window
  edges (999/1000/1999/2000/2500), already-committed no-op, invalid vote.
- Minimal `apps/jurat` package shell (package.json, tsconfig — SDK-style
  `tsc --noEmit` + `node --import tsx --test`) so the workspace sweep picks
  the module up; `@useaccord/jurat` joined the changesets fixed group +
  changeset added.
- Verified: `pnpm --filter @useaccord/jurat test` 9/9 green; `pnpm -r run
  build` + `pnpm -r run lint` green workspace-wide.
