---
# accord-hn0g
title: Landing — Astro→React SPA on @useaccord/ui
status: completed
type: feature
created_at: 2026-08-19T05:22:04Z
updated_at: 2026-08-19T05:22:04Z
---

Convert apps/landing from static Astro to a Vite React SPA mirroring the sibling apps; landing is now a full @useaccord/ui consumer. Kit theme.css gains canonical brand mappings (--color-body/nearwhite/paper, --ease-expo — values already in tokens.css). Landing markup migrates text-muted→text-muted-foreground (kit semantic for #7d8590; kit 'muted' is a bg). Waitlist button = kit Button; submit logic extracted to testable src/lib/waitlist.ts (4 node:test cases). SEO head + JSON-LD + no-flash boot script baked into index.html; PUBLIC_N8N_WEBHOOK_URL→VITE_N8N_WEBHOOK_URL (deploy secret name unchanged, mapped in workflow). Hand-written sitemap.xml + self-contained 404.html replace @astrojs/sitemap/404.astro; Astro deps removed.

- [x] Kit brand/motion token mappings
- [x] Astro→React port (8 components, prologue effect, waitlist)
- [x] SEO/OG/JSON-LD/boot-script parity in index.html
- [x] Env var + deploy workflow mapping
- [x] sitemap.xml + static 404.html
- [x] build/lint/test green; live DOM+computed-style parity vs old Astro dist (all sampled selectors identical)
