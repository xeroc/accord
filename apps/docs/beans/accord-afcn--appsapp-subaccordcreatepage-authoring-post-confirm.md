---
# accord-afcn
title: apps/app — SubaccordCreatePage authoring + post-confirm publish
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

Create form: default = editable DomainDocCard (template prefill) → hash computed client-side (hashDomainDoc) as domain_ref; advanced = paste-existing-hash with live GET+verify preview; DELETE randomHex32 default. On tx CONFIRM → putDomainDoc(daemonUrl, bytes, { subaccord }). Failure → toast + card remains in missing state with retry (paste/file, client sha256 == on-chain ref check). Pure form/publish logic in createForm.ts-style module with node:test coverage (doc→hash→args; publish state machine: pending/published/failed→retry).

TDD: state-machine tests first. Verify: tsc + node:test green; manual flow against local daemon.
