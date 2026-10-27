---
# accord-k6y2
title: 'canon — ListDetailPage: upload missing rules doc (recovery publish)'
status: completed
type: task
priority: normal
created_at: 2026-08-20T16:31:58Z
updated_at: 2026-08-20T16:33:53Z
---

DomainDocPanel (canon) only offers Retry on the missing state. Add optional `subaccord` prop: when the doc is missing and the anchor is known, offer Upload rules document — file bytes client-verified (verifyDomainDoc sha256 == rules_hash) then published via putDomainDoc against the backing Subaccord (daemon gate: domain_ref == hash). On success invalidate the domain-doc query so the card flips to ok. Wire ListDetailPage (list.data.subaccord).

## Summary of Changes

- `apps/canon/src/features/domain/DomainDocPanel.tsx`: new optional `subaccord` prop (daemon PUT anchor). When the doc is missing and the anchor is set, the card's action row gains "Upload rules document": file bytes client-verified (`verifyDomainDoc` sha256 == rules hash) → `putDomainDoc` against the backing Subaccord → on success `invalidateQueries(["domain-doc", hash])` flips the card to ok. Publishing state disables both actions; failures toast via `describeError`. Retry behavior unchanged when no anchor is passed.
- `apps/canon/src/features/list/ListDetailPage.tsx`: panel now receives `subaccord={list.data.subaccord}`.
- Verify: `@useaccord/canon-app` lint (tsc) + build green; SDK domain contract `node --test` 17/17 (verify/PUT paths). Live recovery smoke against a daemon+Surfnet not run here — building blocks are the same SDK fns proven live in accord-afcn.
