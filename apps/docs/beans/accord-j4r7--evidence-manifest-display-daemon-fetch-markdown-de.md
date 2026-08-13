---
# accord-j4r7
title: Evidence manifest display (daemon fetch + markdown description)
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T02:08:01Z
parent: accord-t877
---

Fetch decrypted manifest from the daemon (useManifest); render title/options/entries + description as sanitized markdown. DoD: manifest renders for a disputed item; description formats. see milestone §6.

## Summary of Changes

### SDK evidence module — fetchManifest extraction

Added `packages/sdk/src/evidence/fetch.ts` — framework-agnostic manifest fetch
(`GET /evidence/{subaccord}/{dispute}/{round}`). Both apps wrap it in React
Query hooks. Exported via the evidence barrel.

### parseManifest regex fix

Fixed a pre-existing regex bug in `parseManifest` where the option/entry line
patterns (`/^\s+- \{ (.+) \ }$/`) had a double-space before the closing brace
that never matched real YAML output. Rewrote the field extraction to use
simpler patterns that match against the full line directly. The bug was
undetectable before because no unit test exercised `parseManifest`.

### apps/canon — evidence display

- `features/evidence/useManifest.ts` — React Query hook wrapping the SDK's
  `fetchManifest` (mirrors apps/app's pattern)
- `features/evidence/EvidenceManifest.tsx` — fetches + displays the manifest:
  title, **description (sanitized markdown via react-markdown + remark-gfm,
  `skipHtml`, links `target=_blank rel=noopener noreferrer`)**, canon-fixed
  options, evidence entries, and metadata footer
- `features/evidence/ItemDetailPage.tsx` — minimal item detail route showing
  item state + EvidenceManifest (when disputed) + challenge button
- `features/evidence/evidence.test.ts` — 5 tests: description extraction,
  empty description, markdown preserved verbatim (sha256 stable), multiline
  preservation, special chars preservation
- App.tsx updated with `/items/:address` route
- Providers updated with React Query `QueryClientProvider`
- Added `react-markdown` + `remark-gfm` dependencies

### Verification

- Workspace lint: green (all packages + apps)
- Workspace build: green (all packages + apps)
- apps/canon tests: 10 pass (5 challenge + 5 evidence display)
- apps/app tests: 18 pass (unaffected by parseManifest fix)
- SDK tests: 89 pass
