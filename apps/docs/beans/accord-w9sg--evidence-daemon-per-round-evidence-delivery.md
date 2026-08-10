---
# accord-w9sg
title: Evidence daemon — per-round evidence delivery
status: completed
type: epic
priority: high
created_at: 2026-08-09T16:56:08Z
updated_at: 2026-08-09T21:12:30Z
parent: accord-qp7c
blocked_by:
    - accord-hoaj
---

See milestone accord-qp7c HANDOFF. This epic covers the off-chain evidence daemon changes.

Scope:

- Delivery handler: iterate evidence_hashes[0..=round], deliver all non-zero packages
- EVIDENCE-FORMAT.md: document multi-manifest packages (one manifest per round)
- SPEC.md: update delivery model for per-round evidence
- Tests: multi-round delivery verification
