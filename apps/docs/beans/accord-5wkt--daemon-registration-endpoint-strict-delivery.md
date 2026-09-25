---
# accord-5wkt
title: 'Daemon: registration endpoint + strict delivery'
status: completed
type: task
priority: normal
created_at: 2026-09-25T08:59:29Z
updated_at: 2026-09-25T09:00:45Z
parent: accord-5q2n
blocked_by:
    - accord-f7dp
---

---

assigned: implementer
---

`PUT`/`GET /jurors/{juror}/delivery-key` (sig-verify fail ⇒ 400, `registered_at <= stored` ⇒ 409), `DeliveryKeyStore` trait + S3/fs impls (`juror-keys/` namespace, retention-sweep-safe), and the strict switch: `deliver`/`deliverFile`/`deliverSynodGroup` resolve the registered key after the drawn gate — unregistered ⇒ 404, no Ed→X fallback. Pipeline tests per HANDOFF §6. Blocked by the SDK task (wire helpers come from it).

Summary of Changes
------------------

- **`store/delivery-key.ts` (new)** — `JurorDeliveryKey` record + `DeliveryKeyStore` trait exactly per SPEC §"Delivery Key registry" (`put` overwrite, `get` → null) + JSON/base64 serde. **`delivery-key-fs.ts`** (`{rootDir}/juror-keys/{juror}.json`) and **`delivery-key-s3.ts`** (key `juror-keys/{juror}`, NoSuchKey/NotFound → null) share the evidence deployment's fs rootDir / S3 client+bucket; the `juror-keys/` prefix keeps the namespace clear of dispute-scoped retention sweeps.
- **Routes + handlers (ADR-0034)** — `PUT /jurors/:juror/delivery-key` and `GET /jurors/:juror/delivery-key` wired in `routes.ts`; handler types + `ServerDeps.deliveryKeyPut/Get` in `handlers.ts`; the wire.ts put-handler gates in order: base58 address → body shape (`enc_pub`/`registered_at` int/`sig`, all base64) → `verifyDeliveryKeyRegistration` (SDK, shared byte-exact) → monotonic `registered_at <= stored` ⇒ 409 → overwrite ⇒ 201. GET serves `{enc_pub, registered_at}` | 404 (public by design — staleness check for client self-heal).
- **Strict delivery (ADR-0034)** — `DeliverDeps.deliveryKeys: DeliveryKeyResolver` is a REQUIRED port; `deliver()` and `deliverFile()` resolve the registered key immediately after the drawn-juror gate — null ⇒ `404 "no delivery key registered for juror"`, applied to the synod group bridge too (`deliverSynodGroup` receives the resolved pub from `deliver()`). `DeliveryCrypto.reencryptToJuror` renamed `reencryptToDeliveryKey(watermarked, deliveryEncPub)` — the wire.ts adapter calls the SDK `deliverToDeliveryKey` directly; the f7dp transitional Ed→X bridge and its TODO are gone. grep confirms no `reencryptToJuror` and no daemon-side `ed25519ToX25519PublicKey` delivery use remains.
- **`main.ts`** — constructs `FsDeliveryKeyStore`/`S3DeliveryKeyStore` alongside the existing stores (same `EVIDENCE_STORAGE` selection) and threads it through `createServerDeps`.
- **Tests (348 green, bun)** — new `store/delivery-key-{fs,s3}.test.ts` (round-trip, overwrite last-writer-wins, miss → null, `juror-keys/` layout); `pipeline.test.ts` strict 404 for `deliver` + `deliverFile`, stub rigs carry `deliveryKeys`; `synod-deliver.test.ts` strict 404 on the bridge; `wire.test.ts` registration matrix through the real handler (happy, GET 200/404, wrong-wallet sig ⇒ 400, same-ts replay ⇒ 409 + rotation with later ts ⇒ 201, malformed ⇒ 400), STRICT unregistered-drawn-juror ⇒ 404, self-heal (other-origin rotation → re-register → decrypt), decrypt sides now use `jurorDecryptDelivery` with the delivery secret; `synod-wire.test.ts` route-level PUT/GET (+ sig-invalid ⇒ 400) and delivery-key decrypts. Server fixtures (`app/domain/health.test.ts`) stub the two new handler fields.
- **Deps** — daemon devDependency `@noble/curves` (test-side Ed25519 signing only; lockfile updated).
- Out of scope: CLI `evidence:register-key` (accord-hp55), e2e registration choreography (accord-649j), review (accord-l3x2). Zero on-chain change; SPEC already documents all of the above (ADR-0034 commit 73d2a870) — implementation matches it as-built.
