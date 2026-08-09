---
# accord-hoaj
title: Program — extend Dispute.evidence_hash to per-round vector
status: todo
type: epic
priority: critical
created_at: 2026-08-09T16:56:01Z
updated_at: 2026-08-09T16:56:01Z
parent: accord-qp7c
---

See milestone accord-qp7c HANDOFF. This epic covers the on-chain program changes.

Scope:

- Dispute.evidence_hash → evidence_hashes: [[u8; 32]; MAX_APPEALS + 1]
- create_dispute writes evidence_hashes[0]
- appeal gains new_evidence_hash param, writes to evidence_hashes[current_round + 1]
- LiteSVM TDD tests
- layout_tests pass
