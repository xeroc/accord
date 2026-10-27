---
# accord-nwkd
title: Branding — SynodLogo 'The Assembly' + SYNOD lockup + navbar
status: completed
type: task
created_at: 2026-08-18T19:13:33Z
updated_at: 2026-08-18T19:13:33Z
parent: accord-5fe9
---

Inline SVG React component (canon-logo.tsx pattern, 32×32, #0A0E14 bg): N muted #7D8590 party nodes seated in an arc converging on ONE central amber #F0A830 verdict diamond. Lockup: SYNOD / Convene the verdict. Navbar carries logo + wordmark. BRAND.md voice.

## Summary of Changes

- `components/synod-logo.tsx` — "The Assembly" as an inline SVG React component (canon-logo pattern, 32×32, #0A0E14 bg): five muted #7D8590 party nodes seated in an arc, convergence lines onto one central amber #F0A830 verdict diamond.
- `components/navbar.tsx` — canon navbar port: SynodLogo + SYNOD wordmark left; cluster Select + wallet connect/disconnect (Dialog) right. shadcn `button`/`dialog`/`select` copied into `components/ui/` (generic, generated).
- `public/favicon.svg` mirrors the Assembly glyph; hero carries SynodLogo + the `SYNOD / Convene the verdict.` lockup; Navbar wired into the App shell.

Verify: app lint ✅ build ✅ tests 48/48 ✅; browser smoke on built bundle — navbar (wordmark + svg + cluster selector; Connect correctly disabled in a walletless headless), hero logo, zero page errors; workspace CI trio exit 0.
