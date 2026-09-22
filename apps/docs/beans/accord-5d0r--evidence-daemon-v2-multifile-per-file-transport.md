---
# accord-5d0r
title: Evidence daemon v2 — multifile per-file transport
status: in-progress
type: milestone
created_at: 2026-09-22T11:35:19Z
updated_at: 2026-09-22T11:35:19Z
---

Multifile evidence upload + per-file delivery for the evidence daemon (EVIDENCE-FORMAT §7.1 v2, re-scoped to loose per-file transport — archive-bundle stays rejected).

## HANDOFF

### 0. Locked decisions (grilling 2026-09-22 — supersedes the design doc where they conflict)

- **Binding**: hanse dropped the wrapped root upstream — `evidence_hashes[round]` holds the raw manifest hash. Single gate everywhere: `sha256(plaintext) == evidence_hashes[round]`. Zero legacy wrapped-root disputes → NO dual gate.
- **NO index.json.** Completeness is derived on read: decrypt manifest × list stored file paths × set-compare. Recovery needs no rebuild. No mutable RMW state (HA-safe).
- **Dispatch** (POST, after decrypt+verify): entries present + known schema (`accord-evidence/v1`, `riprap-claim/v1`) → multifile; **unknown schema WITH entries → 400** (loud at POST, never silent at juror time); no entries → manifest-only (v1 semantics, complete immediately).
- **Entry tracking**: relative POSIX path + non-sentinel sha256 → daemon-tracked (PUT). URL path or all-zero sentinel sha256 → born-satisfied.
- **riprap-claim/v1**: absent document ⇒ row omitted (3–5 rows, policy order). Wizard lives in the hanse repo — NOT this worktree.
- **Delivery split**: index GET (small: manifest bundles + per-entry status) + per-file GETs. Per-file GET → 409 "round incomplete" until derived completeness (jurors never see half a case).
- **Retention wipe**: follow-up bean. Layout is wipe-friendly by construction (prefix per subaccord/dispute).
- **Rejected (stand)**: pre-tx staging upload, archive/zip bundle, cleartext index (moot — no index).

### 1. Happy Path

1. Claimant POSTs manifest bundle → gate (chain hash) + decrypt-verify + parse entries → 201 (unchanged idempotency).
2. Claimant PUTs each doc → gates (manifest exists / path tracked / hash matches / decrypt-verifies) → 201.
3. Last tracked entry stored ⇒ derived completeness true.
4. Drawn juror GETs index → per-round manifest + per-entry status; GETs each file → decrypt → leaf gate → watermark → re-encrypt.

### 2. Data Contract

- `PUT /evidence/:subaccord/:dispute/:round/*path` body `{ct, claimant_ephem_pub, wrapped, plaintext_hash}` (base58, same ECIES per object). Gates in order: no manifest → 404; path untracked → 400; `plaintext_hash != entry.sha256` → 400; undecryptable/leaf-mismatch → 400; limits → 413; same-hash re-put → 201 idempotent; different-hash → 409.
- `GET /evidence/:dispute/for/:juror` → `{rounds: [{round, manifest bundle, files: [{path, status, sha256?}]}], complete per round}` — derived, always 200 for drawn juror.
- `GET /evidence/:dispute/for/:juror/:round/*path` → re-encrypted file bundle; 409 if round incomplete; leaf-gated.
- Storage: `{root}/{subaccord}/{dispute}/{round}/manifest.enc.json` + `files/{path}`; store port grows `putFile/getFile/listFiles`.
- Limits (config, not code): `MAX_DOC_BYTES` 10 MiB, `MAX_PACKAGE_BYTES` 100 MiB, `MAX_ENTRIES` 64.
- Existing surfaces unchanged: POST manifest (v1), public manifest GET, synod bridge, monolithic v1 delivery when no entries.

### 3. Edge Cases & Constraints

- Path hygiene enforced at manifest parse AND store key construction: relative POSIX only, no leading `/`, no `..`, no backslash, unique.
- PUT is unauthenticated but content-gated: only hash-pinned bytes can land — racing attacker is a no-op.
- One plaintext in memory at a time (per-file delivery).
- `complete` never persisted; derived fresh per read. Store listing is the only truth.
- v1 manifest-only disputes: delivery body stays shape-compatible (empty files list).

### 4. Business Logic

```
tracked(entries)  = [e | relative(e.path) ∧ e.sha256 != 0^32]
satisfied(e, lst) = sentinel(e) ∨ url(e.path) ∨ (e.path ∈ lst ∧ storedHash == e.sha256)
complete          = ∀ e ∈ entries: satisfied(e, listFiles(round))
```

### 5. Definition of Done

- [ ] RED→GREEN per work item; bun tests + tsc + lint green workspace-wide
- [ ] EVIDENCE-FORMAT.md §7.1 rewritten (loose per-file transport), daemon SPEC.md routes updated, ADR written
- [ ] Existing v1 flows (manifest-only, synod, public manifest GET) unchanged and green

### 6. Test Matrix

- Given manifest w/ 3 tracked entries, When 2 files PUT, Then index shows 1 pending + complete=false; 3rd PUT → complete=true
- Given PUT path not in entries, Then 400
- Given PUT with plaintext_hash != entry.sha256, Then 400 (no decrypt needed)
- Given PUT ct that decrypts to different bytes, Then 400
- Given re-PUT same hash, Then 201 idempotent; different hash → 409
- Given unknown schema WITH entries, Then POST 400
- Given v1 manifest (no entries), Then complete immediately, delivery = today's shape + empty files
- Given juror not drawn / round incomplete, Then 404 / 409
- Given >64 entries or >10MiB doc or >100MiB package, Then 413/400
- Given path `../x`, `/abs`, `a\b`, dup, Then 400 at POST

### 7. Open Questions

- Retention sweep → follow-up bean (none blocking).
