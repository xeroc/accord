---
# accord-cqlp
title: ADR-0027 + daemon/canon SPEC updates + adr index
status: completed
type: task
tags:
  - implementer
created_at: 2026-08-18T23:00:04Z
updated_at: 2026-08-19T00:00:00Z
parent: accord-x49o
blocked_by:
  - accord-49b3
---

apps/docs/adr/accord/0027-domain-document-registry-public-cas.md (decision record incl. rejected alternatives from milestone accord-lgof body). Daemon SPEC: domain namespace section + invariant re-scoped to evidence objects. Canon SPEC: Rules & evidence rewrite — hosting convention, resolution flow, future canon:create-list --rules warn-if-unpublished; remove 'the evidence operator needs no extension'. List 0027 in apps/docs/adr/index.md. Docs must describe shipped code exactly.

## Summary of Changes

- `apps/docs/adr/accord/0027-domain-document-registry-public-cas.md` — new ADR: decision statement (opaque `domain_ref`, canon's sha256 definition), the nine grilled decision rules, the shipped protocol (PUT/GET status-code ladder), all rejected alternatives, consequences (daemon no longer evidence-only; invariant re-scoped), and the implementation map with bean refs (accord-lohs / accord-v9v9 / accord-49b3 / accord-c2i0 / accord-cqlp).
- `apps/docs/adr/accord/index.md` — 0027 row, supersession-map entry (amends 0011), next-sequential bump to 0028. `apps/docs/adr/index.md` — Accord range refreshed to 0001–0027 (was stale at 0025, pre-dating 0026).
- `apps/evidence-daemon/SPEC.md` — invariant re-scoped to evidence objects ("Evidence plaintext is never persisted" + explicit `domains/` plaintext-by-design scope note); overview no longer claims the daemon is "evidence-only"; security-considerations encrypted-at-rest bullet scoped; References gains ADR-0027. (The domain storage seam + HTTP rows had already landed with accord-v9v9 / accord-49b3; verified they match shipped code — pipeline order hex→cap→sha→idempotency, 413-before-write, first-Content-Type-wins, fs `{v, content_type, bytes}` envelope.)
- `programs/canon/SPEC.md` — "Rules & evidence" rewritten: sha256-raw-bytes hosting convention on the daemon CAS (ADR-0027), doc-first flow, SDK single home (`domain.ts` fns), `domain:put`/`domain:get` CLI commands with `--daemon-url`/`ACCORD_DAEMON_URL`, no auto-publish in create flows, future `canon:create-list --rules` warn-if-unpublished. Removed "the evidence operator needs no extension" (false since the daemon gained the CAS). Authority line gains ADR-0027.
- Grep-verified: no remaining "needs no extension" / daemon "evidence-only" claims; MkDocs `domain_ref` copy already accurate (opaque identity hash — canon-scoped convention deliberately not generalized there).
