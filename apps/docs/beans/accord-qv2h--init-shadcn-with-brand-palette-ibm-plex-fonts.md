---
# accord-qv2h
title: Init shadcn with brand palette + IBM Plex fonts
status: completed
type: task
created_at: 2026-08-07T23:08:58Z
updated_at: 2026-08-08T00:00:00Z
parent: accord-cb9q
---

Run shadcn init (vite template, Tailwind v4). Map brand palette to CSS variables: --background=#0A0E14 (ink), --card=#11161D (raised), --border=#1F2630, --primary=#F0A830 (verdict amber), --destructive=#F85149 (slash red), --success=#3FB950 (confirm green). Add @fontsource/ibm-plex-sans + @fontsource/ibm-plex-mono. Set font-family CSS vars. Add base shadcn components: Button, Card, Input, Badge, Alert, Select, Separator, Skeleton, Sonner.

## Summary of Changes

Initialized shadcn/ui (Radix base, Nova preset) on `apps/app` with the Accord
brand palette and IBM Plex type system. Dark-first: `:root` carries the ink
palette directly (no `.dark` toggle — the app is always dark per BRAND.md).

- `npx shadcn@latest init --template vite --base radix --preset nova` → created
  `components.json`, `src/lib/utils.ts` (cn helper), `src/components/ui/button.tsx`.
- `npx shadcn@latest add card input badge alert select separator skeleton sonner`
  → 8 more components in `src/components/ui/`.
- `src/index.css` rewritten: brand palette in `:root` —
  `--background:#0A0E14` (ink), `--card:#11161D` (raised), `--border:#1F2630`,
  `--primary:#F0A830` (verdict amber), `--destructive:#F85149` (slash red),
  `--success:#3FB950` (confirm green, added to `@theme inline` for
  `text-success`/`bg-success` utilities). Foreground: `#f0f6fc` (nearwhite),
  muted: `#7d8590`.
- Fonts: `@fontsource/ibm-plex-sans` (400–700) + `@fontsource/ibm-plex-mono`
  (400–600) imported in CSS. `--font-sans` + `--font-mono` set in `@theme inline`.
  Removed the Nova preset's Geist font.
- `sonner.tsx` simplified: hardcoded `theme="dark"` (removed next-themes dep —
  the app has no theme toggle).
- `App.tsx` updated: uses shadcn `<Button>` + mounts `<Toaster />`.
- `tsconfig.json`: added `baseUrl` + `paths` (`@/*` → `./src/*`).
- `vite.config.ts`: added `resolve.alias` for `@`.
- Removed unused deps: `@fontsource-variable/geist`, `next-themes`, `shadcn`.

Deps added by shadcn: `class-variance-authority`, `clsx`, `lucide-react`,
`radix-ui`, `tailwind-merge`, `tw-animate-css`, `sonner`.
Deps added for fonts: `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`.

Verified: `pnpm --filter @useaccord/app run lint` (tsc --noEmit) passes;
`pnpm --filter @useaccord/app run build` produces static dist with IBM Plex
woff2/woff font assets bundled (47 KB CSS, 240 KB JS).
