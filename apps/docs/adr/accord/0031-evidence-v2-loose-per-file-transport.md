# ADR-0031: Evidence v2 — loose per-file transport

- **Status:** accepted (2026-09-22)
- **Milestone:** `accord-5d0r` — evidence daemon v2 multifile
- **Amends:** ADR-0011 (evidence operator daemon), ADR-0023 (per-round evidence hashes)
- **Format authority:** `apps/evidence-daemon/EVIDENCE-FORMAT.md` §7.1 (rewritten by this ADR)

## Context

v1 evidence transport is manifest-only: one encrypted bundle per
`(subaccord, dispute, round)`, delivered to each drawn juror as one re-encrypted
blob per round. `EVIDENCE-FORMAT.md` §2 always specified a full Merkle model —
manifest root on-chain, real `sha256` leaves per document — but v1 shipped only
URL/sentinel entries (out-of-band payloads, no leaf bytes transported). The
riprap/hanse claim flow (passports, medical records, police reports) needs real
document delivery: multi-megabyte confidential binaries, per-document retry on
bad conference wifi, and juror-side leaf verification of exactly the bytes the
claimant committed.

Two blocking questions were resolved by grilling (2026-09-22) before build:

1. **Binding.** Hanse's `file_claim` previously wrapped the manifest hash
   (`H(evidence_hash ‖ tier ‖ contribution ‖ treasury_at_filing)`), making the
   daemon's `plaintext_hash == evidence_hashes[round]` gate reject every honest
   riprap manifest. Hanse dropped the wrap upstream — the raw manifest hash is
   the on-chain commitment, so the single v1 gate binds all Arbitrables. Zero
   wrapped-root disputes existed; no legacy dual-gate.
2. **Shape.** A monolithic delivery GET (all files inline) scales to
   `64 × 10 MiB ≈ 850 MB` of base64 JSON per juror per fetch, all plaintexts
   resident at once, zero retryability. Rejected in favor of split delivery.

## Decision

**Loose per-file transport**, both directions:

- **Ingest is manifest-first.** `POST /evidence/{sa}/{dispute}[/{round}]` keeps
  its v1 gate and idempotency, and now **decrypt-verifies** the bundle
  (`sha256(plaintext) == plaintext_hash` — the deferred ingest half of the v1
  crypto gate) and **dispatches on `schema` + `entries`**: a known multifile
  schema (`accord-evidence/v1`, `riprap-claim/v1`) with entries enters multifile
  mode after entry validation (format §3.2 path hygiene, uniqueness, 64-hex
  leaves, `EVIDENCE_MAX_ENTRIES`); **an unknown schema WITH entries is a loud
  `400`** — never a silent manifest-only degrade that would flip a round
  "complete" with dangling entries and strand jurors mid-dispute; no entries ⇒
  v1 manifest-only semantics (round complete immediately).
- **Documents upload one PUT each.**
  `PUT /evidence/{sa}/{dispute}/{round}/{path}` — body is one independent ECIES
  bundle (claimant-side `claimantEncrypt` reused per file; one operator key, N
  independent DEKs). Gate order: stored manifest (`404` — manifest-first is
  structural), tracked entry (`400`), leaf hash equality pre-decrypt (`400`),
  idempotency (`201`/`409`), byte caps (`413`), decrypt-verify (`400`), store.
  Unauthenticated but content-gated: only bytes hashing to the manifest leaf —
  itself anchored on-chain via the root — can ever land.
- **Delivery is split.** The index GET returns per-round manifest bundle plus a
  **derived** per-entry status list and completeness flag; per-file GETs
  (`/evidence/{dispute}/for/{juror}/{round}/{path}`) decrypt, leaf-gate,
  watermark, and re-encrypt one document on demand. A per-file GET is **`409`
  until the round is derived-complete** — jurors never see half a case.
- **No persisted index.** Completeness is computed on read from (decrypted
  manifest entries) × (store listing). There is no `index.json` to drift, race
  across HA replicas, or rebuild on recovery — re-POSTing a manifest re-derives
  everything from its hash-pinned bytes.
- **Limits are config** (`EVIDENCE_MAX_ENTRIES` 64, `EVIDENCE_MAX_DOC_BYTES`
  10 MiB, `EVIDENCE_MAX_PACKAGE_BYTES` 100 MiB). The package cap sums stored
  object sizes + incoming ct length — a liability bound, not billing.
- **v1 is untouched where it matters:** manifest-only rounds deliver the v1
  body shape plus additive `files: []`/`complete: true` fields; synod
  pre-dispute groups bypass per-file delivery entirely (`404`).

## Rejected alternatives

- **Archive-bundle upload (zip as one blob)** — re-introduces the monolith,
  kills per-document retry, no per-object re-encryption. (§7.1's original "v2"
  sketch; superseded by this ADR.)
- **Monolithic delivery GET** — the size/memory/retry ceiling above.
- **Pre-tx staging upload** (synod's pre-dispute pattern) — new machinery to
  shave a seconds-long window already covered by manifest-first + retry.
- **Cleartext index posted alongside the manifest** — spoofable routing
  metadata and a second source of truth; decrypt-and-parse uses one versioned
  schema the daemon already holds keys for.
- **Persisted `index.json`** — read-modify-write races under HA replicas, a
  completeness flag to flip, a recovery rebuild path; every fact it holds is
  derivable from the manifest + listing.

## Consequences

- Storage grows a per-round file namespace (`{round}.files/{path}`); both
  backends (S3 `ListObjectsV2` incl. `Size`, FS `readdir`+`stat`) implement
  `putFile/getFile/listFiles` with the same idempotency as the manifest put.
- The daemon now decrypts at POST (operator keyring in the ingest path) —
  garbage and mis-targeted uploads fail at the door, not at juror delivery.
- Per-file delivery cost is O(1) plaintext in memory per GET; the index GET is
  small (no re-encryption of documents in it).
- Retention (wipe at `Final`/`Failed` + `retain_until`) stays a follow-up: the
  prefix layout is sweep-friendly by construction.
- The riprap wizard (hanse repo, out of scope here) builds on this contract:
  manifest download pre-gesture as the recovery artifact, retry PUTs only,
  never re-send the filing transaction.

## References

- Grilling session 2026-09-22 (milestone `accord-5d0r` HANDOFF — locked
  decisions, test matrix)
- `apps/evidence-daemon/EVIDENCE-FORMAT.md` §7.1 — format-side v1/v2 split
- `apps/evidence-daemon/SPEC.md` — HTTP API, storage trait, limits config
- ADR-0015 (evidence crypto in `@useaccord/sdk/evidence`), ADR-0023 (per-round
  hashes), ADR-0027 (domain CAS — separate namespace, unaffected)
