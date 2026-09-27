---
# accord-649j
title: 'e2e: registration choreography + strict expectations'
status: completed
type: task
priority: normal
created_at: 2026-09-25T08:59:30Z
updated_at: 2026-09-25T09:00:45Z
parent: accord-5q2n
blocked_by:
    - accord-5wkt
---

---

assigned: tester
---

Rework `tests/src/e2e.test.ts` + setup: jurors register before delivery fetch (keypair signMessage == plain `ed25519.sign`), local protocol reimpl switches to X25519 delivery secrets. Cases: strict-404 unregistered, stale-registration 409, wrong-wallet sig 400, self-heal flow, non-juror-key decrypt failure. GREEN on Surfpool, no skips (green rule).

Summary of Changes
------------------

- **`tests/src/e2e.test.ts` (rewritten)** —
  - *Layer 1 (always runs):* the local wire-contract reimpl now mirrors ADR-0034 delivery — `operatorReencryptToDeliveryKey(plaintext, deliveryEncPub)` + `jurorDecryptDeliveryLocal(delivered, deliverySecret)` operate on RAW X25519 delivery keys (no Ed→X in delivery); `edwardsToMontgomery{Pub,Priv}` survive only on the claimant→operator ingest path. Cases: full round-trip incl. sha256 gate, non-juror Delivery Key decrypt failure, tampered-bundle rejection.
  - *Layer 2 (green rule):* rebuilt on the shared harness (`setupDrawFixture` pieces: `createTestEnv` → `ensurePause` → `armSubaccordAndJurors` with `evidenceOperator` = the daemon's generated key → `armDispute` (now takes a caller `evidenceHash` — draw-harness extended) → `resolveDistinctPanel` → `submitDraw`). The evidence daemon is SPAWNED by the spec (`bun run src/main.ts`, fs storage in a temp dir, generated `EVIDENCE_KEYRING`, free port, /healthz readiness poll, SIGKILL + tmpdir cleanup in afterAll) — or reused via `EVIDENCE_DAEMON_URL` + `EVIDENCE_OPERATOR_SECRET`. Skips ONLY on the offline CI lane (no validator); on a Surfnet it runs with no skips.
  - *Choreography (single ordered it, 240 s):* claimant POST → **strict 404** (drawn juror, no registered key) → **wrong-wallet sig 400** → **happy register** (wallet `signMessage` == kit `signMessages([{content, signatures:{}}])` — the browser-wallet shape, no raw secret) → **stale `registered_at` 409** (sig-valid replay at the stored ts) → **GET → decrypt → sha256 == on-chain evidence_hash (GREEN RULE)** → **non-juror Delivery Key decrypt failure** → **self-heal** (other-origin rotate at ts+1 → `ensureRegisteredDeliveryKey` returns `re-registered` → re-pull → decrypt). SDK client surface used end-to-end (`registerDeliveryKey`, `getRegisteredDeliveryKey`, `ensureRegisteredDeliveryKey`, `fetchDelivery`, `jurorDecryptDelivery`, `generateDeliveryKey`, `buildDeliveryKeyMessage`).
- **`jest.config.js`** — `moduleNameMapper` entry for `^@useaccord/sdk/evidence$` → the built subpath dist (the subpath lives only in the package `exports` map, which jest's resolver does not consult).
- **`draw-harness.ts`** — `armDispute` gained an optional `evidenceHash` param (defaults unchanged).
- **Verification:** `make test` fully green — Rust unit + LiteSVM, verify-sbf, and the whole jest suite on the anchor-test Surfnet: **26/26 suites, 116/116 tests**, `e2e.test.ts` live in 12.5 s with the spawned daemon (`[daemon]` boot log). Offline lane: layer 1 green, layer 2 skips cleanly. Daemon `bun test` 348/348; `tsc` green workspace-wide.
