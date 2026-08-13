---
# accord-ejoz
title: Init shadcn + brand palette + IBM Plex fonts + canon logo asset (SVG)
status: completed
type: task
created_at: 2026-08-13T02:08:00Z
updated_at: 2026-08-13T08:50:00Z
parent: accord-9mut
---

Port apps/app index.css tokens (ink/raised/amber/green/red, Plex Sans/Mono, dark-only). Add the registry-rows SVG logo (milestone § logo; two unchecked rows + one amber-verified). Add components.json. DoD: logo renders in a test element; tokens resolve. see DESIGN.md.

## Summary of Changes

- **`apps/canon/src/index.css`** — Tailwind v4 CSS-first config ported from
  apps/app: `@import` for Tailwind + tw-animate-css + IBM Plex Sans/Mono fonts
  (400/500/600/700). Brand `@theme` tokens (ink/raised/amber/green/red/
  text-primary/secondary) + shadcn `@theme inline` mapping + `:root` dark-first
  palette (identical hex values to apps/app) + brand aliases (--ink/--raised/
  --amber/--green/--red/--text) + `@layer base` (border/outline/font) +
  html/body/#root height + `.mono` utility. Feature-specific view styles
  (.page/.card/.grid etc.) NOT ported — those land with canon feature beans.
- **`apps/canon/public/favicon.svg`** — registry-rows glyph: dark #0A0E14 bg,
  two unchecked rows (muted #7D8590 outlines) + one amber-verified row
  (#F0A830 filled checkbox with ink checkmark). 32×32 viewBox.
- **`apps/canon/src/components/canon-logo.tsx`** — inline React component
  rendering the registry-rows glyph (scalable via className).
- **`apps/canon/components.json`** — shadcn config (radix-nova style, same
  aliases as apps/app: @/components, @/lib/utils, @/components/ui).
- **`apps/canon/src/lib/utils.ts`** — `cn()` helper (clsx + tailwind-merge).
- **`apps/canon/.env.example`** — VITE_DEVNET_RPC, VITE_MAINNET_RPC,
  VITE_EVIDENCE_DAEMON_URL, VITE_ACCORD_APP_URL (dispute deep-link target).

### Verification

- `pnpm --filter @useaccord/canon-app run lint` — clean (tsc -b --noEmit)
- `pnpm --filter @useaccord/canon-app run test` — 24/24 pass
- favicon.svg — valid XML (xml.dom.minidom parsed)
- CanonLogo component typechecks (JSX react-jsx)
