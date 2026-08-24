# @useaccord/hanse

Static React SPA (Vite) for **hanse.useaccord.xyz** — the Hanse landing page
("The protocol for mutuals"). Same shell and voice as `apps/landing`, minus
the how-it-rules routes and the Open App nav link. Copy authority:
`meta/mutuals/03-website-copy/landing-page.md`; status claims must track
`meta/mutuals/07-brand-assets/messaging-guide.md` §6.

## Develop

```bash
pnpm install                                     # from repo root (workspace)
pnpm --filter @useaccord/hanse run dev
```

## Build

```bash
pnpm --filter @useaccord/hanse run build    # → apps/hanse/dist
pnpm --filter @useaccord/hanse run preview  # serve the build locally
pnpm --filter @useaccord/hanse run lint     # tsc -b --noEmit
pnpm --filter @useaccord/hanse run test     # waitlist seam tests
```

## Waitlist (n8n) — same list as useaccord.xyz

The form POSTs `{ email, type, timestamp }` to the same n8n webhook as the
Accord landing page (the workflow routes on `type`); `src/lib/waitlist.ts`
and its tests are shared verbatim. Set the endpoint via a client-exposed env
var:

```bash
# apps/hanse/.env  (gitignored — local dev)
VITE_N8N_WEBHOOK_URL=https://n8n.example.com/webhook/accord-waitlist
```

If unset, the form degrades to a "ping us on Telegram" message — it never
throws.

## Deploy

`public/CNAME` pins `hanse.useaccord.xyz`. Deploy mirrors the landing page's
GitHub Pages flow: build `apps/hanse/dist` and publish with the custom
domain (a workflow equivalent to `.github/workflows/landing-page.yaml` is
the remaining wiring when the subdomain DNS is ready).

## Notes

- Tailwind v4 (CSS-first). Design tokens — colors, IBM Plex fonts, the expo
  motion curve — come from `@useaccord/ui` (`styles.css` owns the Fontsource
  imports; do NOT import fontsource locally).
- Vocabulary rule (messaging guide §4): regulated-sector words never
  describe the product — the FAQ's "Is this insurance?" is the one
  appearance, and it's there to be denied.
- No hero prologue (that beat sequence is Accord's story); the hero is
  settled editorial on the shared kit `Backdrop`.
