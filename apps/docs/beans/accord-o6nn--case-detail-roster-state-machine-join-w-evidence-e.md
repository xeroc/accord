---
# accord-o6nn
title: Case detail - roster + state machine + join w/ evidence editor
status: todo
type: task
priority: normal
created_at: 2026-08-18T19:14:12Z
updated_at: 2026-08-18T19:14:38Z
parent: accord-5fe9
blocked_by:
    - accord-1viq
---

State-machine view of SynodCase, roster with joined bits + countdown. Join flow: port apps/app evidence module (EvidenceEditor structured format + markdown + publishEvidence) adapted to synod keying - encrypt to operator, POST /evidence/synod/:case/:slot, then SDK join with the bundle hash (stake S transfer). Blocked by daemon ingest route (accord-1viq).
