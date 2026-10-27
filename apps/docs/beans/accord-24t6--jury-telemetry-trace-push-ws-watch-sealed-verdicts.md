---
# accord-24t6
title: Jury telemetry — trace push, WS watch, sealed verdicts, durable replay (ADR-0037)
status: completed
type: milestone
priority: normal
created_at: 2026-10-23T09:32:33Z
updated_at: 2026-10-23T11:20:02Z
---

Live jury telemetry (ADR-0037): jurat pushes signed agent-trace batches to the evidence daemon; websites subscribe per-dispute over WebSocket and watch the jury work in real time; every verified batch is durable on the store seam for replay. Off-chain only — no program change, no qedspec delta.

## HANDOFF

### 0. Locked decisions (session 2026-10-23 — ADR-0037)

- **Transport: signed HTTPS POST batches. NO broker.** Volume is KBs/min (8–16 steps per duty, chain-clock windows). Redis/NATS re-enters only if multi-replica fan-out becomes real — behind the fan-out map; the push leg stays POST.
- **Fan-out host: evidence daemon.** Neutral meeting point (every drawn juror already pulls evidence from it), existing TLS/rate-limit/store/live-Round-read. Jurat stays firewalled.
- **Push auth: Ed25519 by the juror hot key** (the same key that commits) over a canonical batch hash + live `Round.jurors[]` gate (same gate as delivery). No new registry; Delivery Keys NOT used — open registration proves nothing about the drawn set.
- **Sealing: verdict frame carries `unsealAt = round.revealEnd`.** Daemon withholds at read time — live fan-out, WS catch-up, and REST replay all filter against *current* time. `JURAT_TRACE_MODE=open` (demo) releases at push. Schelling/herding protection (lazy jurors must not free-ride live reasoning).
- **Content redaction: tool calls `{name, args (builtin four only), resultDigest, bytes, ms}` + token usage.** MCP tool args digest-only. NO evidence content, NO intermediate model text (ADR-0006/0034 confidentiality). Rationale only inside the sealed frame.
- **Persistence: write-through, append-only, keep forever.** fs = JSONL append; S3 = one immutable object per batch (atomic puts, idempotent on seq, no read-modify-write). Envelope schema `v: 1`, events never mutated. The corpus is the asset (fine-tuning/audit/appeals material tied to ADR-0029 outcomes).
- **Fan-out state: single-replica in-memory** (ring buffer + subscriber sets). REST replay from the store works on any replica. Sticky/pub-sub deferred.
- **Failure contract: `TraceSink` mirrors `NotifyChannel`** — never throws, never blocks the duty pipeline (ADR-0036 decision 8), bounded queue drop-oldest, 2s push timeout. Trace loss leaves visible seq gaps; acceptable — the durable record is what actually arrived.

### 1. Happy Path

1. jurat duty opens → `duty-open` emitted
2. evidence intake done → `evidence` (paths + sha256 + byte sizes, no content)
3. agent starts → `agent-start`; each `onStepFinish` → one `step` event
4. verdict settles → sealed `verdict` frame (`unsealAt = revealEnd`)
5. commit / reveal → `commit` / `reveal` (tx sig or dry-run flag); abstain path → `abstain`
6. batches `POST /trace/:subaccord/:dispute/:juror` `{v, seq, events[], sig}`
7. daemon: verify sig against juror address from live Round → `appendBatch` to store → fan out to WS subscribers of that dispute
8. website: `WS /watch/:dispute` → hello + replay (store tail + ring buffer, seal-filtered) → live frames; verdict frame arrives when `unsealAt` elapses
9. later: `GET /trace/:dispute?fromSeq=` replays the durable record (seal-filtered)

### 2. Data Contract

