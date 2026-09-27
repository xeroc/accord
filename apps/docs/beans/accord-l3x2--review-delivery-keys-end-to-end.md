---
# accord-l3x2
title: 'Review: Delivery Keys end-to-end'
status: completed
type: task
priority: normal
created_at: 2026-09-25T08:59:30Z
updated_at: 2026-09-25T09:00:46Z
parent: accord-5q2n
blocked_by:
    - accord-649j
    - accord-hp55
---

---

assigned: reviewer
---

Diff review against ADR-0034 + daemon SPEC: no enc-key-via-GET-parameter anywhere, no juror-side Ed→X leftovers (`grep -rn ed25519ToX25519` — ingest path only), `juror-keys/` sweep safety, docs match reality (SPEC/ADR/skill/CONTEXT). Approve or block with findings.

Summary of Changes
-----------------

**Verdict: APPROVE** — lane `accord-5q2n` (f7dp → 5wkt → 649j → hp55), 41 files, +2521/−530, every touched file in scope (no out-of-scope drift in `develop..HEAD`).

Findings (all checked, none blocking):

- **No enc-key-via-GET-parameter** ✓ — delivery routes take only `{dispute}`/`{juror}` path params (`server/routes.ts`); the target key always resolves from the registry after the drawn gate (`pipeline/deliver.ts`), per the no-auth safety model.
- **No juror-side Ed→X leftovers** ✓ — production `ed25519ToX25519PublicKey`/`edwardsToMontgomery*` uses: `ecies.claimantEncrypt` + `keys.ts` definitions (ingest path), e2e local reimpl lines 156/168 (claimant→operator + operatorDecrypt — both ingest). Zero delivery-side uses repo-wide; the f7dp transitional bridge is gone (no `reencryptToJuror` matches).
- **`juror-keys/` sweep safety** ✓ — the namespace exists only in `store/delivery-key*.ts`; the sole retention reference (`chain/events.ts`) is the dispute-scoped `RulingFinalized` sweep trigger (no sweep implementation; evidence-keyed). Stores document the never-touch invariant.
- **Docs match reality** ✓ — daemon SPEC (committed with ADR-0034) matches the implementation as-built: routes/status codes (201/400/409/404), the strict 404 on all three delivery paths, `DeliveryKeyStore` trait + `juror-keys/{juror}` layout, module tree (`delivery-key{,-fs,-s3}.ts`). `CONTEXT.md` carries the Delivery Key glossary term. Skill: `12-evidence.md` flags/examples match the shipped command (`--endpoint`/`--key-out`/`--keypair`, env fallbacks); SKILL.md routing + when_to_use updated. Stale `deliverToJuror`/`jurorDecrypt` mentions exist only in historical bean bodies (completed-bean records, not current-state docs).
- **Contract spot-checks** ✓ — daemon PUT gate order (address → body shape → sig → monotonic `registered_at`); `registered_at` must be a safe integer; `verifyDeliveryKeyRegistration` maps malformed inputs to false (400), never throws; strict resolution happens once per request, before the synod bridge dispatch; CLI persists the delivery key before registering (retry-safe); e2e self-heal asserts `ensureRegisteredDeliveryKey` → `"re-registered"` → re-pull decrypt.
- **Green evidence (final sweep at HEAD)** — SDK 112/112, daemon 348/348, CLI 144/144, workspace `pnpm -r build`+`lint` green; `make test` at 649j ran the full Rust + LiteSVM + jest stack green on the anchor-test Surfnet (26/26 suites, 116/116 tests) with the e2e choreography live against a spawned daemon — the green rule holds with no skips on the Surfpool lane.

Minor notes (non-blocking, no action required): e2e `freePort()`→daemon-bind is a tiny TOCTOU (test-only); two origins registering within the same millisecond yield a benign 409 that the documented retry absorbs; `domain:get`-style 404-on-invalid-address in `deliveryKeyGet` is consistent with the existing GET-handler convention.
