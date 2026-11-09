# @useaccord/landing

Static React SPA (Vite) for **useaccord.xyz** — the Accord landing page.

Built to `brand/DESIGN.md` (palette, type, voice). Deployed to GitHub Pages with a
custom domain (`public/CNAME`).

## Develop

```bash
pnpm install                 # from repo root (workspace)
pnpm --filter @useaccord/landing run dev
```

## Build

```bash
pnpm --filter @useaccord/landing run build   # → apps/landing/dist
pnpm --filter @useaccord/landing run preview # serve the build locally
pnpm --filter @useaccord/landing run lint    # tsc -b --noEmit
pnpm --filter @useaccord/landing run test    # node --import tsx --test
```

## Deploy

Push to `main` → `.github/workflows/landing-page.yaml` builds and publishes to
GitHub Pages. Enable in repo Settings → Pages → Source: **GitHub Actions**, and
add the custom domain `useaccord.xyz` (the `CNAME` is committed).

## Notes

- Tailwind v4 (CSS-first; no `tailwind.config`). Design tokens — colors, IBM
  Plex fonts, the expo motion curve — come from `@useaccord/ui` (`styles.css`
  owns the Fontsource imports; do NOT import fontsource locally).
- Landing-local base styles live in `src/index.css`.
- `og.svg` is an SVG social card. For maximum crawler compatibility, export a
  PNG (`og.png`) with embedded Plex and update the `og:image`/`twitter:image`
  refs in `index.html`.
