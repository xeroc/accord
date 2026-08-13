---
# accord-lfxx
title: Sanitized markdown render in manifest display
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T14:00:00Z
parent: accord-07q3
---

react-markdown + remark-gfm; no raw HTML; links target=_blank rel=noopener. Render description in EvidenceManifest (both apps). DoD: markdown displays; committed bytes unchanged (sha256 stable). Add a render test. see milestone §6, §3.

## Summary of Changes

Render the manifest `description` field as sanitized markdown in
`EvidenceManifest`, behind `react-markdown` + `remark-gfm`. Display-only — the
renderer never touches committed manifest bytes, so `sha256(manifest)` is stable
(the description-field builder/parser are unchanged here; this bean only adds
rendering).

### Scope note — "both apps"

`apps/canon` is not scaffolded yet (E1 not merged), so this implements
`apps/app` only. The component (`MarkdownDescription`) is self-contained and
mirrors directly into `apps/canon` once E1 lands (milestone §5 — canon mirrors
apps/app stack-for-stack).

### Security model

- **No raw HTML:** react-markdown is used with NO `rehype-raw`, so
  `<script>`/`<img onerror>` in the source are escaped to inert text, not
  executed (verified by render test).
- **Unsafe protocols stripped:** react-markdown's default `urlTransform`
  neutralizes `javascript:` URLs (verified by render test).
- **Links:** a custom `SafeLink` renderer forces `target="_blank"
  rel="noopener noreferrer"` on every anchor.

### Files

- `apps/app/.../MarkdownDescription.tsx` (NEW) — `react-markdown` +
  `remark-gfm` with the `SafeLink` anchor renderer; `source: string` prop.
- `apps/app/.../EvidenceManifest.tsx` — renders
  `<MarkdownDescription source={manifest.description} />` after the title when
  the description is non-empty.
- `apps/app/.../MarkdownDescription.test.ts` (NEW) — 4 render tests via
  `renderToStaticMarkup` (no DOM/jsdom needed): markdown formatting renders,
  raw HTML is escaped (no XSS), links get target/rel, `javascript:` stripped.
- `apps/app/package.json` + `pnpm-lock.yaml` — add `react-markdown` ^9.0.3,
  `remark-gfm` ^4.0.1.

### Verification (DoD)

- Markdown displays: ✔ (h1/strong/code render; 4 render tests pass).
- Committed bytes unchanged: ✔ — rendering is a pure display transform over
  `parsed.description`; `buildManifest`/`parseManifest` and the manifest bytes
  are untouched (the jnka backward-compat test still holds).
- `pnpm --filter @useaccord/app run {lint,test,build}` → clean / 21 pass / ✓.
- Workspace `pnpm run -r --filter "./packages/*" --filter "./apps/*" lint` →
  all green.
