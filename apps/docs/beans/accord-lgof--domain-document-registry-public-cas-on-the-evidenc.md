---
# accord-lgof
title: Domain document registry — public CAS on the evidence daemon
status: todo
type: milestone
priority: normal
created_at: 2026-08-18T22:59:47Z
updated_at: 2026-08-18T22:59:47Z
---

## Scope

Public, content-addressed document registry for domain docs on the evidence-operator daemon. Zero on-chain change: Accord's `domain_ref` stays opaque bytes; canon **defines** its bytes as `sha256(rules_doc)`. Resolution path: `CanonList.rules_hash` / `Subaccord.domain_ref` → `GET /domains/{hash}` → client verifies `sha256(bytes)` against the on-chain field.

Grilled and confirmed 2026-08-18 (Fabian + agent). No implementation yet — this bean is the plan of record.

## Design decisions

1. **Permissionless content-addressed PUT.** Preimage resistance IS the authentication — no creator signatures, no upload gating. Upload legally precedes `create_list` (doc-first flow: author → PUT → create with `rules_hash = sha256(doc)`).
2. **Convention is canon-scoped.** `domain_ref = sha256(doc)` is canon's definition of the 32 bytes; other Arbitrables may define theirs differently. Accord program stays agnostic.
3. **Plaintext, not encrypted.** Readership is "everyone" — encryption would be posture, not access control (no reader model exists, unlike juror-bound evidence). Daemon SPEC invariant re-scoped: *evidence* plaintext is never persisted; domain objects are public by construction.
4. **No `/refs` endpoint.** The chain is the index (`rules_hash` → GET). Forward lookup (doc → subaccords) had no consumer; consumers can `getProgramAccounts` memcmp themselves if ever needed.
5. **Server is a dumb CAS.** No parsing, no format mandate, no chain reads in the domain namespace. Garbage-that-hashes-right is the author's problem.
6. **Recommended doc format: markdown + optional YAML frontmatter** (`title`, `description`, `version`); body = the rules. Hash covers the raw file bytes, frontmatter included. Any other format is valid opaque bytes (hash-verified, rendered raw). The convention's single home is `packages/sdk/src/domain.ts` — no second implementation anywhere; the daemon stays format-blind.
7. **No auto-publish inside create flows.** Two explicit CLI commands. Future `canon:create-list --rules <file>` hashes locally and warns (yellow, non-fatal) if `GET /domains/{hash}` 404s — the half-state (list live, doc missing) must be loud, not impossible.
8. **Retention forever.** Never swept (a juror verifying `rules_hash` in five years must find the bytes). No DELETE route; takedown is an ops-level storage action outside the protocol.
9. **Content-Type passthrough.** Store the PUT's `Content-Type` header, echo on GET; default `text/markdown`. Body cap 1 MiB (configurable).

## Protocol

```
PUT  /domains/{64-hex}   body: arbitrary bytes ≤ 1 MiB
     sha256(body) == {hash} else 400 · same bytes → 200 no-op (idempotent)
     different bytes at same hash → 409 (collision alarm, never overwrite)
     Content-Type stored as metadata · NO chain gate · NO parse · rate-limited

GET  /domains/{hash}     → bytes + stored Content-Type
     ETag = {hash} · Cache-Control: immutable · no auth
```

Storage: `DomainStore` seam mirroring `EvidenceStore` (S3 + FS impls), key `domains/{hash}`.

## Rejected alternatives

- Creator-authenticated upload — signatures add nothing over preimage resistance; breaks doc-before-creation flow.
- Encrypted-at-rest under a daemon key — no reader model; killed during grill (Q4).
- JSON envelope `accord-domain/v1` — authors write rules *as* the markdown doc; frontmatter carries display metadata; server never parses.
- `/refs` reverse-index endpoint — chain is the index.
- Separate context-host app — a second deploy for PUT+GET on a hash key.
- IPFS/Arweave backing — new dependency + payment model; SPEC already lists these as trait-pluggable later.

## Out of scope

On-chain changes; encryption / Redis plaintext cache; attachments/binary payloads (a future `accord-domain/v2` with evidence-style `entries[]` if ever needed); canon CLI commands; `EVIDENCE-FORMAT.md`.

## HANDOFF

### 1. Happy Path

1. Author writes `rules.md` (optional YAML frontmatter).
2. `useaccord domain:put rules.md` → sha256 → `PUT /domains/{hash}` → 200, hash printed.
3. Creator calls canon `create_list` with `rules_hash = hash` (SDK/CLI; CLI command itself is out of scope here).
4. Juror/UI: fetch `CanonList` → `rules_hash` → `GET /domains/{hash}` → verify `sha256(bytes) == rules_hash` → parse frontmatter → render title/description/body.

