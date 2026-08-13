---
# accord-jr4t
title: Home page — generic browser + featured + create CTA
status: completed
type: task
priority: normal
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T04:10:00Z
parent: accord-5t0a
blocked_by:
  - accord-xe9s
---

/ route: reuse list browser + a 'Create list' CTA + featured slot. DESIGN.md-compliant (left-biased, not centered-everything). DoD: home renders lists + CTA routes to /lists/new. see milestone §10, DESIGN.md §08.

## Summary of Changes

Home route (`/`) now resolves to a dedicated, left-biased `HomePage` that reuses
the `ListBrowser` for the live list grid + featured slot, instead of mounting
the browser (with its own page header) directly.

### `apps/canon/src/features/home/HomePage.tsx` (new)

- Left-biased hero: `CanonLogo` glyph + `Canon.` title (text-3xl, left-aligned)
  - lede (muted, `max-w-prose`) + primary amber `Create a list.` CTA → `/lists/new`.
    Content is left-aligned (`items-start`), not centered-everything (DESIGN.md §08).
- Renders `<ListBrowser />` below the hero for the grid + featured slot.

### `apps/canon/src/features/list/ListBrowser.tsx` (refactored to reusable body)

- Dropped the integrated `<main class="page">` + `<header>` (title / lede /
  Create-CTA) so the home route can own a left-biased hero without a double
  header. `ListBrowser` is now a `<section aria-label="Canon lists">` body:
  featured slot + grid + pagination + empty/loading/error states.
- Featured slot, pagination, dedup, and all sub-components unchanged.
- Docstring updated to record the header now lives in `HomePage`.

### `apps/canon/src/App.tsx`

- `/` → `<HomePage />` (was `<ListBrowser />`); route-table comment updated.

### Verification

- `tsc -b --noEmit` reports zero errors in `HomePage.tsx`, `ListBrowser.tsx`,
  `App.tsx` (confirmed via grep — none of my files appear in the diagnostics).
- Pre-existing diagnostics in `features/challenge/*` and `features/evidence/*`
  (`@useaccord/sdk/evidence` missing `buildManifest`/`parseManifest`/etc.) are
  unrelated to this bean — they reproduce on HEAD (c99c756) and belong to the
  not-yet-merged E2 evidence-extraction epic. This task did not touch them.

### DoD

- [x] Home renders lists (HomePage → ListBrowser grid).
- [x] CTA routes to `/lists/new` (hero Link + preserved EmptyState CTA).
- [x] Left-biased, not centered-everything.
- [x] Featured slot preserved.
