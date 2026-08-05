---
# accord-bsgp
title: Server hardening follow-ups (XFF trust + body-cap bypass)
status: todo
type: task
priority: normal
created_at: 2026-08-05T15:19:24Z
updated_at: 2026-08-05T18:18:56Z
parent: accord-s3ow
---

Deferred hardening items surfaced by the server-deploy review (accord-oqam). Non-blocking for v1; both are best-effort controls already documented inline.

1. **X-Forwarded-For trust (app.ts:30-35):** `peerIp` trusts XFF unconditionally. Behind a trusted LB/Ingress that overwrites XFF this is fine; if ever exposed directly, a client can spoof XFF to evade the per-IP rate limit. Mitigation: gate XFF trust on a configurable trusted-proxy hop count, or use the real socket peer (Bun `server.requestIP`) when not behind a proxy.

2. **Content-length body cap bypass (app.ts:56-61):** the `maxBytes` guard reads the `Content-Length` header; a client that omits it (chunked/streamed) bypasses the pre-handler cap. Mitigation: stream-count request bytes and abort at the cap, or reject requests without a bounded Content-Length.

Default `EVIDENCE_MAX_EVIDENCE_BYTES=0` (disabled) keeps this low-risk until configured.
