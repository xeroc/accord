---
# accord-lry5
title: Daemon - assembled manifest GET + post-file verification
status: completed
type: task
created_at: 2026-08-18T19:14:01Z
updated_at: 2026-08-18T19:14:01Z
parent: accord-7k2y
---

GET /evidence/synod/:case: assembled multi-bundle manifest (ADR-0017 + party field). Pre-file: partial per-party view. Post-file: recompute H(case_pda || h_0...h_{N-1}) vs Dispute.evidence_hashes[0] -> verified flag; mismatch refuses juror assembly.

## Summary of Changes

- `src/pipeline/synod-manifest.ts` (new) — pure assembled-manifest pipeline. Every roster slot appears with ADR-0017 payload attribution (`party` field); stored slots carry the daemon-decrypted manifest (parsed JSON if possible, else raw UTF-8; undecryptable ⇒ `manifest: null`), absent slots are `{ party, present: false }` (partial pre-file view). Post-file: recomputes `H(case ‖ h_0…h_{N-1})` from the STORED bundles (reusing `synodEvidenceRoot` from accord-g1dy) vs the bound dispute's `evidence_hashes[0]` → `verified: true/false`; a missing slot (root non-computable) or mismatch ⇒ `verified: false` — the deliver bridge refuses assembly on the same input. Pre-file `verified: null`. Bound-but-missing dispute account ⇒ 404.
- `src/server/handlers.ts` — `SynodManifestHandler` + `ServerDeps.synodManifest`; `src/server/routes.ts` — `GET /evidence/synod/:case` registered before the generic 2-segment GET (literal `synod` not captured as `:subaccord`); `src/wire.ts` — handler with memoized operator-secret decrypt closure (keyring path shared with deliver/manifest) and base64-mapped response body.
- Tests — `tests/synod-manifest.test.ts` (6 pipeline): 404 case, pre-file partial (absent slots, `verified: null`), post-file verified happy, hash-mismatch ⇒ `verified: false`, missing-slot ⇒ `verified: false`, bound-dispute-missing 404. `tests/synod-wire.test.ts` +4 (real ECIES + encoded chain stub): route-driven pre-file partial view (also proves route precedence over the generic manifest), post-file `verified: true`, wrong-root `verified: false`, unknown case 404. Daemon suite 217 pass; `tsc` + eslint clean; workspace lint/build/test green.
- Docs: daemon README HTTP API section + SPEC endpoint table gained the `GET /evidence/synod/{case}` row.
