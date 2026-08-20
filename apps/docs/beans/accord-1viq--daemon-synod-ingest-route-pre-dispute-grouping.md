---
# accord-1viq
title: Daemon - synod ingest route + pre-dispute grouping
status: completed
type: task
created_at: 2026-08-18T19:14:00Z
updated_at: 2026-08-18T19:14:00Z
parent: accord-7k2y
---

Implementation half of accord-ybuq (rewritten scope). POST /evidence/synod/:case/:party (slot 0-6, unauthenticated - join-committed hash IS the commit), storage grouped by case PDA + slot, 409 once dispute bound. Existing dispute-keyed routes untouched. See milestone accord-daq8 HANDOFF.

## Summary of Changes

- `src/pipeline/synod-ingest.ts` (new) — pure pre-dispute grouping pipeline. Gates: case exists (404), `party < party_count` (400), `SynodCase.dispute` sentinel-bound (409), per-slot idempotency (same hash ⇒ 201 idempotent, different hash ⇒ 409). Keying is chain-derived: `subaccord` from the on-chain case, `dispute := case PDA`, `round := party slot` — client-supplied keying fields never trusted.
- Grouping rides the existing `EvidenceStore` key `{subaccord}/{dispute}/{round}` unchanged (a SynodCase PDA is a synod-program PDA and can never collide with an Accord Dispute PDA); `store.group(case)` = per-slot `get(0..party_count-1)` for siblings accord-lry5 (manifest) and accord-g1dy (deliver bridge). Zero store-trait changes.
- `src/chain/reader.ts` — `readSynodCase` (subaccord, partyCount, dispute) via `fetchMaybeSynodCase` from the new `@useaccord/synod` workspace dep.
- `src/server/handlers.ts` — `SynodIngestHandler` type + `ServerDeps.synodIngest`; `src/server/routes.ts` — `POST /evidence/synod/:case/:party` registered before the generic dispute-keyed routes (literal `synod` segment is not captured as `:subaccord`); `src/wire.ts` — handler wired over the reused ingest store adapter.
- `src/pipeline/ingest.ts` — `bytesEqual` exported for reuse (one-word change; dispute-keyed behavior untouched).
- Docs: daemon README HTTP API + SPEC endpoint table gained the synod POST row.
- Tests: `tests/synod-ingest.test.ts` — 7 pipeline tests (happy/slot-guard/404/409-bound/idempotent/conflict/malformed), all green; daemon suite 192 pass, `tsc --noEmit` + eslint clean; workspace `pnpm -r lint/build/test` green. Route-level HTTP tests are sibling accord-g1dy's scope.
