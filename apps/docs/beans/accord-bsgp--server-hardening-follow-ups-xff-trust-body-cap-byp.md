---
# accord-bsgp
title: Server hardening follow-ups (XFF trust + body-cap bypass)
status: completed
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

## Summary of Changes

Both mitigations implemented, secure-by-default:

1. **XFF trust gate** — new `trustProxy` option (env `EVIDENCE_TRUST_PROXY`, default
   `false`). When false, `peerIp` ignores XFF entirely (peer = "unknown" at this
   layer), so a direct client cannot spoof the header to evade the per-IP rate
   limit. When true (trusted-LB/Ingress mode), XFF's leftmost entry is honored.
   Chose the boolean gate over a hop-count selector (YAGNI for the single-trusted-hop
   deployment; upgrade path noted in a `ponytail:` comment). Wired into `main.ts`
   and enabled in `deploy/k8s.yaml` (that deployment terminates TLS at the Ingress,
   so per-IP limiting via XFF now actually functions).

2. **Body-cap chunked/streamed bypass** — when `maxBytes > 0`, body-carrying methods
   (POST/PUT/PATCH) now require a bounded `Content-Length`; a request without one
   is rejected `411` (closes the named chunked-bypass vector). GETs are unaffected.
   Residual (a client lying on CL) documented inline; stream-counting read is the
   upgrade path. Dormant by default (`maxEvidenceBytes=0`).

Also: dropped an unused `c` param in the `/healthz` handler (pre-existing lint error
in the edited file) so `app.ts` lints clean.

### Tests (src/server/app.test.ts)

- XFF ignored by default → two spoofed IPs coalesce, 2nd throttled (429).
- XFF honored with `trustProxy: true` → distinct IPs not throttled.
- POST without Content-Length under a cap → 411.
- GET (no body) unaffected by the cap.
- Cap dormant at `maxBytes=0` → headerless POST passes through.
- Existing per-IP isolation test updated to opt into `trustProxy`.

### Verification

- `eslint src/server/app.ts app.test.ts config.ts main.ts` → clean.
- `bun test src/server/app.test.ts` → 28 pass / 0 fail.
- Full daemon suite: 124 pass / 1 fail, where the 1 fail (`tests/reader.test.ts`)
  is a pre-existing `@accord/sdk`-not-built env issue that fails identically on HEAD.
