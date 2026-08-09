---
# accord-9cmb
title: Ingest + store per-round support (round>0 bundles)
status: completed
type: task
priority: high
created_at: 2026-08-09T17:45:05Z
updated_at: 2026-08-09T20:23:16Z
parent: accord-w9sg
---

Discovered while implementing accord-xq40 (delivery handler multi-hash loop). The delivery loop iterates evidence_hashes[0..=current_round] and fetches a bundle per round via DeliverStore.get(subaccord, dispute, round). Today the store/ingest are round-0-only — the wire.ts adapter bridges round>0 to null (see ponytail comment in wire.ts). For round>0 (appeal) evidence to flow end-to-end, ingest + the store must gain a round dimension: store/store.ts EvidenceBundle +round, EvidenceStore get/put/delete/exists +round, BundleJson +round; store/s3.ts key {subaccord}/{dispute}/{round}; pipeline/ingest.ts EvidenceBundle + IngestStore +round, DisputeView +evidence_hashes, validate bundle.plaintext_hash == evidence_hashes[round]; server/routes.ts + handlers.ts POST /evidence/:subaccord/:dispute/:round (round optional, default 0); wire.ts drop the round-0-only bridge, pass round through. Gated on the on-chain evidence_hashes[] array (ADR-0023 / accord-pwa9) + SDK regen (reader exposes real array, not the [evidenceHash] wrap). Parent: accord-w9sg.

## Summary of Changes

The store, ingest pipeline, HTTP routes, and wiring now carry a `round`
dimension end-to-end, so round>0 (appeal) evidence flows through ingest and
storage instead of being bridged to null. The SDK regen gate (accord-v84s)
landed in source; this bean flips the daemon's chain reader to the real
`evidenceHashes` array and drops both round-0-only bridges in wire.ts.

- `src/chain/reader.ts` — `DisputeView.evidenceHash` (singular) →
  `evidenceHashes: readonly ReadonlyUint8Array[]` (the ADR-0023 array); reads
  `m.data.evidenceHashes`. This was the gate ("reader exposes real array").
- `src/store/store.ts` — `EvidenceBundle` +`round: number`; `EvidenceStore`
  `get`/`delete`/`exists` +`round` param; `BundleJson` +`round`;
  `serializeBundle`/`deserializeBundle` carry it; `EvidenceConflictError` +`round` field + message now names the round.
- `src/store/s3.ts` — object key `{subaccord}/{dispute}/{round}`; all four
  methods take `round` and pass it to `objectKey`.
- `src/pipeline/ingest.ts` — `EvidenceBundle` +`round`; `DisputeView`
  `evidence_hash` → `evidence_hashes: Uint8Array[]`; `IngestStore`
  exists/get/put +`round`; `ingest()` gains a `round` param, validates
  `bundle.round === round` and `bundle.plaintext_hash == evidence_hashes[round]`
  (out-of-bounds round + `[0u8;32]` sentinel both fall out as a natural 400
  mismatch); idempotency/conflict key is now `(dispute, round)`.
- `src/server/handlers.ts` — `IngestHandler` signature +`round: number`;
  doc updated.
- `src/server/routes.ts` — `POST /evidence/:subaccord/:dispute/:round` (round
  validated as a non-negative integer) added alongside the existing
  `POST /evidence/:subaccord/:dispute` (round optional, defaults to 0).
- `src/wire.ts` — dropped both ponytail round-0 bridges: `deliverStore.get`
  passes `round` straight through to the store; `readDisputeIngest`/
  `readDisputeDeliver` now map `v.evidenceHashes` to the pipeline array (no
  more `[evidenceHash]` wrap); bundle-shape adapters + the ingest handler carry
  `round`; Location is `/evidence/{subaccord}/{dispute}/{round}`.
- Doc-reality sync (rename cascade, per AGENTS.md): `events.ts`, `store.ts`,
  `handlers.ts`, `ingest.ts` comments now say `evidence_hashes`/`[round]`
  instead of the dropped singular `evidence_hash`.

**Tests.** `src/store/s3.test.ts`, `tests/pipeline.test.ts`, `tests/wire.test.ts`,
`tests/reader.test.ts` updated to the new shapes. Added 9 tests: per-round S3
key isolation / independent conflict / delete-isolation, and 6 ingest round
cases (round-1 stored at its own key + gated against `evidence_hashes[1]`;
round 0+1 coexist; path/bundle round mismatch → 400; out-of-bounds round → 400;
sentinel slot rejects a real hash → 400; negative round → 400).

**Verify.** `tsc --noEmit` clean; `eslint .` clean; non-RPC-stub suite green
(72/72 in s3 + pipeline + app). Full daemon suite: 125 pass / 12 fail — the 12
are the **pre-existing** RPC-stub mismatches in `reader.test.ts`/`wire.test.ts`
(`rpc.getAccountInfo` undefined: stubs mock `client.accord.accounts.*.fetchMaybe`
but the regenerated SDK fetchers call `accord.rpc` directly), identical to the
baseline documented by sibling accord-xq40 and unrelated to this change
(baseline with this change stashed: 116 pass / 12 fail). SDK `dist` rebuilt
locally (gitignored) so the daemon typechecks against the regenerated
`evidenceHashes` field; that rebuild is a build artifact, not a source change.
