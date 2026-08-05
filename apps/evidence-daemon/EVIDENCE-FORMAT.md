# Accord Evidence Format — v1

> **Status:** specified (not yet built). **Authority:** ADR-0013 (decision),
> ADR-0006 (evidence model), ADR-0011 (evidence operator daemon), `CONTEXT.md`
> (Evidence Operator). This file is the **format reference** for the data whose
> hash is the on-chain `evidence_hash` — i.e. everything a Juror needs to rule.
> The daemon build spec (`apps/evidence-daemon/SPEC.md`) is the *transport*
> reference; this file is the *data* reference. Code is authority on current
> state; this spec is authority on intent.

---

## 1. Overview

The evidence a filer submits is a **self-describing package**: one structured
manifest plus an arbitrary set of file payloads (documents, images, video,
PDFs, logs — anything). The manifest is the only thing hashed; it references
every payload by its `sha256`, so it is the Merkle root over the package.

Three layers, only the first is hashed:

```
Layer 0  CONTENT      manifest.yaml + N opaque file payloads (any format)
Layer 1  ROOT HASH    evidence_hash = sha256(manifest.yaml)         ← the on-chain commitment
Layer 2  TRANSPORT    how the manifest + payloads are packaged,      ← NOT hashed; the daemon's
                       compressed, encrypted, and delivered           concern (ADR-0011)
```

**Decoupling principle.** Because the hash is over the manifest (not any
container), the packaging, compression, ordering, and delivery of the files are
entirely unconstrained by the format. A zip, a tar, loose files, an IPFS dir,
any compression — all hash-equivalent. The daemon owns transport; the format
owns the manifest.

---

## 2. The root hash

```
evidence_hash = sha256( utf8( manifest.yaml ) )        // 32 bytes; stored on-chain
```

The hash is over the **exact bytes** of the `manifest.yaml` file as the filer
authors it. The manifest is delivered **verbatim** to Jurors (it is a payload
like any other), so a Juror hashes the identical bytes → the check
`sha256(manifest.yaml) == Dispute.evidence_hash` is deterministic by
construction. **No canonicalization rules are needed** anywhere — not for the
manifest, not for a container.

Every other payload is anchored as a Merkle leaf: `manifest.yaml` records the
`sha256` of each file, so the root (`evidence_hash`) covers them transitively.

```
                 evidence_hash = sha256(manifest.yaml)
                                  │
  manifest.yaml ──────────────────┴─────────────┐
    entries:                                     │ references (leaf sha256)
      - path: claim.md      sha256: 9a3f…        ▼
      - path: spec.pdf      sha256: c1b2…   ──►  the file payloads
      - path: demo.mp4      sha256: 7d44…      (opaque; delivered any way)
```

**Integrity model.** A Juror receives the manifest + every file and verifies
two things: (1) `sha256(manifest.yaml) == evidence_hash` (root), and (2) for
each file, `sha256(file) == manifest.entries[path].sha256` (leaf). A tampered
file fails (2); a tampered manifest fails (1). Fully trustless for Jurors.

---

## 3. `manifest.yaml` — schema

The manifest is a single YAML file at a fixed path (`manifest.yaml`) inside the
package. It is the **only structured artifact** the format mandates. File
payloads are opaque (see §5).

### 3.1 Annotated example

```yaml
schema: accord-evidence/v1
dispute: <base58 Dispute pubkey>          # operator cross-checks == on-chain Dispute
subaccord: <base58>
filer: <base58>
filed_at: 2026-08-05T14:20:00Z
language: en
title: "Milestone 3 (auth module) — delivered or not?"

option_salt: 9f3c1a...e7b2                 # 32-byte hex nonce — NON-PUBLIC (see §4)
options:                                   # Dispute.options[i] = sha256(option_salt ‖ utf8(label))
  - { index: 0, label: "Not delivered" }
  - { index: 1, label: "Delivered as specified" }

public:                                    # OMIT entirely ⇒ fully confidential (today's behaviour)
  summary: "Filer claims milestone 3 (auth module) was delivered per spec by 2026-07-30…"
  options: true                            # publish option labels + the salt (default true)
  entries: [timeline.md, spec.pdf]         # entry paths to publish openly (see §6)

entries:                                   # PURE index — every payload, path + sha256 only
  - { path: claim.md,         sha256: "9a3f…e1" }
  - { path: response.md,      sha256: "55c1…0b" }
  - { path: timeline.md,      sha256: "3e7d…22" }
  - { path: spec.pdf,         sha256: "c1b2…77" }
  - { path: screenshot.png,   sha256: "aa09…5f" }
  - { path: deliverable.diff, sha256: "7d44…0a" }
  - { path: demo.mp4,         sha256: "b8e1…39" }

policy:
  watermark: true                          # request per-Juror watermarking (daemon v1.1)
  retain_until: finalized
```

