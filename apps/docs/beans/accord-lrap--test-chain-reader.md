---
# accord-lrap
title: Test chain reader
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T16:09:44Z
parent: accord-mwfq
blocked_by:
  - accord-h1v2
  - accord-9t95
---

---

assigned: tester
---

Stub RPC: drawn/not-drawn, state gates (premature fetch → not deliverable), operator resolution. Events fire on expected transitions.

See milestone accord-yjno HANDOFF §6 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Two Bun test suites (25 tests total) exercising `chain/reader.ts` under a
stubbed RPC and `chain/events.ts` decoders + subscription dispatch.

- `apps/evidence-daemon/tests/reader.test.ts` (14 tests) — stubs the SDK
  fetchers (`accord.client.accord.accounts.<acct>.fetchMaybe`) to return
  controlled maybe-accounts, then verifies:
  - **drawn / not-drawn** (`isDrawn`): a juror within the first `jurorCount`
    matches; an absent juror fails; entries at index `>= jurorCount` are
    padding and never match (incl. zero-pubkey tail); a real address parked in
    the padding zone is honoured only if `jurorCount` covers it.
  - **state gates** (`isDeliverable`): premature states (`Created`,
    `SnapshotPosted`, i.e. `state < Drawn`) are NOT deliverable — the daemon
    404s a GET before draw (HANDOFF §6 matrix); every state `>= Drawn`
    (Review/Commit/Reveal/RoundResolved/Final/Closed) is deliverable.
  - **operator resolution** (`readSubaccord`): returns the on-chain
    `evidence_operator` the daemon's Keyring resolves; missing account → null
    (→ daemon 404).
  - `readDispute` / `readRound` mapping (incl. the real `findRoundPda`
    derivation) + the pipeline composition `isDeliverable(dispute) &&
isDrawn(round, juror)` from HANDOFF §4.
- `apps/evidence-daemon/tests/events.test.ts` (11 tests) — pure decoder
  round-trips (DisputeCreated / JurorsDrawn / RulingFinalized), the
  `Program data:` parser, and `subscribeAccordEvents` dispatch via a stub
  `RpcSubscriptions` whose `logsNotifications` stream yields controlled
  notifications: each event fires on its expected transition, log noise fires
  nothing, multi-event-in-order, and a thrown handler is reported via
  `onError` while the loop survives to deliver the next event.
- Removed the prior `events.selfcheck.ts` (node:test) from accord-9t95 in
  favour of a single Bun runner for the daemon — consolidates the two test
  files under one command and covers the subscription path the selfcheck
  lacked.
- `apps/evidence-daemon/package.json`: added `"test": "bun test"`.

**Why Bun.** The daemon is a TypeScript/Bun application (SPEC.md, ADR-0011).
Bun resolves the extensionless internal imports of `@accord/sdk` (compiled
under Bundler moduleResolution) natively, which `node --test` cannot — so the
reader tests, which transitively load the SDK barrel, run under Bun. The SDK
itself is untouched.

**Verification.**

- `pnpm --filter @accord/evidence-daemon run test` — 25/25 pass (2 files).
- `pnpm --filter @accord/evidence-daemon run lint` — clean.
- `pnpm --filter @accord/sdk run lint && test` — clean, 43/43 pass (no
  cross-package regression).
