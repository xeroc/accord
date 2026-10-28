---
"@useaccord/jurat": patch
---

jurat: fix ADR-0037 trace pushes rejected 403 by the evidence daemon

Two bugs, both caught at the jurat↔daemon seam:

1. `signTraceBatch` hex-encoded the Ed25519 signature while the daemon's
   ingest decodes `sig` as base64 (ADR-0037 wire format) — every push failed
   signature verification and was dropped with `[trace] push rejected (403)`.
   Now base64, hashed via the SDK's shared `buildTraceBatchMessage` (single
   canonical-form implementation).
2. `JURAT_TRACE_MODE=open` stripped the verdict's `unsealAt` as
   `{ ...event, unsealAt: undefined }` — an explicitly-undefined key survives
   `Object.entries` in jurat's local canonical form (rendered `null`) but
   vanishes in the JSON wire form the daemon re-canonicalizes, desyncing the
   signature hash. Any batch containing a verdict frame still 403'd after (1).
   The key is now deleted before queueing.

Pinned by a cross-contract test in jurat (sink sig → daemon-side
`verifyTraceBatchSig`) and a new cross-app integration suite in the
evidence-daemon (real sink over real HTTP → real ingest pipeline + FsTraceStore
→ replay via `GET /trace/:dispute`). Rejection warns now surface the daemon's
`{"error":…}` reason body.