### 3.2 Field reference

| Field | Required | Description |
|---|---|---|
| `schema` | yes | `accord-evidence/v1`. The operator dispatches on this; future versions branch here. |
| `dispute` / `subaccord` / `filer` | yes | Base58 pubkeys. Operator cross-checks `dispute`/`subaccord` against the on-chain `Dispute`; `filer` == `Dispute.filer`. |
| `filed_at` | yes | ISO-8601 UTC. Human metadata; not load-bearing for the mechanism. |
| `language` | no | BCP-47 tag (default `en`). Hint for operator/Juror UI rendering. |
| `title` | yes | One-line human title of the dispute. Public only if listed under `public` (it is not auto-published). |
| `option_salt` | yes | 32-byte nonce, hex-encoded (64 chars). Per-dispute, random, generated by the filer. **Not on-chain.** See §4. |
| `options` | yes | Ordered list `{ index, label }`. `Dispute.options[i] = sha256(option_salt ‖ utf8(label_i))`. Decodes the on-chain option hashes. |
| `public` | no | The publication policy block. **Absent ⇒ fully confidential** (nothing published; Juror-only). See §6. |
| `public.summary` | no | Neutral one-paragraph framing, publishable. |
| `public.options` | no | Bool, default `true` when `public` is present. Publish the option labels **and the salt** so any observer can verify against the chain. |
| `public.entries` | no | List of `entries[].path` values to publish openly. **This is the single source of file visibility** — `entries[]` carries no visibility field. |
| `entries` | yes | The complete bill of materials. One row per delivered file: `{ path, sha256 }`. The manifest is **not** listed here (it would be a self-hash paradox; it is anchored directly by `evidence_hash`). |
| `entries[].path` | yes | Relative POSIX path, UTF-8, no leading `/`, no `..`, no backslash. Unique within the package. |
| `entries[].sha256` | yes | Lowercase hex (64 chars) of the file's bytes. |
| `policy` | no | Operator hints (non-binding on the mechanism): `watermark`, `retain_until`, etc. |

---

## 4. Option labels are salted

On-chain `Dispute.options[i]` is a `[u8; 32]` and therefore **public**. If it
were an unsalted hash of a short label (`"Yes"`, `"Refund"`), anyone could
rainbow-table the chain to recover the choices of a dispute that intended to
keep them confidential. The salt closes that leak.

### Construction

```
option_salt = random 32 bytes                              // filer-generated, per-dispute
Dispute.options[i] = sha256( option_salt ‖ utf8(label_i) ) // 32-byte digest, stored on-chain
```

- `option_salt` lives **only in the manifest** (never on-chain). It is covered
  by `evidence_hash`, so it cannot be swapped without breaking the root.
- **Confidential dispute** (`public` absent): on-chain `options[i]` are opaque
  even for trivial labels — unbrutable without the salt. Salt + labels reach
  Jurors only, via the manifest.
- **Public-option dispute** (`public.options: true`): the operator publishes
  the labels **and the salt**, so any observer verifies
  `sha256(option_salt ‖ utf8(label_i)) == Dispute.options[i]`.

### Filer flow (options)

1. Generate `option_salt` (32 random bytes).
2. Author the `options` list with labels.
3. For each `i`, compute `Dispute.options[i] = sha256(option_salt ‖ utf8(label_i))`.
4. Store `option_salt` + labels in the manifest; pass the derived `options[i]`
   to `create_dispute(..., options, evidence_hash, ...)`.

> **Open (ADR-0013):** whether the program *enforces*
> `options[i] == sha256(option_salt ‖ label)` at `create_dispute`, or leaves it
> a filer/operator convention. Enforcing is cheap and closes a footgun; the
> salt is not on-chain either way (enforcement would hash a supplied
> `label` + a salt byte-array argument, not store them).

---

## 5. File payloads are opaque

The format mandates **nothing** about payload content, encoding, or type.
Markdown, HTML, PDF, PNG, MP4, plain text, diffs — all are equal. The spec does
not parse, validate, or limit them.

- A payload's integrity is its `sha256` leaf in `entries[]` — nothing else.
- The operator **may** parse a *public* payload for nicer rendering (e.g.
  render `*.md` to HTML in the public card) — purely its choice, not required.
- The `docs/` vs `assets/` distinction is **not** prescribed; paths are the
  filer's. (Conventional layout — `docs/*.md`, `assets/*` — is recommended for
  human readability but not enforced.)

---

## 6. Visibility — declared once, in `public`

