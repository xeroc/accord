---
# accord-jnka
title: Add `description` (markdown) field to accord-evidence/v1
status: todo
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T02:08:01Z
parent: accord-07q3
---

Builder + parser: top-level optional `description` (markdown text). Update EVIDENCE-FORMAT.md §3 schema + field reference. DoD: round-trip buildManifest→parseManifest preserves description; sha256 stable when absent (backward compatible). see milestone §6, §3.
