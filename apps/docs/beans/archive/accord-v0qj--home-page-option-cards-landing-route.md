---
# accord-v0qj
title: Home page — option cards landing route
status: completed
type: task
priority: normal
created_at: 2026-08-08T19:19:08Z
updated_at: 2026-08-08T19:20:37Z
parent: accord-uvru
---

Replace the `/` route (currently DisputeList) with a dedicated HomePage that presents all dApp options as cards (headline, description, goto button). Wire into App.tsx; keep /disputes as the list.

## Summary of Changes

- Added `apps/app/src/features/home/HomePage.tsx` — landing page with 4 option cards (Disputes, File a dispute, Subaccords, Create a subaccord). Each card: headline + description + goto `.cta` button; whole card is a `<Link>`.
- Wired `/` route to `HomePage` in `App.tsx`; kept `/disputes` as the dispute list. Updated the route docstring.
- Reuses existing brand classes (`.grid`/`.card`/`.cta`) + Tailwind color tokens (`text-text-secondary`); zero new CSS.
- Verified: `tsc -b --noEmit` (project lint) passes clean.
