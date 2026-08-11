---
# accord-9df9
title: Add Publish evidence section to DisputeDetail.tsx — upload → verifyManifestHash → publishEvidence
status: todo
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T00:56:38Z
parent: accord-wbic
---

Additive, near the evidence-hash panel (L207-216). file-input → read manifest.yaml → verifyManifestHash(sha256==evidenceHashes[0]) → publishEvidence. Idempotent (daemon 201 no-op if already published). Doubles as recovery. See HANDOFF §1 recovery.
