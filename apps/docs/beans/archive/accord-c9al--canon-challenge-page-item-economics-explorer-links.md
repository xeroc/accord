---
# accord-c9al
title: canon — challenge page item + economics + explorer links
status: completed
type: task
priority: normal
created_at: 2026-08-20T17:33:50Z
updated_at: 2026-08-20T17:33:54Z
---

ChallengePage: show the item being challenged (curated account + explorer link)
and an explicit cost breakdown (challenge stake = pct of accumulated, juror fees
= minJurySize x feePerJuror, total, pot on remove, forfeit on keep) mirroring
on-chain math. Explorer account links (env-template VITE_EXPLORER_ACCOUNT_URL,
{pubkey} placeholder, default solscan) on item table rows + item hero +
challenge page. Fix latent formatBps trailing-zero bug exposed by 0-digit
rendering.

## Addendum (icon-only explorer links)

- "View on explorer ↗" text (challenge card, item hero) and the table's bare "↗"
replaced with the lucide `ExternalLink` icon (icon-only anchor,
`aria-label="View on explorer"` kept). Verified live on all three surfaces: svg
rendered, no text, href correct.

## Addendum (subaccord deep link)

- `shared/explorer.ts`: new `accordSubaccordUrl(pubkey)` →
`${VITE_ACCORD_APP_URL}/#/subaccords/{pubkey}` (route verified against apps/app
`App.tsx`).
- ListDetailPage "Subaccord" row: Copyable + ExternalLink icon anchor
(aria-label "Open subaccord in Accord"). The only canon surface rendering the
Subaccord key (grepped: CreateListPage/ChallengePage/ItemDetailPage never
display it).
- Verify: tsc/build green; live — row shows copy + icon linking to
<https://app.useaccord.xyz/#/subaccords/6W4SvnF9…> with the real backing
Subaccord key.
