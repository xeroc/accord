---
# accord-ges5
title: 'ui — DomainDocCard: download from missing state (failed publish)'
status: completed
type: task
priority: normal
created_at: 2026-08-20T16:23:37Z
updated_at: 2026-08-20T16:28:02Z
---

When putDomainDoc fails post-confirm (CreateListPage canon + SubaccordCreatePage app flip the card to missing), the authored doc only lives in form state. Add a ui-kit capability: DomainDocCard accepts the locally-held raw text and renders a Download action on the missing state (reuses downloadRawDoc, filename ${hash}.md). Wire both failed-publish call sites. TDD in packages/ui.

## Summary of Changes

- `packages/ui/src/patterns/domain-doc-card.tsx`: new optional `raw` prop — locally-held doc text (authored, unpublished). The missing state now renders a Download button beside the `retry` slot when `raw` is passed (reuses `downloadRawDoc`, filename `${hash}.md`). `ok`-state download unchanged (`doc.raw`).
- `packages/ui/src/patterns/domain-doc-card.test.tsx` (TDD, RED first): missing+raw blobs the local bytes via objectURL+anchor click; missing without raw renders no download button.
- `packages/ui/src/patterns/domain-doc-card.stories.tsx`: Missing story passes `raw` to demo the failed-publish shape.
- Wired both failed-publish call sites: `apps/canon/src/features/list/CreateListPage.tsx` (`raw={form.rulesDoc}`), `apps/app/src/features/subaccord/SubaccordCreatePage.tsx` (`raw={form.domainDoc}`).
- Verify: `@useaccord/ui` vitest 282/282 green (12 in domain-doc-card), tsc green; `@useaccord/ui` rebuilt (dist d.ts) → `@useaccord/canon-app` + `@useaccord/app` lint green.
