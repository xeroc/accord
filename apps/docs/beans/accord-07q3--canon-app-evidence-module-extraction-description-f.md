---
# accord-07q3
title: Canon app — evidence module extraction + description field
status: completed
type: epic
priority: normal
created_at: 2026-08-13T02:08:00Z
updated_at: 2026-08-13T04:06:03Z
parent: accord-4dqb
blocked_by:
    - accord-9mut
---

Cross-cutting: extract manifest.ts/parse.ts/options.ts/publish.ts from apps/app → @useaccord/sdk/evidence; migrate apps/app; add `description` (markdown) field to accord-evidence/v1 (builder+parser+EVIDENCE-FORMAT.md); sanitized markdown render. see milestone §5,§6.
