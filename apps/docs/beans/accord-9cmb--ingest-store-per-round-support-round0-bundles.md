---
# accord-9cmb
title: Ingest + store per-round support (round>0 bundles)
status: todo
type: task
priority: high
created_at: 2026-08-09T17:45:05Z
updated_at: 2026-08-09T20:23:16Z
parent: accord-w9sg
---

Discovered while implementing accord-xq40 (delivery handler multi-hash loop). The delivery loop iterates evidence_hashes[0..=current_round] and fetches a bundle per round via DeliverStore.get(subaccord, dispute, round). Today the store/ingest are round-0-only — the wire.ts adapter bridges round>0 to null (see ponytail comment in wire.ts). For round>0 (appeal) evidence to flow end-to-end, ingest + the store must gain a round dimension: store/store.ts EvidenceBundle +round, EvidenceStore get/put/delete/exists +round, BundleJson +round; store/s3.ts key {subaccord}/{dispute}/{round}; pipeline/ingest.ts EvidenceBundle + IngestStore +round, DisputeView +evidence_hashes, validate bundle.plaintext_hash == evidence_hashes[round]; server/routes.ts + handlers.ts POST /evidence/:subaccord/:dispute/:round (round optional, default 0); wire.ts drop the round-0-only bridge, pass round through. Gated on the on-chain evidence_hashes[] array (ADR-0023 / accord-pwa9) + SDK regen (reader exposes real array, not the [evidenceHash] wrap). Parent: accord-w9sg.
