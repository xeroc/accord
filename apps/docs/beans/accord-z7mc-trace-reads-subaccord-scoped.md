---
# accord-z7mc
title: Trace reads merged cross-cluster cycles at one dispute address — subaccord-scope every read surface
status: completed
type: bug
priority: critical
created_at: 2026-11-04T15:30:00Z
updated_at: 2026-11-04T15:30:00Z
---

Live incident (mainnet launch day): Fabian challenged boss 4atSyZ… ("Exams Measure Obedience…") creating dispute 2KZ4HRNn…; opening the watch screen instantly showed a verdict — HOLD @ 95% whose rationale adjudicated a DIFFERENT thesis ("Open Source Cannot Fund Critical Infrastructure") while the jurat was still deliberating.

Root cause chain (all verified against live clusters + both daemons):
1. Dispute PDAs are cluster-agnostic — `[dispute, filer, nonce]` under the same program IDs everywhere. Devnet's counter hit 16 on Oct 28 (the Open Source challenge, same filer wallet); mainnet went live Nov 4 and climbed to 16 the same day → the SAME address 2KZ4… hosts two different disputes under two courts (subaccord 2KWDALYw… devnet / 9Uu9XMBc… mainnet).
2. FsTraceStore.readEvents deliberately scanned EVERY `traces/{sub}/{dispute}/` shard ("the read API is dispute-keyed") — both cycles replayed as one record; api.useaccord.xyz and api.devnet.useaccord.xyz served byte-identical merged corpora.
3. The client (inveigo AdjudicationScreen) takes the FIRST verdict frame and dedups on `(juror, seq)`; both cycles ran the same juror hot key with seq restarting at 1 → the Oct-28 verdict won and the REAL Nov-4 verdict (HOLD @ 0.72, correct thesis) was silently deduped away forever.

## Acceptance (TDD)
- [x] RED: GET /trace without `?sub=` → 400 (was 200 merged); WS /watch without `?sub=` → 400 (was 404)
- [x] GREEN: every read surface scoped — GET /trace `?sub=` required, WS /watch `?sub=` required (ring/subscriber keys = `(subaccord, dispute)`), FsTraceStore/S3TraceStore read one court shard, public stamp re-keyed `traces-public/{sub}/{dispute}`, filer tokens minted at `POST /trace-token/{subaccord}/{dispute}` and verify per (subaccord, dispute); signed message format frozen (the on-chain filer check on the serving cluster is the cross-cluster guard)
- [x] Store isolation tests: two courts' records at one dispute address never mix (fs + s3); token for court A does not verify for court B
- [x] evidence-daemon 444/444 green, tsc + eslint clean; SPEC.md rows + ADR-0037 amendment; changeset
- [x] Consumer: inveigo app passes BossView.subaccord on every read (sibling repo, changeset there)

## Summary of Changes

- `src/store/trace.ts` — TraceStore port: readEvents/markPublic/isPublic take (subaccord, dispute); invariant docs
- `src/store/trace-fs.ts`, `src/store/trace-s3.ts` — single-shard reads, re-keyed stamps
- `src/server/trace.ts` — required `?sub=` guard, scoped gate + replay seams
- `src/server/watch.ts` — composite fan-out keys, `?sub=` guard, authorize(sub, dispute, token)
- `src/server/trace-token.ts` — mint route `/:subaccord/:dispute`, (sub, dispute)-keyed tokens
- `src/server/trace-public.ts`, `src/main.ts` — scoped stamp + fan-out/authorize wiring
- Ops follow-up (NOT code): both daemons served this dispute tokenless on a HOLD (read gate open or stamp wrong — wire.test pins the gate, so check deployment env/config); the shared/cross-posted store roots should be split per cluster so devnet cycles never land beside mainnet ones