- Envelope (v1): `{v: 1, at: unixMs, seq: per-juror monotonic, juror, dispute, event: TraceEvent}`
- `TraceEvent` = `duty-open{round, seat, reviewEnd, commitEnd, revealEnd}` | `evidence{files: [{path, sha256, bytes}]}` | `agent-start{model, maxSteps}` | `step{n, toolCalls: [{name, args?, argsDigest?, resultDigest, bytes, ms}], usage}` | `verdict{optionIndex, rationale, confidence, unsealAt?}` | `commit{tx?, dryRun}` | `reveal{tx}` | `abstain{kind, reason}`
- POST body: `{v, seq, events, sig}` — `sig = Ed25519(juror key) over sha256(canonical JSON of {v, juror, dispute, seq, events})` (sorted keys, no whitespace)
- Routes: `POST /trace/:subaccord/:dispute/:juror` · `GET /watch/:dispute` (WS upgrade) · `GET /trace/:dispute?fromSeq=`
- Store: `TraceStore.appendBatch(b)` / `readEvents(dispute, juror?, fromSeq?)`; fs: `traces/{sub}/{dispute}/{juror}.jsonl`; s3: `traces/{sub}/{dispute}/{juror}/{seq}.json`
- Modules: jurat `src/trace/sink.ts`, runner `onStepFinish`, `RuntimeDeps.trace`, config in `src/config.ts`; daemon `src/store/trace{,-fs,-s3}.ts`, `src/pipeline/trace.ts`, `src/server/watch.ts`
- Config: jurat `JURAT_TRACE_URL` (unset = off), `JURAT_TRACE_MODE=sealed|open` (default sealed); daemon `TRACE_ENABLED` (false), `TRACE_BUFFER_PER_DISPUTE` (512), `TRACE_MAX_CLIENTS_PER_IP` (8)

### 3. Edge Cases & Constraints

- NEVER let a trace failure stall or crash the vote pipeline (notify contract, ADR-0036 decision 8).
- Evidence content and intermediate model text NEVER enter traces; MCP tool args digest-only (untrusted surface).
- Sealed frames withheld on EVERY read path until `now >= unsealAt` — including mid-window replays.
- Store write failure on ingest: log + still fan out live (durable record takes the gap).
- `sig` mismatch → 403 drop; juror ∉ live `Round.jurors[]` → 403; `seq <= last` → 200 idempotent no-op; seq gap → accept (monitoring feed, not a ledger); batch cap 64 events / 256 KiB → 413; `TRACE_ENABLED=false` → 404.
- WS: per-IP conn cap; replay-then-live; seal-check at send time + unseal flush on timer; WS ignores CORS (validate Origin only if configured).
- No on-chain change; no `.qedspec` delta.

### 4. Business Logic

```
sealVisible(ev, now) = ev.unsealAt === undefined || now >= ev.unsealAt
ingest:   roundGate(juror) ∧ verifySig(batch) ∧ seq > last[juror]
          → appendBatch → fanout(dispute, events ∩ sealVisible)
replay:   readEvents(dispute, fromSeq) ordered by (juror, seq), filter sealVisible, concat ring-buffer tail
unseal:   per sealed frame, timer at unsealAt → re-fanout to live subscribers
```

### 5. Definition of Done

- [ ] RED→GREEN per task; `bun test` + `tsc --noEmit` (build) + lint green in jurat AND evidence-daemon
- [ ] Cross-epic e2e: jurat duty (mock LLM rig) → daemon ingest → WS client receives steps live and the sealed verdict only after `unsealAt`
- [ ] jurat SPEC.md (module map, config surface) + evidence-daemon SPEC.md (HTTP API table, storage, config) updated; ADR-0037 referenced from both
- [ ] Changeset (lockstep)
- [ ] No qedspec change (off-chain only)

### 6. Test Matrix (Given / When / Then)

- Given valid batch from a drawn juror, When POST, Then 201 + store append + WS subscribers receive frames
- Given sig by a non-drawn key or a bad sig, Then 403, nothing appended
- Given `seq <= last`, Then 200 idempotent no-op
- Given batch > 64 events or > 256 KiB, Then 413
- Given `TRACE_ENABLED=false`, Then 404
- Given WS connect mid-duty, Then hello + replay + live, seq-ordered
- Given verdict frame and `now < unsealAt`, Then withheld on WS live, WS replay, AND `GET /trace`
- Given `now >= unsealAt`, Then frame delivered + unseal timer flushed to live sockets
- Given a dead trace endpoint, When a duty runs, Then the vote pipeline completes, queue drops, nothing throws
- Given store write failure on ingest, Then live fan-out still happens
- Given fs store, When 3 batches appended then `readEvents`, Then ordered by seq and idempotent on re-append

### 7. Open Questions

- Multi-replica pub/sub + sticky `/watch` — deferred until replicas are real (ADR-0037).
- Analytics/query layer over the corpus — separate consumer reading the same objects; not this milestone.
