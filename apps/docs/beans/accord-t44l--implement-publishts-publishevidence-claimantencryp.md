---
# accord-t44l
title: Implement publish.ts (publishEvidence = claimantEncrypt + POST; verifyManifestHash)
status: todo
type: task
created_at: 2026-08-11T00:56:37Z
updated_at: 2026-08-11T00:56:37Z
parent: accord-1d3i
---

publishEvidence uses claimantEncrypt from @useaccord/sdk/evidence, POSTs {ct,claimant_ephem_pub,wrapped,plaintext_hash} (base64) to POST /evidence/{subaccord}/{dispute}. verifyManifestHash gates the detail-page upload. See HANDOFF §4.
