---
# accord-emy2
title: Wire format mode into CreateDispute.tsx — mode toggle, resolve-branch, download-at-submit-start, POST append, retry UX
status: todo
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T00:56:38Z
parent: accord-1696
---

Surgical additive glue. mode state; format mode renders EvidenceEditor instead of raw hash inputs; handleSubmit resolves {options,evidenceHash,manifest} by mode → verifyOptionHashes → download synchronously pre-await → spine UNCHANGED (L145-166) → publishEvidence after sendInstruction → on fail stay-on-form [Retry publish](POST-only)/[View dispute]. See HANDOFF §1/§3.
