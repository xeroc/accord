---
# accord-9pdg
title: TraceSink interface + RemoteTraceSink
status: todo
type: task
created_at: 2026-10-23T09:32:57Z
updated_at: 2026-10-23T09:32:57Z
parent: accord-c19g
---

jurat src/trace/sink.ts: `TraceEvent` union + envelope types (HANDOFF §2), `TraceSink.emit(e): void` — sync, never throws; RemoteTraceSink: bounded queue (256, drop-oldest), batches `{v, seq, events[], sig}` (Ed25519 with the hot key), fetch POST with 2s timeout, drop-on-failure. Config `JURAT_TRACE_URL` (unset = no-op sink), `JURAT_TRACE_MODE=sealed|open`. RED→GREEN per HANDOFF §6: dead endpoint never rejects/stalls the pipeline, queue bound drops oldest, sig is deterministic over canonical JSON.
