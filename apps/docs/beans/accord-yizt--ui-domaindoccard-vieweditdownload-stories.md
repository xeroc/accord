---
# accord-yizt
title: ui — DomainDocCard (view/edit/download) + stories
status: completed
type: task
created_at: 2026-08-19T20:35:23Z
updated_at: 2026-08-19T20:35:23Z
parent: accord-zcjj
---

packages/ui module: `DomainDocCard`. Read-only states: loading / missing-404 (loud, retry action slot) / tampered (verification failed) / ok (frontmatter header title+description, markdown body via MarkdownText). Editable mode: ONE textarea over the raw doc text, YAML frontmatter visually emphasized (mono + distinct background), locks when `editable` goes false (on submit); export the template-prefill constant (frontmatter title/description + '## Rules' stub). Download action: raw text file (fetch → blob → objectURL), evidence-doc pattern. Stays SDK-free: doc data in via props.

TDD: vitest state rendering, frontmatter-block emphasis, lock behavior, download triggers blob. Stories for each state + editable.

## Summary of Changes

- `packages/ui/src/patterns/domain-doc-card.tsx` (NEW): `DomainDocCard` — SDK-free, doc data via props. Read states: loading / missing-404 (loud, `retry` action slot) / tampered (verification-failed warning) / ok (frontmatter title+description header, markdown body via `MarkdownText`, hash footer). Editable mode: `editable` + `value`/`onValueChange` — ONE textarea over the raw doc text with the leading `---` frontmatter block visually emphasized (mono, distinct background) above it; textarea locks (disabled) the moment `editable` flips to false (submit). Download action follows the evidence-doc pattern (blob → objectURL → anchor click → revoke). Exports `DOMAIN_DOC_TEMPLATE` (frontmatter title/description + `## Rules` stub) and the `DomainDoc` state type from the package root.
- TDD: `domain-doc-card.test.tsx` written first (RED: module missing), 10 cases — four read states, download blob assertions, frontmatter emphasis, lock-on-submit, onChange propagation, absent-frontmatter, template shape.
- Stories: `domain-doc-card.stories.tsx` — Ok / Loading / Missing / Tampered / Editable (unlocked + locked side by side).
- Verify: packages/ui lint + build green; vitest unit 62/62 and storybook 64/64 green; `build-storybook` green.
