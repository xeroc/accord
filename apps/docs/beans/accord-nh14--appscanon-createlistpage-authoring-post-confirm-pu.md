---
# accord-nh14
title: apps/canon — CreateListPage authoring + post-confirm publish
status: todo
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T20:35:24Z
parent: accord-5p9j
blocked_by:
    - accord-uecf
    - accord-lbst
    - accord-yizt
---

Same flow as apps/app for rules_hash: editable DomainDocCard default (template prefill), paste-hash advanced with preview (replaces the bare manual-hex field), hash client-side, create_list after confirm → putDomainDoc against the backing Subaccord (derive via SDK findSubaccordPda/queries — domain_ref := rules_hash). Retry identical.

TDD: pure-logic tests for form/publish state machine first. Verify: tsc + node:test green.
