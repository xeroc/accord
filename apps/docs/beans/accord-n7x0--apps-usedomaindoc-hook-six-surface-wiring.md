---
# accord-n7x0
title: apps — useDomainDoc hook + six-surface wiring
status: completed
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T20:35:24Z
parent: accord-zcjj
blocked_by:
  - accord-yizt
---

Thin per-app `useDomainDoc(daemonUrl, hash)` (~10 lines over SDK fetchDomainDoc, cache keyed by hash; fetch/verify logic stays single-source in the SDK). Wire DomainDocCard into: apps/app SubaccordDetailPage + Voting; apps/canon ListDetailPage + ItemDetailPage + ChallengePage + SubmitItemPage. Daemon URL from existing VITE_EVIDENCE_DAEMON_URL config.

Verify: tsc green both apps; manual smoke against local daemon (fs backend) with a published doc.

## Summary of Changes

- Per-app `features/domain/DomainDocPanel.tsx` (apps/app + apps/canon): `useDomainDoc(hash)` — thin React Query hook over the SDK's single-source `fetchDomainDoc` (queryKey `["domain-doc", hash]`, staleTime ∞ since CAS bytes are immutable), mapping results onto `DomainDocCard` states (pending→loading, `404`→missing, `sha256 verification`→tampered, success→ok). `DomainDocPanel` renders the card with a Retry refetch action on the missing state; zero/absent hash renders nothing. `hexIfSet(bytes)` helper exports lowercase 64-hex, undefined on all-zero refs. Daemon URL via existing `VITE_EVIDENCE_DAEMON_URL` config (apps/app reuses `evidence/config.ts`).
- Six surfaces wired:
  - apps/app `SubaccordDetailPage` — card under the params grid, keyed off `SubaccordView.domainRef`.
  - apps/app `Voting` — subaccord query (`fetchSubaccord`) surfaces `domainRef`; card sits under the header so jurors see the rules they vote under.
  - apps/canon `ListDetailPage` — card after `ListParams`, keyed off `CanonList.rulesHash`.
  - apps/canon `ItemDetailPage` — card above per-state sections, keyed off the parent list's `rulesHash`.
  - apps/canon `SubmitItemPage` — card above the submit form (what submitters agree to).
  - apps/canon `ChallengePage` — card under the header from the preview ctx's `listData.rulesHash`.
- Verify: `pnpm lint` (tsc) + `build` + `test` green in apps/app (33 pass) and apps/canon (56 pass). Manual smoke: fs-backend daemon on :18080 → `useaccord domain:put` → 201 → `domain:get` prints hash/type/title/description/body (no version) → raw GET returns identical bytes with `ETag: {hash}`, `Cache-Control: immutable`, `Content-Type: text/markdown`. Daemon stopped after smoke.
