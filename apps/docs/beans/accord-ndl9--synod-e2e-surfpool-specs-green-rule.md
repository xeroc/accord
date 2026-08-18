---
# accord-ndl9
title: Synod e2e — Surfpool specs + green rule
status: todo
type: epic
priority: normal
created_at: 2026-08-18T05:27:58Z
updated_at: 2026-08-18T05:27:58Z
parent: accord-oylq
blocked_by:
    - accord-e4up
    - accord-lqw4
---

jest specs in tests/src driving the SDK facade against Surfpool; one file per instruction group + full-lifecycle. Reuse setup/env|cheats|tokens|fixtures — no copy-paste harness. GREEN RULE: make test must pass with every spec; skipping only for the offline CI lane. See milestone accord-oylq HANDOFF §1/§6.