File visibility lives **only** in `public.entries`. The `entries[]` index is
pure (path + sha256, no visibility flag). This keeps content-addressing separate
from publication policy.

**Publication rule (operator):**

- Publish: `public.summary`, `options` labels + `option_salt` (iff
  `public.options != false`), and every file whose `path` is in
  `public.entries` (the file bytes + its leaf `sha256`).
- Do **not** publish: `entries[]` itself (it names private files — a metadata
  leak), any file not in `public.entries`, the confidential body of the
  manifest, or `title` (unless the operator chooses to surface it as part of
  the public card).
- **Absent `public` ⇒ nothing published** (fully confidential, Juror-only —
  today's behaviour).

**Trust split:**

- **Jurors** receive the full package and verify everything trustlessly:
  `sha256(manifest) == evidence_hash` (root) and each leaf.
- **Public observers** receive the operator-derived public card (summary +
  options + salt + public files). Each public file is verifiable by its leaf
  `sha256`; the card's own authenticity rests on operator attestation —
  consistent with the operator's trusted delivery role (ADR-0006/0011).

---

## 7. Transport is unconstrained (the daemon's concern)

The format does not specify how the manifest + payloads are packaged,
compressed, encrypted, or delivered. That is the daemon's transport layer
(ADR-0011 / `SPEC.md`). Concretely, the format is indifferent to:

- **Container:** zip, tar, cbor, loose files, IPFS dir — any.
- **Compression:** none, gzip, zstd, brotli — any; per-file or whole-package.
- **Ordering / timestamps / encoding of the container:** irrelevant — they are
  not hashed.
- **Encryption / delivery:** the daemon re-encrypts to drawn Jurors per
  ADR-0011. Because the hash is the manifest (not the package), the daemon may
  deliver files **individually** (per-file Juror-bound encryption) + the
  manifest, rather than one monolithic re-encrypted blob — preferable for
  packages containing large binaries.

---

## 8. End-to-end flows

### Filer (author + file)

1. Assemble the package: the documents and binaries to be adjudicated.
2. Generate `option_salt` (32 random bytes); write the `options` labels.
3. Compute each file's `sha256`; build `entries[]`.
4. Decide visibility: add a `public` block (or omit for fully confidential).
5. Write `manifest.yaml` (schema `accord-evidence/v1`).
6. Compute `evidence_hash = sha256(utf8(manifest.yaml))`.
7. Compute `Dispute.options[i] = sha256(option_salt ‖ utf8(label_i))`.
8. `create_dispute(subaccord, options, evidence_hash, fee)` via CPI.
9. Submit the package (manifest + payloads) to the Subaccord's Evidence Operator
   per ADR-0011 (claimant→operator ingest encryption).

### Juror (verify + read)

1. After draw, pull the package from the operator (Juror-bound re-encryption,
   ADR-0011); decrypt.
2. `require sha256(manifest.yaml) == Dispute.evidence_hash` — else tampered.
3. For each `entry` in `manifest.entries`: `require sha256(file) ==
   entry.sha256` — else tampered/missing.
4. Reconstruct the option labels: for each `i`, verify
   `sha256(option_salt ‖ utf8(label_i)) == Dispute.options[i]`.
5. Read the evidence; commit `hash(vote, salt, juror_pubkey)` per the mechanism.

---

## 9. Versioning

`schema: accord-evidence/v1` is the dispatch key. A future format bumps the
version and branches at the operator (and, if needed, at a new on-chain field).
v1 is forward-compatible with additive optional fields; breaking changes
require a new schema version.

---

## 10. Open / future

- **On-chain option-hash enforcement** — see §4 open note + ADR-0013.
- **Per-Juror watermarking (v1.1)** — `policy.watermark` requests it; the
  daemon embeds the fingerprint inside the Juror-bound encryption (ADR-0011).
- **Multi-file per-Juror delivery** — the manifest-as-root model already
  enables per-file Juror-bound encryption; the daemon SPEC decides whether v1
  ships one-blob or per-file.
- **Public-card authenticity** — today operator-attested; a future ADR could
  anchor a public-manifest hash on-chain for trustless public verification
  (grows the on-chain surface — deferred per ADR-0006's "one hash" discipline).

---

## References

- ADR-0006 — evidence model (on-chain hash, trusted operator)
- ADR-0011 — evidence operator daemon (transport)
- ADR-0013 — this format's decision (manifest-as-Merkle-root, salted options)
- `CONTEXT.md` — Dispute, Evidence Operator, options
- `programs/accord/src/state.rs` — `Dispute.options`, `Dispute.evidence_hash`
- `apps/evidence-daemon/SPEC.md` — the daemon (transport) build spec
