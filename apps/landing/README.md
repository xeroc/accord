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

## Waitlist (n8n)

The waitlist form POSTs `{ email, type, timestamp }` to an n8n webhook, mirroring
chainsquad.com's contract (the workflow routes on `type`). Set the endpoint via a
**client-exposed** env var (it ships to the browser bundle, so it is not secret):

```bash
# apps/landing/.env  (gitignored — local dev)
VITE_N8N_WEBHOOK_URL=https://n8n.example.com/webhook/accord-waitlist
```

For the GitHub Pages build, set `PUBLIC_N8N_WEBHOOK_URL` as a repository
**secret** (Settings → Secrets and variables → Actions). The deploy workflow
maps it to `VITE_N8N_WEBHOOK_URL` for the build. If unset, the form degrades
to a "ping us on Telegram" message — it never throws.

## Deploy

Push to `main` → `.github/workflows/landing-page.yaml` builds and publishes to
GitHub Pages. Enable in repo Settings → Pages → Source: **GitHub Actions**, and
add the custom domain `useaccord.xyz` (the `CNAME` is committed).

## Notes

- Tailwind v4 (CSS-first; no `tailwind.config`). Design tokens — colors, IBM
  Plex fonts, the expo motion curve — come from `@useaccord/ui` (`styles.css`
  owns the Fontsource imports; do NOT import fontsource locally).
- Landing-local rules (base styles, `.grid-texture`, the hero prologue) live in
  `src/index.css`.
- The hero prologue is a one-shot animation that settles on the mechanism; it
  honors `prefers-reduced-motion` (static hero + readable cases) and dies on
  scroll so no visitor is trapped.
- `og.svg` is an SVG social card. For maximum crawler compatibility, export a
  PNG (`og.png`) with embedded Plex and update the `og:image`/`twitter:image`
  refs in `index.html`.