### 2. Data Contract

- Public surface (SDK, `packages/sdk/src/domain.ts`, re-exported from `@useaccord/sdk` root):
  - `hashDomainDoc(bytes: Uint8Array): string` — lowercase 64-hex sha256.
  - `parseDomainDoc(bytes: Uint8Array): { title?: string; description?: string; version?: number; body: string }` — frontmatter optional; absent frontmatter ⇒ only `body`.
  - `verifyDomainDoc(bytes: Uint8Array, domainRef: Uint8Array | string): boolean`.
  - `fetchDomainDoc(daemonUrl: string, hash: string): Promise<{ bytes: Uint8Array; contentType: string; doc: ParsedDomainDoc }>` — fetch + verify + parse.
- Daemon: routes `PUT`/`GET /domains/{hash}` in `apps/evidence-daemon/src/server/`; `DomainStore` seam in `src/store/` (fs + s3 impls), storage key `domains/{hash}`; content-type must round-trip on BOTH backends.
- CLI: `useaccord domain:put <file>` / `useaccord domain:get <hash>`, `--daemon-url <url>` flag, env fallback `ACCORD_DAEMON_URL`.
- Modules touched: `apps/evidence-daemon/src/{store,server}/`, `packages/sdk/src/{domain.ts,index.ts}`, `apps/cli/src/commands/domain/`, `.agents/skills/useaccord/`, `apps/docs/adr/accord/0027-*.md` (new) + `apps/docs/adr/index.md`, `apps/evidence-daemon/SPEC.md`, `programs/canon/SPEC.md`.

### 3. Edge Cases & Constraints

- Daemon MUST NOT parse domain bodies — format-blind invariant; only hash + size checks.
- PUT MUST NOT gate on chain state — upload precedes creation by design.
- Re-scoping the encrypted-at-rest invariant must not weaken the *evidence* posture; evidence routes unchanged.
- 409 on same-hash-different-bytes is a collision alarm — never overwrite, never silently accept.
- Retention sweep code must never touch `domains/`.
- Over-cap body ⇒ 413 before any store write.
- Hex route param validation: exactly 64 lowercase-hex chars, else 400.

### 4. Business Logic

```
// PUT /domains/{hash}
body = req.bytes()
if body.length > MAX_DOMAIN_BYTES (1 MiB): return 413
if sha256Hex(body) != param.hash: return 400
if store.exists(hash):
    return bytesEqual(store.get(hash).bytes, body) ? 200 (no-op) : 409
store.put(hash, body, contentType ?? "text/markdown")
return 201

// GET /domains/{hash}
obj = store.get(hash) ?? return 404
return obj.bytes, Content-Type: obj.contentType, ETag: hash, Cache-Control: immutable
```

### 5. Definition of Done

- [ ] SDK `domain.ts` unit tests green (hash stability, frontmatter parse incl. absent frontmatter, verify, fetch-verify)
- [ ] Daemon tests green: 400 mismatch, 413 cap, 200 idempotent no-op, 409 collision, 404 unknown, content-type round-trip on fs AND s3
- [ ] CLI put/get works against a local daemon (fs backend)
- [ ] `.agents/skills/useaccord/` documents both commands + flags
- [ ] ADR-0027 committed and listed in `apps/docs/adr/index.md`; daemon SPEC domain section + invariant re-scope; canon SPEC "Rules & evidence" updated (incl. removing "the evidence operator needs no extension")
- [ ] `pnpm lint` + `build` green across touched packages

### 6. Test Matrix (Given / When / Then)

- Given unpublished hash, When PUT correct bytes, Then 201 and GET returns identical bytes + stored content-type.
- Given stored doc, When PUT identical bytes, Then 200 with no store write (idempotent).
- Given stored doc, When PUT different bytes at same hash, Then 409.
- Given body whose sha256 ≠ route hash, When PUT, Then 400.
- Given >1 MiB body, When PUT, Then 413.
- Given unknown hash, When GET, Then 404.
- Given malformed route param (not 64-hex), When PUT/GET, Then 400/404.
- Given doc with frontmatter, When `parseDomainDoc`, Then title/description/version extracted, body excludes frontmatter.
- Given doc bytes + matching `domain_ref`, When `verifyDomainDoc`, Then true; mismatched ref → false.

### 7. Open Questions

- fs backend content-type storage mechanism (sidecar file vs suffix) — implementer's choice; constraint: must round-trip.
- Whether daemon health check should stat the `domains/` dir too (cheap; implementer's call).
