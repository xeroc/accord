---
# accord-z8fy
title: apps/app — render per-round evidence hashes (ADR-0023)
status: scrapped
type: task
priority: normal
created_at: 2026-08-09T22:56:48Z
updated_at: 2026-08-09T23:07:25Z
---

DisputeDetail.tsx consumes dispute.data.evidenceHashes (Array<ReadonlyUint8Array>, 4 slots, ADR-0023) but renders nothing for evidence. Add a per-round Evidence section: non-zero slots labelled by round + copyable; [0u8;32] sentinel shown as 'no new evidence (reuses prior rounds)'; only slots 0..=currentRound shown. CreateDispute.tsx unchanged — create_dispute filer arg is intentionally single (ADR-0023 §2), stored at [0]. Parent: accord-uvru.

## Reasons for Scrapping

Duplicate of accord-vken (created 8s earlier in the same session by accident — the create call returned successfully but the wrapping shell failed to parse the id). Same scope: apps/app per-round evidence rendering. accord-vken carries the completed work + summary.
