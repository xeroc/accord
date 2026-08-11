---
# accord-f76k
title: 'Test: format-mode submit + POST-fail retry (no re-create)'
status: todo
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T00:56:38Z
parent: accord-1696
blocked_by:
    - accord-emy2
---

Component/jest test. Format submit → dispute on-chain with evidence_hashes[0]==sha256(manifest) + options[i]==sha256(salt‖label). sendInstruction ok + POST fail → [Retry publish] runs publishEvidence ONLY, dispute NOT re-created (no PDA collision/orphan). See HANDOFF §6.
