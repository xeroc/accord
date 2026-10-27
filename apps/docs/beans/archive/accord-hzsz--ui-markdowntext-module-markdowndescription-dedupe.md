---
# accord-hzsz
title: ui — MarkdownText module + MarkdownDescription dedupe
status: completed
type: task
created_at: 2026-08-19T20:35:23Z
updated_at: 2026-08-19T20:35:23Z
parent: accord-zcjj
---

Add react-markdown + remark-gfm to packages/ui; export `MarkdownText` (sanitized markdown, safe-link semantics of the current MarkdownDescription: no raw HTML, urlTransform, target=_blank rel=noopener). Stories + vitest. Then migrate apps/app and apps/canon `MarkdownDescription` call sites onto it and DELETE both copies (their own headers ask for this single source of truth).

TDD: vitest cases for link safety + basic markdown render before migration. Verify: pnpm lint/build green in packages/ui, apps/app, apps/canon.

## Summary of Changes

- `packages/ui`: added `react-markdown` + `remark-gfm` deps; new `src/primitives/markdown-text.tsx` (`MarkdownText`, exported from the package root) with the apps/app MarkdownDescription security semantics — no raw HTML (no rehype-raw), default `urlTransform` strips unsafe protocols, links get `target=_blank rel="noopener noreferrer"`; optional `className`.
- TDD: `markdown-text.test.tsx` written first (RED: module missing), 5 cases — markdown render, GFM tables, raw-HTML escaping, safe-link attrs, `javascript:` stripped from hrefs (assertion adjusted to the real react-markdown v9 behavior: unsafe hrefs are emptied, the anchor survives inert).
- Stories: `markdown-text.stories.tsx` (Description + Untrusted) — green in the storybook chromium lane and `build-storybook`.
- Migration: apps/app `EvidenceManifest.tsx` uses `MarkdownText` from `@useaccord/ui`; deleted `MarkdownDescription.tsx` + its node:test file. apps/canon `EvidenceManifest.tsx` inline ReactMarkdown block (incl. deprecated `skipHtml`) replaced with `MarkdownText`. Both apps dropped `react-markdown`/`remark-gfm` deps — one renderer repo-wide.
- Verify: packages/ui lint/build/test green (unit 111, storybook 59) + build-storybook; apps/app lint/build/test green (33); apps/canon green (56) after building its `@useaccord/canon` dep (worktree had no dist — unrelated to this change).
