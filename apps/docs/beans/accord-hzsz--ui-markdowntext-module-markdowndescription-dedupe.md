---
# accord-hzsz
title: ui — MarkdownText module + MarkdownDescription dedupe
status: todo
type: task
created_at: 2026-08-19T20:35:23Z
updated_at: 2026-08-19T20:35:23Z
parent: accord-zcjj
---

Add react-markdown + remark-gfm to packages/ui; export `MarkdownText` (sanitized markdown, safe-link semantics of the current MarkdownDescription: no raw HTML, urlTransform, target=_blank rel=noopener). Stories + vitest. Then migrate apps/app and apps/canon `MarkdownDescription` call sites onto it and DELETE both copies (their own headers ask for this single source of truth).

TDD: vitest cases for link safety + basic markdown render before migration. Verify: pnpm lint/build green in packages/ui, apps/app, apps/canon.
