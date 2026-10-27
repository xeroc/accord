---
# accord-xq40
title: Update delivery handler for multi-hash evidence delivery
status: completed
type: task
priority: high
tags:
  - implementer
created_at: 2026-08-09T16:56:37Z
updated_at: 2026-08-09T17:32:25Z
parent: accord-w9sg
---

See milestone accord-qp7c HANDOFF §2, §4. Evidence daemon delivery: iterate evidence_hashes[0..=round], deliver all non-zero packages to drawn jurors. Each hash is a separate manifest/package.

## Summary of Changes

Implemented the per-round multi-hash delivery loop (ADR-0023) in the evidence
daemon. A juror drawn in round N now receives one re-encrypted package per
non-zero `evidence_hashes[k]` for `k in 0..=current_round`, round-ascending.
Today the SDK/on-chain field is still a single `evidence_hash`, so the loop
degenerates to round-0-only — it is multi-hash-ready and activates when the
ADR-0023 array + SDK regen land. Fully unit-tested with stubs (the multi-hash
path doesn't need the on-chain array).

**`src/pipeline/deliver.ts`** — the core change:

- `DisputeView`/`DeliverChainReader.readDispute` → `{ subaccord, evidence_hashes: Uint8Array[], current_round }`.
- `DeliverStore.get(subaccord, dispute, round)`.
- `deliver()` loops `evidence_hashes[0..=min(current_round+1, len)]`: skip the
  `[0u8;32]` sentinel, per-round integrity gate against `evidence_hashes[k]`,
  per-round re-encrypt; a gate failure (tampering) fails the whole delivery (409,
  no partial set). `DeliverOutcome` 200 → `{ rounds: [{ round, out, operator_ephem_pub }] }`.

**`src/server/handlers.ts`** — `DeliveryPayload` +round; `DeliverResult.body` →
`{ rounds: DeliveryPayload[] }`.

**`src/wire.ts`** — bridges today's single-hash SDK to the multi-hash port:

- `readDisputeDeliver` wraps `evidenceHash` → `[evidenceHash]` (ponytail: swap to
  `[...v.evidenceHashes]` once the SDK regen lands).
- `deliverStore.get(sa, d, round)`: round-0-only today (round>0 → null → 404);
  ponytail comment names the follow-up (ingest+store round support).
- `deliverHandler` maps `rounds[]` → the new body.

**Tests** — `tests/pipeline.test.ts`: updated the 6 round-0 deliver tests to the
new shape; added 5 multi-hash tests (3 non-zero hashes → 3 packages; sentinel
skip with no bundle fetch; per-round gate-fail → 409 whole; missing bundle for a
non-zero round → 404; `current_round` bounding withholds future-round evidence).
`src/server/{app,health}.test.ts` + `tests/wire.test.ts`: updated to the
`{rounds:[...]}` body shape.

**Untouched (round-0, by design).** `store/store.ts`, `store/s3.ts`,
`pipeline/ingest.ts`, `chain/reader.ts` — the public `EvidenceStore`/`EvidenceBundle`
stay round-0; the `wire.ts` adapter interprets `round`. This localizes the change
to the delivery path. Round>0 ingest/storage is deferred → draft `accord-9cmb`.

**Verify.** `tsc --noEmit` clean; `eslint .` clean; `bun test tests/pipeline.test.ts`
→ 23 pass / 0 fail (all deliver tests green, incl. the 5 new multi-hash ones).
Full daemon suite: 116 pass / 12 fail — the 12 are **pre-existing** RPC-stub
mismatches in `reader.test.ts`/`wire.test.ts` (`rpc.getAccountInfo` undefined,
stub mocks `client.accord.accounts.*.fetchMaybe` but the SDK calls `accord.rpc`),
present at baseline before this change; not caused by it and out of scope.
