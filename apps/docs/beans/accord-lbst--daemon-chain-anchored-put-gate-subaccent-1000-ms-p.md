---
# accord-lbst
title: Daemon — chain-anchored PUT gate (?subaccord, 1000 ms poll)
status: completed
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T20:36:05Z
parent: accord-5p9j
---

apps/evidence-daemon server/domain.ts: PUT requires ?subaccord=<addr>. Resolve via chain/reader seam (fetchSubaccordMaybe), polling up to 1000 ms for commitment lag; then require domain_ref == hash. Missing after poll → 404 (anchor not found); mismatch → 400. Existing semantics preserved (hash mismatch → 400, cap → 413, idempotent 200, collision 409). GET untouched. Update daemon SPEC domain section (chain-gated PUT, create-first ordering).

TDD: route tests with injected fetcher seam: anchor-appears-after-delay → accepted; never → 404; wrong domain_ref → 400; no param → 400.

## Summary of Changes

- `pipeline/domain.ts` — chain-anchored PUT gate (create-first): `putDomain` takes the anchor address + a `readAnchor` port (`DomainAnchorReader`), polls ≤ `DEFAULT_ANCHOR_POLL_MS` (1000 ms, 100 ms interval, overridable via `anchorPollMs` for tests) for commitment lag, then requires `domain_ref == hash`. Order: hash shape → cap 413 → sha 400 → idempotency 200/409 → anchor gate (404 not-found / 400 mismatch) → write 201. `DomainPutOutcome` gains 404.
- `server/domain.ts` — PUT route requires `?subaccord=<addr>` (missing → 400, malformed base58 → 400; `ADDRESS` guard now exported from routes.ts) and passes it to the handler. GET untouched/ungated.
- `server/handlers.ts` — `DomainPutHandler` gains the `subaccord` param; `DomainPutResult` error union gains 404.
- `chain/reader.ts` — `SubaccordView`/`readSubaccord` expose `domainRef` (the SDK fetch is `fetchSubaccordMaybe`, unchanged).
- `wire.ts` — `domainPutHandler` injects the real anchor reader (readSubaccord → domainRef bytes).
- `server/domain.test.ts` — rewritten for the gate: anchor fixture map + injected reader seam; new tests: no param → 400, malformed → 400, never-appears → 404 (nothing stored), wrong domain_ref → 400, appears-after-lag → 201 (poll retried), idempotent re-PUT passes gate; all prior CAS semantics tests preserved.
- `SPEC.md` — route table PUT row (?subaccord required, chain gate, 404/400 semantics, create-first), on-chain interface table (`Subaccord.domain_ref`), storage-seam section (gate lives in pipeline, store stays chain-blind), layout comments.

Verify: `bun test` 260/260 green, `tsc --noEmit` + `eslint` clean.
