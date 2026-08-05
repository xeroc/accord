# @accord/landing

Static Astro site for **useaccord.xyz** — the Accord landing page.

Built to `brand/DESIGN.md` (palette, type, voice). Deployed to GitHub Pages with a
custom domain (`public/CNAME`).

## Develop

```bash
pnpm install                 # from repo root (workspace)
pnpm --filter @accord/landing run dev
```

## Build

```bash
pnpm --filter @accord/landing run build   # → apps/landing/dist
pnpm --filter @accord/landing run preview # serve the build locally
```

## Waitlist (n8n)

The waitlist form POSTs `{ email, type, timestamp }` to an n8n webhook, mirroring
chainsquad.com's contract (the workflow routes on `type`). Set the endpoint via a
**public** env var (it ships to the client, so it is not secret):

```bash
# apps/landing/.env  (gitignored — local dev)
PUBLIC_N8N_WEBHOOK_URL=https://n8n.example.com/webhook/accord-waitlist
```

For the GitHub Pages build, set `PUBLIC_N8N_WEBHOOK_URL` as a repository
**variable** (Settings → Secrets and variables → Actions → Variables). The deploy
workflow passes it through to the build. If unset, the form degrades to a
"ping us on Telegram" message — it never throws.

## Deploy

Push to `main` → `.github/workflows/deploy-landing.yml` builds and publishes to
GitHub Pages. Enable in repo Settings → Pages → Source: **GitHub Actions**, and
add the custom domain `useaccord.xyz` (the `CNAME` is committed).

## Notes

- Tailwind v4 (CSS-first; tokens live in `src/styles/global.css`, no
  `tailwind.config`). Colors/type map `brand/DESIGN.md` §04/§05 verbatim.
- IBM Plex Sans/Mono self-hosted via `@fontsource` (no third-party request).
- The hero prologue is a one-shot animation that settles on the mechanism; it
  honors `prefers-reduced-motion` (static hero + readable cases) and dies on
  scroll so no visitor is trapped.
- `og.svg` is an SVG social card. For maximum crawler compatibility, export a
  PNG (`og.png`) with embedded Plex and update the `og:image`/`twitter:image`
  refs in `Layout.astro`.
