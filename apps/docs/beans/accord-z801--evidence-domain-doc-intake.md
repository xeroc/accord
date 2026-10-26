---
# accord-z801
title: Evidence & domain-doc intake
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T15:30:00Z
parent: accord-wryi
---

src/duty/evidence.ts: delivery-key handling (ADR-0034), fetch decrypted evidence bundle for drawn juror via evidence-daemon HTTP, fetch domain doc, assemble AgentContext. AC: unit tests with stubbed daemon responses; malformed bundle → clean abstain path.

## Summary of Changes

- `apps/jurat/src/duty/evidence.ts` (all crypto/wire handling imported from
  `@useaccord/sdk/evidence` — nothing reimplemented):
  - Delivery-key handling: `createFileDeliveryKeyStorage(path)` (node
    counterpart of the SDK's browser storage port, 64-byte serialized
    keypair in the state dir) + `ensureJuratDeliveryKey` =
    `loadOrCreateDeliveryKey` (generate-once) →
    `ensureRegisteredDeliveryKey` self-heal (register on first run /
    stale, `current` otherwise). Registration failures wrap as
    `EvidenceUnavailableError`.
  - `assembleDutyContext(deps, chain, input)`: `fetchDelivery` →
    `jurorDecryptDelivery` per round → UTF-8 documents; optional domain
    doc via `GET /domains/{domain_ref}` (ADR-0027 CAS — absent/failed is
    `""`, not a failure); assembles the runner's `AgentContext` with
    `makeJuratTools` where `fetch_evidence_file` serves from the
    decrypted in-memory bundle (zero HTTP on tool calls) and
    `read_domain_doc` serves the fetch.
  - Clean abstain path: 404 delivery / daemon status / transport →
    alert + `EvidenceUnavailableError`; malformed shape / decrypt (auth
    tag) failure → alert + `MalformedBundleError`. Both map to the
    `evidence-unavailable` abstain kind; a partial context is never
    returned.
- `apps/jurat/src/duty/evidence.test.ts` — 8 node:test cases with a
  fetch-layer stub daemon and REAL crypto (bundles encrypted with the
  SDK's `deliverToDeliveryKey` so decrypt is genuinely exercised): file
  storage null/round-trip/generate-once + single registration PUT,
  already-current no-PUT, happy-path decrypt + assembled tools wiring
  (evidence/dispute/domain doc), optional domain doc 404 → "",
  delivery 404 → unavailable + alert, tampered ciphertext → malformed +
  alert, shape-malformed bodies (×3) → malformed + alert, daemon 503 →
  unavailable + alert.
- `apps/jurat/package.json` — `@noble/curves` added (operator-key
  `signMessage` for registration).
- Verified: `pnpm --filter @useaccord/jurat test` 60/60 green; `pnpm -r
  run build` + `pnpm -r run lint` green workspace-wide.
