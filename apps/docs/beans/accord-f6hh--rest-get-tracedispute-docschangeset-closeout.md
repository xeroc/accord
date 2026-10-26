---
# accord-f6hh
title: REST GET /trace/:dispute + docs/changeset closeout
status: todo
type: task
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T09:32:58Z
parent: accord-0xih
---

Replay endpoint `GET /trace/:dispute?fromSeq=` (seal-filtered, reads TraceStore — works on any replica). Closeout: jurat SPEC.md module map + config rows, evidence-daemon SPEC.md HTTP API table + storage + config, both reference ADR-0037; changeset (lockstep). RED→GREEN: fromSeq pagination + seal filter; cross-epic e2e proof from milestone DoD (mock-LLM jurat → daemon → WS client) documented in Summary of Changes.
