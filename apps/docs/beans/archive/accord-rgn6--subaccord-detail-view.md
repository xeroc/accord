---
# accord-rgn6
title: Subaccord detail view
status: completed
type: task
created_at: 2026-08-07T23:09:07Z
updated_at: 2026-08-07T23:09:07Z
parent: accord-pjxh
---

Fetch subaccord by address param via fetchSubaccord(rpc, address). Display all params: staking token, min stake, alpha bps, windows (review/commit/reveal), max appeals, authority, evidence operator, risk type hash, depth, staker count, root hash, total stake, next index. Plex Mono for hashes/addresses/numbers. Button to navigate to /juror/stake?subaccord=:address. Button to file dispute → /disputes/new?subaccord=:address.

## Summary of Changes

- `SubaccordDetailPage` (`apps/app/src/features/subaccord/`) — `/subaccords/:address`.
  Reads one Subaccord via TanStack Query + a typed decoder fetch, then renders
  every on-chain param grouped into Pool / Tokens / Windows / Panel / Identity
  sections. Hashes/addresses/numbers render in `.mono` (IBM Plex Mono); 32-byte
  hashes truncate with a full-hex `title` tooltip; the zero key shows as
  "None (immutable)." for authority/evidenceOperator. Two CTAs link to
  `/juror/stake?subaccord=:address` and `/disputes/new?subaccord=:address`.
- `shared/fetch.ts` — `fetchSubaccord(rpc, address)` typed read over a raw Kit
  RPC via the SDK-exported `getSubaccordDecoder` (no signer; same decode pattern
  `findAllSubaccords` uses). The SDK's facade-bound `fetchSubaccord(accord,…)`
  needs a signer and its raw-rpc sibling isn't built yet (accord-siul); this app-
  local helper keeps detail views read-only until then.
- `shared/format.ts` — added `formatHash` (32-byte → hex, truncatable) and
  `formatWindow` (seconds → Nd/Nh/Nm).
- `App.tsx` — `/subaccords/:address` route; `index.css` — detail grid + ghost
  CTA styles.

The view surfaces the full Subaccord struct (incl. the ADR-0020/0021 fields
feeToken, appealWindow, revealThresholdBps, maxDrawAttempts) so the doc/code
match — the bean's headline field list is a subset.

Verified: `pnpm --filter @useaccord/app run typecheck` clean;
`pnpm --filter @useaccord/app run build` ✓ (244 kB js / 8.2 kB css).
