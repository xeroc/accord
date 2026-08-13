---
# accord-3sw6
title: Build useCanon hook + shared RPC/fetch/format utilities
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T08:30:00Z
parent: accord-9mut
---

Shared: rpc.ts (raw Kit RPC), fetch.ts (raw-RPC decode via @useaccord/canon decoders — mirror apps/app fetchSubaccord pattern), format.ts (shortenAddress, time windows, bps), getProgramAccounts scan helper + CanonItem memcmp-on-list helper. DoD: can fetch+decode a CanonList + CanonItem by address. see milestone §2,§4.

## Summary of Changes

- **`apps/canon/package.json`** — new `@useaccord/canon-app` workspace package
  (mirrors apps/app deps: @solana/kit, @solana/connector, @useaccord/canon,
  @useaccord/sdk, React, Tailwind). Scripts: lint/build (`tsc -b --noEmit` until
  Vite scaffold lands), test (`node --import tsx --test`).
- **`apps/canon/tsconfig.json`** — extends tsconfig.base.json, mirrors apps/app
  (ESNext/Bundler, react-jsx, DOM libs, @/* path alias).
- **`apps/canon/src/shared/rpc.ts`** — `useCanon()` hook (Canon facade from
  ConnectorKit signer + cluster) + `useClusterRpc()` read-only RPC. Mirrors
  apps/app/src/shared/rpc.ts.
- **`apps/canon/src/shared/fetch.ts`** — `fetchCanonList`/`fetchCanonItem`
  single-account reads (raw-RPC decode via SDK codec, no signer needed) +
  `findAllCanonLists`/`findAllCanonItems`/`findCanonItemsByList` scan helpers
  (getProgramAccounts with discriminator + memcmp filters).
  `CANON_ITEM_LIST_OFFSET = 40n` (8-byte disc + 32-byte account — confirmed
  against generated codec struct order).
- **`apps/canon/src/shared/format.ts`** — `shortenAddress`, `shortAddress`,
  `formatBigInt`, `formatHash`, `formatWindow`, `timeRemaining`, `formatBps`,
  `ITEM_STATE_LABELS` (Canon ItemState enum).
- **`apps/canon/src/shared/index.ts`** — barrel export.
- **`apps/canon/src/shared/format.test.ts`** — 24 unit tests covering all
  format helpers + `CANON_ITEM_LIST_OFFSET` (all pass).
- **`apps/canon/src/vite-env.d.ts`** — vite/client type reference.
- **`apps/canon/.gitignore`** — dist/node_modules.
- **`pnpm-lock.yaml`** — updated for the new workspace package.

### Verification

- `pnpm --filter @useaccord/canon-app run lint` — clean (tsc -b --noEmit)
- `pnpm --filter @useaccord/canon-app run build` — clean (tsc -b --noEmit)
- `pnpm --filter @useaccord/canon-app run test` — 24/24 pass
