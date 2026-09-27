---
# accord-6im8
title: Delivery Keys — registered X25519 juror delivery (ADR-0034)
status: completed
type: milestone
priority: normal
created_at: 2026-09-25T08:59:29Z
updated_at: 2026-09-25T10:25:12Z
---

Delivery Keys — browser-held X25519 keys, registered at the evidence daemon under a wallet `signMessage` binding, replace juror-side Ed↔X25519 dual-use delivery. STRICT: no registered key ⇒ no delivery (404). Authority: ADR-0034 (amends 0015, 0011); glossary term `CONTEXT.md` Delivery Key; daemon SPEC §Crypto model / §HTTP API updated in-repo.

## Design decisions (grilled 2026-09-25)

- One active Delivery Key per juror per daemon, last-writer-wins; no v1 revoke (rotate = re-register + re-pull; delivery re-encrypts per request so nothing stored is keyed).
- Custody: noble keypair, raw secret in origin-scoped browser storage. WebCrypto non-extractable rejected (two-backends split, ADR-0015 precedent); `x25519SharedSecret()` in evidence/keys.ts is the swap seam if ever needed.
- Registration message: `accord-delkey-v1\nregistered_at:{ms}\nenc_pub:{base58}`, Ed25519-signed by the wallet. Daemon rejects `registered_at <= stored` (kills replay-downgrade of an exfiltrated superseded key). Open registration (sig-bound, no staked/drawn gate). No daemon-origin binding (same key at several daemons is a feature).
- Strict mode chosen pre-deployment: one delivery path, one decrypt implementation. Operator-side dual-use (claimant→operator ingest) unchanged. HKDF label `accord-deliver-v1` and `JurorBundle` wire shape unchanged.
- Multi-origin self-heal: GET /jurors/{juror}/delivery-key, compare with local pub, mismatch ⇒ re-register + re-pull (one signMessage).

## Follow-up (required, out of scope here)

A **public manifest card** is needed in any case: EVIDENCE-FORMAT §6 already specifies the manifest-side split (`public.summary`, `public.options` → publish option labels + salt, `public.entries`). Once the daemon derives and serves the public card, the decrypting manifest GETs (`/evidence/{subaccord}/{dispute}[/{round}]`, `/evidence/synod/{case}` — today plaintext to ANY caller, contradicting §6's "fully confidential, juror-only") retire in favor of public card + juror-bound delivery. Track as its own bean/milestone.

## HANDOFF

### 1. Happy Path

1. Juror opens any dApp (any origin); wallet connects. SDK `generateDeliveryKey()` → noble X25519 pair; secret persisted origin-side (IndexedDB), pub kept alongside.
2. SDK `registerDeliveryKey({endpoint, juror, signMessage})` builds the signed message, wallet signs, `PUT /jurors/{juror}/delivery-key` → 201.
3. Draw happens; SDK `fetchDelivery({endpoint, dispute, juror})` → `GET /evidence/{dispute}/for/{juror}` → `{rounds:[{round, out, operator_ephem_pub, files, complete}]}` → decrypt each with the Delivery Key secret → verify `sha256(cleartext) == evidence_hash`.
4. Stale key (another origin re-registered): GET current key ≠ local pub → re-register + re-pull.

### 2. Data Contract

- SDK (new in `@useaccord/sdk/evidence`): `generateDeliveryKey()`, `DELKEY_PREFIX = "accord-delkey-v1"`, `buildDeliveryKeyMessage(encPub, registeredAtMs)`, `verifyDeliveryKeyRegistration(jurorPub, encPub, registeredAtMs, sig)` (daemon-shared), `registerDeliveryKey(...)`, `fetchDelivery(...)`, `jurorDecryptDelivery(delivered, deliverySecret)` (replaces Ed-seed `jurorDecrypt`), delivery-key persistence codec (+ optional IndexedDB helper). Custom apps consume only these — endpoint + wallet stay app-side (ADR-0015 split).
- Daemon: `PUT /jurors/{juror}/delivery-key` {enc_pub: b64, registered_at: ms, sig: b64} → 201 | 400 (bad sig/body) | 409 (stale registered_at); `GET` → 200 {enc_pub, registered_at} | 404. `DeliveryKeyStore` trait (`store/delivery-key.ts`) + S3/fs impls, key `juror-keys/{juror}`. `deliver`/`deliverFile`/`deliverSynodGroup` resolve the registered key after the drawn gate — none ⇒ 404.
- Modules touched: `packages/sdk/src/evidence/{delivery-key.ts, fetch.ts, ecies.ts, keys.ts, index.ts}`, `apps/evidence-daemon/src/{store/delivery-key*.ts, pipeline/deliver.ts, server/{routes.ts,handlers.ts}, wire.ts}`, `apps/cli/src/commands/evidence/register-key.ts`, `tests/src/{e2e.test.ts, setup/}`.

### 3. Edge Cases & Constraints

- NEVER accept an enc key as a delivery GET parameter — the no-auth model survives only because the target key is pre-registered and signature-bound.
- `registered_at <= stored.registered_at` ⇒ 409; sig not verifying against {juror} ⇒ 400. Clock-skew-backwards ⇒ rejected, retried later (accepted).
- No Ed→X fallback anywhere in delivery; `ed25519ToX25519PublicKey` survives ONLY on the ingest path.
- Delete SDK `deliverToJuror` (Ed→X) and Ed-seed `jurorDecrypt`; migrate every caller (daemon `DeliveryCrypto`, e2e local impl, tests) — clean cutover.
- Retention sweeps must never touch `juror-keys/` (not dispute-scoped).
- Zero on-chain change: no program, IDL, codegen, or qedspec delta.

### 4. Business Logic

```
register: verify ed25519(msg, juror) == sig; reject registered_at <= stored; put {juror, enc_pub, registered_at}
deliver:  drawn-gate → integrity-gate → watermark → key = store.get(juror); if null → 404
          shared = X25519(ephem_sk, key.enc_pub); k = HKDF-SHA256(shared, "accord-deliver-v1")
          out = AES-256-GCM(k, watermarked)
```

### 5. Definition of Done

- [ ] SDK unit tests: message builder/verifier round-trip; stale-registration reject; only-delivery-key-decrypts property; keygen format (32B X25519)
- [ ] Daemon tests: register happy/rotate/400-bad-sig/409-stale; deliver strict-404 unregistered; happy decrypt
- [ ] e2e GREEN on Surfpool: register → draw → GET → decrypt → sha256 == evidence_hash (green rule, no skips)
- [ ] `pnpm -r run build` + `make lint` green workspace-wide
- [ ] CLI `evidence:register-key` + `.agents/skills/useaccord` reference updated in same change
- [ ] grep confirms no leftover juror-side ed25519ToX25519 delivery use

### 6. Test Matrix (Given / When / Then)

- Given drawn juror, no Delivery Key, When GET /for/{juror}, Then 404
- Given drawn + registered juror, When GET, Then decrypts with delivery secret only; non-juror key fails AES-GCM auth
- Given stored registration t=100, When PUT sig-valid t<=100, Then 409
- Given sig by different wallet, When PUT, Then 400
- Given second origin re-registers, When first origin GET+decrypt, Then failure → self-heal re-register succeeds
- Given synod group dispute, When party without key GETs, Then 404

### 7. Open Questions

- IndexedDB helper API shape (SDK codec + app storage vs SDK-owned helper) — implementer's call; keep the codec minimal either way.
- Public manifest card (see Follow-up) — separate bean; do not expand this milestone.
