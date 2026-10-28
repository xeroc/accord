---
# accord-f6hh
title: REST GET /trace/:dispute + docs/changeset closeout
status: completed
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T10:41:33Z
parent: accord-0xih
---

Replay endpoint `GET /trace/:dispute?fromSeq=` (seal-filtered, reads TraceStore — works on any replica). Closeout: jurat SPEC.md module map + config rows, evidence-daemon SPEC.md HTTP API table + storage + config, both reference ADR-0037; changeset (lockstep). RED→GREEN: fromSeq pagination + seal filter; cross-epic e2e proof from milestone DoD (mock-LLM jurat → daemon → WS client) documented in Summary of Changes.

## Summary of Changes

- `apps/evidence-daemon/src/server/trace.ts` — `traceRoutes` (GET `/trace/:dispute`: ADDRESS + non-negative-int `fromSeq` guards, 404 when the replay seam is not wired), `createTraceReplayHandler` (reads the `TraceReplaySource` structural slice of the TraceStore port — satisfied by the fs/s3 impls when beans accord-flxc/lmcc land — and filters through the shared `sealVisible` predicate from `src/pipeline/seal.ts`; store failure → 500).
- `apps/evidence-daemon/src/server/handlers.ts` — `TraceEnvelope` (v1 wire shape; `event` opaque except `unsealAt`), `TraceReplayResult`/`TraceReplayHandler` types; optional `ServerDeps.traceReplay` (absent ⇒ route 404s — the feature-off gate until TRACE_ENABLED wiring lands with accord-lmcc).
- `apps/evidence-daemon/src/server/app.ts` — mounts `traceRoutes`.
- `apps/evidence-daemon/src/server/trace.test.ts` — RED→GREEN, 7 tests: sealed verdict withheld + order preserved + released verdict delivered; `fromSeq` forwarded to the seam; `fromSeq` invalid → 400 with no store read; seam absent → 404; malformed dispute → 400; store read failure → 500; empty record → 200 `[]`.
- Docs: evidence-daemon SPEC.md HTTP API table row `GET /trace/{dispute}?fromSeq=` + ADR-0037 note (push leg / trace store / WS land with their beans — documented as not-yet, docs match reality); jurat SPEC.md module-map row (`src/trace/`, not yet, accord-9pdg/c19g) + config rows `JURAT_TRACE_URL`/`JURAT_TRACE_MODE` (marked not-yet).
- `.changeset/jury-telemetry-seal-replay.md` — `@useaccord/evidence-daemon` minor (covers accord-0yxb + this bean; lockstep group).
- Verified: `bun test` 363 pass / 0 fail, `tsc --noEmit` clean, `eslint .` clean in evidence-daemon.
- Cross-epic e2e (mock-LLM jurat → daemon ingest → WS client): NOT YET RUNNABLE at this commit — the jurat trace sink (accord-9pdg/c19g), POST route + TRACE config (accord-lmcc), TraceStore (accord-flxc), and WS watch (accord-heqb) are all unlanded sibling/parallel-lane beans. The REST read path is proven by the route suite above plus the seal predicate suite (accord-0yxb); the full-loop proof rides the milestone DoD once those beans land.
