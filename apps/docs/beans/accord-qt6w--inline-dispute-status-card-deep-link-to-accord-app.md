---
# accord-qt6w
title: Inline dispute-status card + deep link to accord app
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T02:08:01Z
parent: accord-t877
---

Decode the backing accord Dispute PDA (CanonItem.active_dispute) via @useaccord/sdk decoders (raw-RPC read). Compact card: phase/round/final ruling. Deep link (VITE_ACCORD_APP_URL/disputes/:address, new tab). DoD: card shows live dispute phase; link opens accord app. see milestone §7.

## Summary of Changes

### DisputeStatusCard component

Created `apps/canon/src/features/evidence/DisputeStatusCard.tsx`:

- Fetches the Accord Dispute PDA via raw RPC (`getAccountInfo` + base64 decode)
- Decodes with `getDisputeDecoder()` from `@useaccord/sdk`
- Displays: dispute **phase** (DisputeState enum → human label), **round** number,
  and **final ruling** (canon-fixed [keep/remove], green/red colored) when Final
- **Deep link** to the Accord app: `${VITE_ACCORD_APP_URL}/#/disputes/${address}`
  (opens in new tab with `rel=noopener noreferrer`)
- Read-only — Canon never reimplements voting (milestone §7)

### ItemDetailPage integration

Wired `DisputeStatusCard` into the item detail page. When a CanonItem is
`Disputed` and has an `activeDispute`, the card appears above the evidence
manifest.

### Configuration

Added `VITE_ACCORD_APP_URL` to `.env.example` (default: `https://accord.pages.dev`).

### Tests

`apps/canon/src/features/evidence/dispute-status.test.ts` — 3 tests:

- Deep-link URL format (`{baseUrl}/#/disputes/{address}`)
- DisputeState enum lifecycle phases
- Canon ruling label mapping (0=keep, 1=remove, 255=no ruling)

### Verification

- Workspace lint: green
- Workspace build: green
- apps/canon tests: 13 total (5 challenge + 5 evidence display + 3 dispute status)
