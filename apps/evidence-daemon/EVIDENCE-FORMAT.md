# Accord Evidence Format — v1

> **Status:** specified (not yet built). **Authority:** ADR-0017 (decision),
> ADR-0006 (evidence model), ADR-0011 (evidence operator daemon), ADR-0023
> (per-round evidence hashes — §9), `CONTEXT.md` (Evidence Operator). This file
> is the **format reference** for the data whose hash is the on-chain
> `evidence_hash` — i.e. everything a Juror needs to rule. The daemon build spec
> (`apps/evidence-daemon/SPEC.md`) is the _transport_ reference; this file is
> the _data_ reference. Code is authority on current state; this spec is
> authority on intent.

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

**All-zero sentinel (leaf skip).** An entry whose `sha256` is the all-zero
value `0000…0000` (64 zeros, i.e. `[u8;32]` zeros) is **not leaf-verified**:
the Juror skips check (2) for that entry. The root gate (1) still covers it —
the manifest bytes (sentinel included) hash into `evidence_hash`, so the entry
list stays integrity-bound. The sentinel is the v1 escape hatch for payloads
whose bytes the filer does not pre-hash: a URL the operator/Juror fetches
later, or a blob transported out-of-band (§7). A non-zero leaf is always
verified. (TODO v1.1: best-effort URL fetch + paste to fill a real leaf
instead of the sentinel — §11.)

---

## 3. `manifest.yaml` — schema

The manifest is a single YAML file at a fixed path (`manifest.yaml`) inside the
package. It is the **only structured artifact** the format mandates. File
payloads are opaque (see §5).

### 3.1 Annotated example

```yaml
schema: accord-evidence/v1
dispute: <base58 Dispute pubkey> # operator cross-checks == on-chain Dispute
subaccord: <base58>
filer: <base58>
filed_at: 2026-08-05T14:20:00Z
language: en
title: "Milestone 3 (auth module) — delivered or not?"
description: |
  The challenger claims this item is fraudulent. The submitter failed
  to deliver milestone 3 by the agreed deadline of 2026-07-30. See the
  evidence entries below for the timeline and spec comparison.

option_salt: 9f3c1a...e7b2 # 32-byte hex nonce — NON-PUBLIC (see §4)
options: # Dispute.options[i] = sha256(option_salt ‖ utf8(label))
  - { index: 0, label: "Not delivered" }
  - { index: 1, label: "Delivered as specified" }

public: # OMIT entirely ⇒ fully confidential (today's behaviour)
  summary: "Filer claims milestone 3 (auth module) was delivered per spec by 2026-07-30…"
  options: true # publish option labels + the salt (default true)
  entries: [timeline.md, spec.pdf] # entry paths to publish openly (see §6)

entries: # PURE index — every payload, path + sha256 only
  - { path: claim.md, sha256: "9a3f…e1" }
  - { path: response.md, sha256: "55c1…0b" }
  - { path: timeline.md, sha256: "3e7d…22" }
  - { path: spec.pdf, sha256: "c1b2…77" }
  - { path: screenshot.png, sha256: "aa09…5f" }
  - { path: deliverable.diff, sha256: "7d44…0a" }
  - { path: demo.mp4, sha256: "b8e1…39" }
  # path may be a URL; sha256 may be the all-zero sentinel → skip leaf verify (§2)
  - { path: "https://example.com/contract.pdf", sha256: "0000…00" }

policy:
  watermark: true # request per-Juror watermarking (daemon v1.1)
  retain_until: finalized
```

### 3.2 Field reference

