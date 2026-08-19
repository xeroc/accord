# Domain document registry — public content-addressed CAS on the evidence daemon

`Subaccord.domain_ref` / `CanonList.rules_hash` remain **opaque 32 bytes** to
the Accord program; **canon defines** its bytes as `sha256(rules_doc)`, and the
evidence-operator daemon hosts the preimages in a new **public, permissionless,
content-addressed** `domains/` namespace. Zero on-chain change. Resolution path:
`CanonList.rules_hash` / `Subaccord.domain_ref` → `GET /domains/{hash}` →
client verifies `sha256(bytes)` against the on-chain field.

Decided in the domain-registry grilling of 2026-08-18 (Fabian + agent);
milestone bean `accord-lgof`. Amends ADR-0011: the daemon gains a second,
public namespace alongside evidence — and its encrypted-at-rest invariant is
re-scoped to _evidence_ objects (domain objects are plaintext **by
construction**).

## Why a registry at all

The chain stores the hash but not the bytes. A juror verifying `rules_hash` in
five years must be able to find the document it names, without trusting any
single host's DNS/liveness. Content addressing makes the daemon a dumb CAS: the
hash in the route _is_ the integrity guarantee, so hosting is permissionless,
cacheable forever (`Cache-Control: immutable`), and operator-trust-free — a
wrong or missing byte is detected client-side.

## Decision rules

1. **Permissionless content-addressed PUT.** Preimage resistance IS the
   authentication — no creator signatures, no upload gating. Upload legally
   precedes `create_list` (doc-first flow: author → PUT → create with
   `rules_hash = sha256(doc)`); the PUT must not gate on chain state.
2. **Convention is canon-scoped.** `domain_ref = sha256(doc)` is canon's
   definition of the 32 bytes; other Arbitrables may define theirs differently.
   The Accord program stays agnostic.
3. **Plaintext, not encrypted.** Readership is "everyone" — encryption would be
   posture, not access control (no reader model exists, unlike juror-bound
   evidence). This re-scopes ADR-0011's invariant: _evidence_ plaintext is
   never persisted; domain objects are public by construction.
4. **No `/refs` reverse index.** The chain is the index (`rules_hash` → GET).
   Forward lookup (doc → subaccords) had no consumer; consumers can
   `getProgramAccounts` memcmp themselves if ever needed.
5. **Server is a dumb CAS.** No parsing, no format mandate, no chain reads in
   the domain namespace. Garbage-that-hashes-right is the author's problem.
6. **Recommended doc format: markdown + optional YAML frontmatter**
   (`title`, `description`, `version`); body = the rules. Hash covers the raw
   file bytes, frontmatter included. Any other format is valid opaque bytes
   (hash-verified, rendered raw). The convention's single home is
   `packages/sdk/src/domain.ts` (`hashDomainDoc` / `parseDomainDoc` /
   `verifyDomainDoc` / `fetchDomainDoc`) — no second implementation anywhere;
   the daemon stays format-blind.
7. **No auto-publish inside create flows.** Two explicit CLI commands
   (`useaccord domain:put` / `domain:get`). A future `canon:create-list --rules
<file>` hashes locally and warns (yellow, non-fatal) if `GET /domains/{hash}`
   404s — the half-state (list live, doc missing) must be loud, not impossible.
8. **Retention forever.** Never swept (see the five-year juror above). No DELETE
   route; takedown is an ops-level storage action outside the protocol.
9. **Content-Type passthrough.** Store the PUT's `Content-Type` header, echo on
   GET; default `text/markdown`. Body cap 1 MiB
   (`EVIDENCE_MAX_DOMAIN_BYTES`, configurable).

## Protocol

```
PUT  /domains/{64-hex}   body: arbitrary bytes ≤ 1 MiB
     hex-shape → 400 · over-cap → 413 (before any store write)
     sha256(body) == {hash} else 400 · identical bytes → 200 no-op (idempotent)
     different bytes at same hash → 409 (collision alarm, never overwrite)
     Content-Type stored as metadata · NO chain gate · NO parse · rate-limited

GET  /domains/{hash}     → bytes + stored Content-Type
     ETag = {hash} · Cache-Control: immutable · no auth
```

Storage: a `DomainStore` seam mirroring `EvidenceStore` (S3 + FS impls), key
`domains/{hash}` — sharing the evidence deployment's bucket/root with the
`domains/` prefix as the only separator. Retention sweeps must never touch it.

## Considered Options

- **Creator-authenticated upload.** Rejected — signatures add nothing over
  preimage resistance and break the doc-before-creation flow.
- **Encrypted-at-rest under a daemon key.** Rejected in the grill — no reader
  model; encryption would be posture, not access control.
- **JSON envelope `accord-domain/v1`.** Rejected — authors write rules _as_ the
  markdown doc; frontmatter carries display metadata; the server never parses.
- **`/refs` reverse-index endpoint.** Rejected — the chain is the index.
- **Separate context-host app.** Rejected — a second deploy for PUT+GET on a
  hash key.
- **IPFS/Arweave backing.** Rejected — new dependency + payment model; the
  `Storage` trait already lists these as pluggable later.

## Consequences

- The evidence daemon is no longer evidence-only: it serves a public CAS
  namespace. Its SPEC's encrypted-at-rest invariant is re-scoped to evidence
  objects; evidence routes and crypto posture are unchanged.
- Canon's `rules_hash` gains a defined preimage + hosting + verification
  convention without a single on-chain byte changing.
- The daemon operator takes on unbounded (forever) storage growth for domain
  docs, capped per-object at 1 MiB; mitigation is the storage backend's
  lifecycle rules being deliberately not applied to `domains/`.
- A 409 on PUT is an operational alarm (sha256 collision or a re-used hash for
  different content) — the daemon never overwrites and never silently accepts.

## Implementation

- SDK convention home: `packages/sdk/src/domain.ts`, re-exported from
  `@useaccord/sdk` (bean `accord-lohs`).
- `DomainStore` seam + fs/s3 impls: `apps/evidence-daemon/src/store/domain*.ts`
  (bean `accord-v9v9`).
- Routes + pipeline (`PUT`/`GET /domains/{hash}`, cap/hash/idempotency order,
  `EVIDENCE_MAX_DOMAIN_BYTES`): `apps/evidence-daemon/src/{server,pipeline}/domain.ts`
  (bean `accord-49b3`).
- CLI: `useaccord domain:put <file>` / `domain:get <hash>` with `--daemon-url`
  / `ACCORD_DAEMON_URL` (bean `accord-c2i0`).
- Daemon SPEC domain section + invariant re-scope; canon SPEC "Rules &
  evidence" (this bean, `accord-cqlp`).
