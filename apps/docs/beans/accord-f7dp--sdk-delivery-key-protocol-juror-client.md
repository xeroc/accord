---
# accord-f7dp
title: 'SDK: Delivery Key protocol + juror client'
status: completed
type: task
priority: normal
created_at: 2026-09-25T08:59:29Z
updated_at: 2026-09-25T09:00:45Z
parent: accord-5q2n
---

---

assigned: implementer
---

`packages/sdk/src/evidence/delivery-key.ts` (new) + fetch/ecies/keys/index updates: `generateDeliveryKey()`, `DELKEY_PREFIX`, `buildDeliveryKeyMessage`, `verifyDeliveryKeyRegistration` (daemon-shared), `registerDeliveryKey`, `fetchDelivery`, `jurorDecryptDelivery(delivered, deliverySecret)`, persistence codec + optional IndexedDB helper, stale-key self-heal loop. Delete Ed-seed `jurorDecrypt` + Ed→X `deliverToJuror`; migrate in-repo callers. Colocated `*.test.ts` per repo convention. See milestone accord-6im8 HANDOFF §2.

Summary of Changes
------------------

- **`packages/sdk/src/evidence/delivery-key.ts` (new)** — the ADR-0034 juror client: `generateDeliveryKey()` (noble X25519), `DELKEY_PREFIX`, `buildDeliveryKeyMessage` (`accord-delkey-v1\nregistered_at:{ms}\nenc_pub:{base58}`), daemon-shared `verifyDeliveryKeyRegistration` (Ed25519, malformed → false), `registerDeliveryKey` (PUT `/jurors/{juror}/delivery-key`), `getRegisteredDeliveryKey` (GET, 404 → null), `ensureRegisteredDeliveryKey` (multi-origin self-heal: pub mismatch ⇒ one re-register), persistence codec (`publicKey(32) ‖ secretKey(32)`) + `DeliveryKeyStorage` port + `loadOrCreateDeliveryKey` (generate-once). Open question resolved: storage stays an injected port — SDK owns only the codec, no DOM typing in the SDK (implementer's call per HANDOFF §7).
- **`ecies.ts`** — deleted Ed→X `deliverToJuror` + Ed-seed `jurorDecrypt`; added `deliverToDeliveryKey(plaintext, deliveryEncPub)` + `jurorDecryptDelivery(delivered, deliverySecret)` (same `JurorBundle` wire shape, same `accord-deliver-v1` HKDF label, raw X25519 keys — no Ed→X anywhere in delivery). `keys.ts` header now states Ed↔X dual-use survives only on the ingest path.
- **`fetch.ts`** — added `fetchDelivery({endpoint, dispute, juror})` → GET `/evidence/{dispute}/for/{juror}`, decodes base64 wire rounds to bytes (`DeliveredRound extends JurorBundle` + `files`/`complete`) so each round feeds straight into `jurorDecryptDelivery`; 404 → null.
- **`base64.ts` (new, internal)** — shared `toBase64`/`fromBase64`; `publish.ts` private copy removed.
- **Tests** — `delivery-key.test.ts` (new, 10): message wire-format byte-exactness, malformed rejection, sig verifier round-trip + every mutation, codec/generate-once, register/GET/self-heal/fetchDelivery against a stubbed fetch (incl. 409 stale surfacing and current-vs-re-registered). `evidence.test.ts` deliver section swapped to the Delivery Key API (only-delivery-secret-decrypts property, fresh-ephemeral property). SDK suite 112/112.
- **Daemon migration (compile-clean cutover)** — `wire.ts` `reencryptToJuror` adapter now bridges via `ed25519ToX25519PublicKey` + `deliverToDeliveryKey`, byte-identical to the old dual-use semantics, marked `TODO(accord-5wkt)` — the ONLY remaining Ed→X delivery use until the strict DeliveryKeyStore resolution lands (sibling bean accord-5wkt). `crypto.test.ts` migrated cleanly to `generateDeliveryKey`/`deliverToDeliveryKey`/`jurorDecryptDelivery`; `wire.test.ts`/`synod-wire.test.ts` decrypt sides use `jurorDecryptDelivery(delivered, ed25519SecretToX25519(seed))` under the same TODO. Daemon suite 330/330, eslint clean.
- **Out of scope (lane siblings)** — daemon registration endpoint + strict-404 delivery (accord-5wkt), CLI `evidence:register-key` + skill docs (accord-hp55), e2e registration choreography (accord-649j — its local `jurorDecryptDelivered` noble impl is untouched and imports nothing deleted). Zero on-chain change; no IDL/codegen/qedspec delta.
