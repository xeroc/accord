---
# accord-yizt
title: ui — DomainDocCard (view/edit/download) + stories
status: todo
type: task
created_at: 2026-08-19T20:35:23Z
updated_at: 2026-08-19T20:35:23Z
parent: accord-zcjj
---

packages/ui module: `DomainDocCard`. Read-only states: loading / missing-404 (loud, retry action slot) / tampered (verification failed) / ok (frontmatter header title+description, markdown body via MarkdownText). Editable mode: ONE textarea over the raw doc text, YAML frontmatter visually emphasized (mono + distinct background), locks when `editable` goes false (on submit); export the template-prefill constant (frontmatter title/description + '## Rules' stub). Download action: raw text file (fetch → blob → objectURL), evidence-doc pattern. Stays SDK-free: doc data in via props.

TDD: vitest state rendering, frontmatter-block emphasis, lock behavior, download triggers blob. Stories for each state + editable.
