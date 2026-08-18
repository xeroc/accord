---
# accord-lry5
title: Daemon - assembled manifest GET + post-file verification
status: todo
type: task
created_at: 2026-08-18T19:14:01Z
updated_at: 2026-08-18T19:14:01Z
parent: accord-7k2y
---

GET /evidence/synod/:case: assembled multi-bundle manifest (ADR-0017 + party field). Pre-file: partial per-party view. Post-file: recompute H(case_pda || h_0...h_{N-1}) vs Dispute.evidence_hashes[0] -> verified flag; mismatch refuses juror assembly.
