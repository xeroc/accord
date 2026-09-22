---
# accord-p5si
title: 'Docs: EVIDENCE-FORMAT §7.1 rewrite + daemon SPEC + ADR'
status: completed
type: task
priority: normal
created_at: 2026-09-22T11:35:20Z
updated_at: 2026-09-22T13:27:53Z
parent: accord-44pv
blocked_by:
    - accord-qudg
    - accord-bpxa
---

§7.1 loose per-file transport replaces archive-bundle; SPEC routes table; new ADR; docs sweep for 'archive-bundle' references.

## Summary of Changes

- EVIDENCE-FORMAT.md: §7.1 rewritten (v2 shipped = loose per-file; archive-bundle rejected with rationale), §3.2 + §8 filer flow updated, §11 TODO closed out
- SPEC.md: HTTP table (POST dispatch, PUT file, index fields, per-file GET), storage trait putFile/getFile/listFiles + {round}.files/ layout, v2 env vars
- ADR-0031 written + registered in index (next = 0032); MkDocs builds clean