| Field                             | Required | Description                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`                          | yes      | `accord-evidence/v1`. The operator dispatches on this; future versions branch here.                                                                                                                                                                                                                                                                                                    |
| `dispute` / `subaccord` / `filer` | yes      | Base58 pubkeys. Operator cross-checks `dispute`/`subaccord` against the on-chain `Dispute`; `filer` == `Dispute.filer`.                                                                                                                                                                                                                                                                |
| `filed_at`                        | yes      | ISO-8601 UTC. Human metadata; not load-bearing for the mechanism.                                                                                                                                                                                                                                                                                                                      |
| `language`                        | no       | BCP-47 tag (default `en`). Hint for operator/Juror UI rendering.                                                                                                                                                                                                                                                                                                                       |
| `title`                           | yes      | One-line human title of the dispute. Public only if listed under `public` (it is not auto-published).                                                                                                                                                                                                                                                                                  |
| `description`                     | no       | Optional markdown claim body (ADR-0017). Emitted as a YAML literal block scalar (`description: \|`) when present; omitted entirely when absent (backward-compatible). For Canon challenges, this IS the challenger's argument. Rendered sanitized (`react-markdown` + `remark-gfm`); committed manifest bytes are never altered — `sha256(manifest)` is over the raw YAML. |
| `option_salt`                     | yes      | 32-byte nonce, hex-encoded (64 chars). Per-dispute, random, generated by the filer. **Not on-chain.** See §4.                                                                                                                                                                                                                                                                          |
| `options`                         | yes      | Ordered list `{ index, label }`. `Dispute.options[i] = sha256(option_salt ‖ utf8(label_i))`. Decodes the on-chain option hashes.                                                                                                                                                                                                                                                       |
| `public`                          | no       | The publication policy block. **Absent ⇒ fully confidential** (nothing published; Juror-only). See §6.                                                                                                                                                                                                                                                                                 |
| `public.summary`                  | no       | Neutral one-paragraph framing, publishable.                                                                                                                                                                                                                                                                                                                                            |
| `public.options`                  | no       | Bool, default `true` when `public` is present. Publish the option labels **and the salt** so any observer can verify against the chain.                                                                                                                                                                                                                                                |
| `public.entries`                  | no       | List of `entries[].path` values to publish openly. **This is the single source of file visibility** — `entries[]` carries no visibility field.                                                                                                                                                                                                                                         |
| `entries`                         | yes      | The complete bill of materials. One row per delivered file: `{ path, sha256 }`. The manifest is **not** listed here (it would be a self-hash paradox; it is anchored directly by `evidence_hash`).                                                                                                                                                                                     |
| `entries[].path`                  | yes      | A URL (any scheme the operator/Juror can fetch) **or** a relative POSIX path, UTF-8. Relative paths: no leading `/`, no `..`, no backslash, unique within the package. Both forms are valid in v1 and v2; the v1 transport typically pairs URL paths with the all-zero `sha256` sentinel (no leaf bytes shipped), while v2 adds relative-path archive bundles with real leaves (§7.1). |
| `entries[].sha256`                | yes      | Lowercase hex (64 chars) of the file's bytes, **or** the all-zero sentinel `0000…0000` (64 zeros) to skip leaf verification — root gate still covers the entry (§2).                                                                                                                                                                                                                   |
| `policy`                          | no       | Operator hints (non-binding on the mechanism): `watermark`, `retain_until`, etc.                                                                                                                                                                                                                                                                                                       |

---

## 4. Option labels are salted

On-chain `Dispute.options[i]` is a `[u8; 32]` and therefore **public**. If it
were an unsalted hash of a short label (`"Yes"`, `"Refund"`), anyone could
rainbow-table the chain to recover the choices of a dispute that intended to
keep them confidential. The salt closes that leak.

> **Aggregation-governed (ADR-0019).** This option encoding is
> **plurality-shaped**: an ordered list of labels, one of which a Juror selects.
> It matches the v1 `Aggregation::Plurality` variant on the `Subaccord`.
> Non-Plurality variants — `RankedChoice` (IRV; a Juror commits a permutation)
> and `Median` (numeric outcomes) — will require an extended option/ballot
> encoding and a future `accord-evidence/v2` schema. They are out-of-scope v1
> (parked, bean `accord-ayqq`); `accord-evidence/v1` is plurality-only.

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

> **Open (ADR-0017):** whether the program _enforces_ > `options[i] == sha256(option_salt ‖ label)` at `create_dispute`, or leaves it
> a filer/operator convention. Enforcing is cheap and closes a footgun; the
> salt is not on-chain either way (enforcement would hash a supplied
> `label` + a salt byte-array argument, not store them).

---

## 5. File payloads are opaque

The format mandates **nothing** about payload content, encoding, or type.
Markdown, HTML, PDF, PNG, MP4, plain text, diffs — all are equal. The spec does
not parse, validate, or limit them.

- A payload's integrity is its `sha256` leaf in `entries[]` — nothing else.
- The operator **may** parse a _public_ payload for nicer rendering (e.g.
  render `*.md` to HTML in the public card) — purely its choice, not required.
- The `docs/` vs `assets/` distinction is **not** prescribed; paths are the
  filer's. (Conventional layout — `docs/*.md`, `assets/*` — is recommended for
  human readability but not enforced.)

---

## 6. Visibility — declared once, in `public`

> **v1 implementation: fully-confidential-only.** The `public` block is
> specified here as intent but is **not implemented in v1** — the dApp MVP
> omits `public`, so every v1 dispute ships Juror-only (TODO, §11). The
> publication rules below describe what a future build will do.

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

### 7.1 v1 vs v2 transport (TODO — multi-MIME blob transport, HANDOFF §7)

The format above is the full intent. The **v1 implementation is a subset**:

- **v1 (shipped):** manifest-only. Entries carry a `path` (URL or relative)
  and either a real `sha256` leaf or the all-zero sentinel. The daemon stores
  one encrypted manifest bundle keyed `(subaccord, dispute, round)`; no
  archive of file payloads is transported — URLs are fetched by the
  operator/Juror out-of-band, sentinel entries skip leaf verification (§2).
- **v2 (deferred — "daemon path A"):** the full multi-MIME archive-bundle
  model. Store key `(subaccord, dispute, round, path)`, per-file re-encrypt to
  each Juror, **real leaf gates** on every entry (sentinel unused), and an
  archive-bundle upload path. The relative-POSIX-path + real-`sha256` package
  described in §1–6 is the v2 target. Tracked as TODO in §11.

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
3. For each `entry` in `manifest.entries`: if `entry.sha256` is the all-zero
   sentinel, skip leaf verification (URL/out-of-band payload, §2); else
   `require sha256(file) == entry.sha256` — else tampered/missing.
4. Reconstruct the option labels: for each `i`, verify
   `sha256(option_salt ‖ utf8(label_i)) == Dispute.options[i]`.
5. Read the evidence; commit `hash(vote, salt, juror_pubkey)` per the mechanism.

---

## 9. Per-round evidence (evidence-on-appeal)

Round-0 evidence is one-sided: the filer's claim plus structural context.
Counter-evidence naturally arrives when someone appeals — a round-1 juror
should see the filer's package **and** the appellant's rebuttal. The format
extends to this by composing the single-package model of §1–8 across rounds:
**one manifest per round, each with its own `evidence_hash`.** This section is
the data-format half of per-round evidence; the on-chain array and the daemon
delivery loop are ADR-0023 (in flight, milestone `accord-qp7c`).

> **Implementation status.** This section is gated on ADR-0023's on-chain
> `Dispute.evidence_hashes` array. Until that lands, `Dispute.evidence_hash`
> is a single `[u8;32]` and only round-0 evidence exists — §1–8 are the
> complete format. The composition below describes what ADR-0023 enables.

### 9.1 One manifest per round

Each round that introduces new evidence files its own `manifest.yaml` (schema
`accord-evidence/v1`, §3). The round-0 manifest is the filer's package; a
round-N manifest is the appellant's rebuttal package. Every manifest is an
independent Merkle root (§2): the per-round `evidence_hash` is
`sha256(utf8(that round's manifest.yaml))`, verified exactly as in §2.

```
round 0 (filer):   manifest_0.yaml → evidence_hashes[0] = sha256(manifest_0.yaml)
round 1 (appeal):  manifest_1.yaml → evidence_hashes[1] = sha256(manifest_1.yaml)
round 2 (appeal):  manifest_2.yaml → evidence_hashes[2] = sha256(manifest_2.yaml)
round 3 (appeal):  manifest_3.yaml → evidence_hashes[3] = sha256(manifest_3.yaml)
```

Each manifest is self-contained: it lists **its own** `entries[]` (the files
introduced that round) and carries its own `public` publication policy. A round
that adds a single rebuttal PDF ships a one-entry manifest; a round that adds
nothing ships no manifest at all (§9.3).

### 9.2 The on-chain array (ADR-0023)

```rust
// programs/accord/src/state.rs — ADR-0023 (milestone accord-qp7c)
pub evidence_hashes: [[u8; 32]; MAX_APPEALS + 1]   // MAX_APPEALS = 3 → 4 slots
```

- `evidence_hashes[0]` is written by `create_dispute` (the filer's hash).
- `evidence_hashes[round + 1]` is written by `appeal(new_evidence_hash)`.
- `[0u8; 32]` at a slot is the **sentinel**: "no new evidence this round" —
  jurors reuse the prior rounds' manifests (§9.3).
- `get_ruling` is unaffected (it reads `final_ruling`, not evidence), so
  Arbitrables that consume only round-0 evidence keep working unchanged.

### 9.3 Sentinel = reuse prior evidence

A round need not introduce new evidence. An appeal may carry
`new_evidence_hash = [0u8; 32]`, meaning "this round reuses the accumulated
evidence from rounds 0..N." The daemon treats a zero slot as "no new package"
and delivers only the non-zero manifests up to that round. Cost escalation
(more jurors per round, ADR-0019) is the natural abuse limiter — there is no
per-hash fee and no on-chain quota beyond the fixed array size.

### 9.4 Delivery — accumulated, per-hash

A juror drawn in round N receives **every non-zero manifest from round 0
through round N**, each as an independent package verified under its own
`evidence_hashes[k]`. The daemon (ADR-0011) iterates the on-chain array and
delivers one re-encrypted package per non-zero hash; it does **not** concatenate
manifests — separate packages match the per-hash integrity gate of §2 and keep
each round's `public` policy independent. Delivery order is round-ascending so
the juror reads claim → rebuttal in sequence.

```
// daemon delivery loop (per drawn juror in round N) — ADR-0023 / SPEC.md
for k in 0..=N {
    let h = dispute.evidence_hashes[k];
    if h != [0u8; 32] {
        deliver_reencrypted(juror, round=k, manifest_k);   // own integrity gate
    }
}
```

The juror verifies each delivered package independently:
`sha256(manifest_k.yaml) == evidence_hashes[k]` plus each leaf in
`manifest_k.entries[]`. A tampered package fails its own gate without affecting
the others.

---

## 10. Versioning

`schema: accord-evidence/v1` is the dispatch key. A future format bumps the
version and branches at the operator (and, if needed, at a new on-chain field).
v1 is forward-compatible with additive optional fields; breaking changes
require a new schema version.

---

## 11. Open / future

> The items below are the HANDOFF §7 deferrals from the Evidence-UI integration
> milestone (`accord-ebel`). Each is recorded as a TODO so the spec tracks what
> v1 ships vs what is parked.

- **Multi-MIME blob transport / relative-path archive bundles (v2)** — daemon
  "path A": store key `(subaccord, dispute, round, path)`, per-file re-encrypt,
  real leaf gates on every entry, archive-bundle upload. The full
  relative-POSIX-path + real-`sha256` package of §1–6 is the v2 target; v1
  ships manifest-only with URL/sentinel entries (§7.1).
- **Best-effort URL fetch + paste** — an alternative to the all-zero sentinel:
  the filer pastes a URL, the app fetches and hashes it, and a real leaf fills
  `entries[].sha256`. Post-MVP; until then the sentinel covers URL entries (§2).
- **Daemon `HEAD /evidence/{subaccord}/{dispute}/{round}`** — lets the detail
  page auto-detect that evidence is unpublished (Tier-3) instead of an
  always-on "Publish evidence" affordance. Deferred.
- **`public` block (publication controls)** — v1 ships fully-confidential-only
  (Juror-only). The `public` block is specified (§6) but unimplemented; a
  future build wires operator publication of summary/options/public-files.
- **On-chain option-hash enforcement** — see §4 open note + ADR-0017.
- **Aggregation-variant option encoding (ADR-0019)** — v1 ships `Plurality`
  only, so the manifest's option list (§4) is plurality-shaped. `RankedChoice`
  (IRV) and `Median` variants will extend the option + ballot encoding under a
  `v2` schema; no change to `accord-evidence/v1`.
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
- ADR-0017 — this format's decision (manifest-as-Merkle-root, salted options)
- ADR-0023 — per-round evidence hashes (on-chain `evidence_hashes` array, §9)
- `CONTEXT.md` — Dispute, Evidence Operator, options
- `programs/accord/src/state.rs` — `Dispute.options`, `Dispute.evidence_hash`
- `apps/evidence-daemon/SPEC.md` — the daemon (transport) build spec
