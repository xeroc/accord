# Evidence data format — `manifest.yaml` is the hashed Merkle root; salted option labels; packaging unconstrained

## Status

**Accepted.** The data whose hash is the on-chain `evidence_hash` is a single
self-describing `manifest.yaml` that references every file payload by `sha256`.
The manifest **is** the Merkle root over the package; option labels are salted
so the public on-chain option hashes cannot be brute-forced; and packaging,
compression, and delivery are entirely unconstrained by the format. Full
reference: [`apps/evidence-daemon/EVIDENCE-FORMAT.md`](../../../evidence-daemon/EVIDENCE-FORMAT.md).

Decision recorded 2026-08-05 from a design discussion of the evidence flow.

## Context

ADR-0006 set `evidence_hash` as the on-chain evidence commitment and ADR-0011
specified the operator daemon that re-encrypts the plaintext to drawn Jurors —
but **neither specified the plaintext's structure.** A working dispute flow
requires the hashed data to:

- carry **multiple documents and binary payloads** (images, video, PDFs, logs),
  not a single markdown file;
- be **compressible** as a whole;
- let the operator **publish a public subset** (notably the option-label
  decoding) while keeping the rest Juror-confidential;
- decode the on-chain `Dispute.options[i]` (stored as `[u8;32]` label hashes)
  into human-readable labels; and
- keep the on-chain surface at **one hash** (ADR-0006's discipline).

The open question this ADR closes: *what exactly is hashed, and how is it
structured?*

## Decision

### 1. Hash the manifest, not a container

```
evidence_hash = sha256( utf8( manifest.yaml ) )
```

The `manifest.yaml` references every file payload by its `sha256`, so it is the
Merkle root: hashing it covers all payloads transitively. The manifest is
delivered verbatim, so the Juror hashes identical bytes — **no canonicalization
rules are needed for the manifest or any container.** The on-chain surface
stays at exactly one hash (ADR-0006 unchanged).

### 2. `entries[]` is a pure content index; visibility lives only in `public`

`entries[]` lists every file as `{ path, sha256 }` — content-addressing only,
no visibility flag. File visibility is declared **once**, in `public.entries`
(the list of paths to publish). Absent `public` ⇒ fully confidential
(Juror-only, today's behaviour). This separates the bill of materials from the
publication policy and avoids duplicated visibility flags.

### 3. Option labels are salted

```
option_salt = random 32 bytes
Dispute.options[i] = sha256( option_salt ‖ utf8(label_i) )
```

`option_salt` is a per-dispute, filer-generated nonce stored **only in the
manifest** (covered by `evidence_hash`). It prevents brute-forcing the public
on-chain `options[i]` to recover short labels of confidential disputes. When a
dispute publishes its options (`public.options: true`), the operator publishes
the labels **and the salt** so any observer verifies against the chain.

### 4. File payloads are opaque; transport is unconstrained

The format mandates nothing about payload type (md/html/pdf/png/mp4/…) — each
is anchored solely by its leaf `sha256`. Packaging, compression, ordering, and
delivery are the daemon's transport concern (ADR-0011), not the format's.
Because the hash is the manifest, the daemon may deliver files individually
(per-file Juror-bound encryption) rather than one monolithic blob — preferable
for packages with large binaries.

Full field reference, filer/juror flows, and the integrity model live in
[`EVIDENCE-FORMAT.md`](../../../evidence-daemon/EVIDENCE-FORMAT.md).

## Considered Options

- **Hash a canonical container (deterministic ZIP/TAR of manifest + files).**
  Rejected. It couples the hash to container encoding, forcing determinism
  rules (sorted entries, `store` method, no timestamps, fixed headers) and
  couples compression to the hash. Hashing the manifest alone removes all of
  that: the container and its compression become free, independent transport
  choices.

- **Hash the manifest only (chosen).** The manifest references every file by
  `sha256`, so it is already a Merkle root over the package. Simplest root,
  zero canonicalization, on-chain surface unchanged, transport fully decoupled.

- **Unsalted option labels** (`options[i] = sha256(label)`). Rejected. On-chain
  `options[i]` is public; short labels (`"Yes"`, `"Refund"`) are rainbow-table-
  recoverable, leaking the choices of disputes that intended confidentiality.
  The per-dispatch salt closes this at no on-chain cost.

- **Per-entry `visibility` flag in `entries[]`.** Rejected — it duplicates the
  visibility already expressed by `public.entries`. Visibility lives once, in
  `public.entries`; `entries[]` stays a pure content index.

- **Frontmatter-on-a-primary-`evidence.md` with attachments.** Rejected for the
  multi-document case in favour of a standalone root `manifest.yaml` that
  indexes any number of opaque payloads. (Per-doc frontmatter remains allowed
  inside individual payload files; the root manifest is the authority.)

## Consequences

- **No on-chain change to the evidence hash.** `Dispute.evidence_hash` remains
  a single `[u8;32]`; it now commits to `sha256(manifest.yaml)` instead of an
  unspecified blob. ADR-0006's "one hash" discipline holds.

- **Operator gains a public-card capability.** From `public.*` + the public
  entries the operator derives and attests a public card (summary + decoded
  options + salt + public files). Jurors verify the full package trustlessly
  via `evidence_hash` + leaf hashes; public observers rely on operator
  attestation + per-file `sha256` — consistent with ADR-0006/0011's trusted
  delivery model.

- **Open program decision (deferred):** enforce
  `options[i] == sha256(option_salt ‖ label)` at `create_dispute` (cheap; closes
  a footgun; salt stays off-chain either way), or leave it a filer/operator
  convention. Tracked in `EVIDENCE-FORMAT.md` §4; resolves in a follow-up to the
  program SPEC, not this ADR.

- **Filer authors a manifest; Jurors verify root + leaves.** The filer flow
  (author → salt → leaf hashes → `evidence_hash` → `create_dispute`) and the
  Juror verification flow are specified in `EVIDENCE-FORMAT.md` §8.

- **Compression / storage fully decoupled.** zip/tar/loose/IPFS, any
  compression, any ordering — all hash-equivalent. Future watermarking (v1.1)
  and per-file Juror delivery fit cleanly inside the daemon without touching
  the format.

- **`apps/evidence-daemon/SPEC.md` should reference this format** as the shape
  of the plaintext it re-encrypts (a follow-up edit; this ADR does not rewrite
  the daemon SPEC).

## References

- ADR-0006 — evidence model (on-chain hash, trusted operator)
- ADR-0011 — evidence operator daemon (transport)
- [`apps/evidence-daemon/EVIDENCE-FORMAT.md`](../../../evidence-daemon/EVIDENCE-FORMAT.md) — full format reference (this ADR's implementation detail)
- `CONTEXT.md` — Dispute, Evidence Operator
- `programs/accord/src/state.rs` — `Dispute.options: [[u8;32]; MAX_OPTIONS]`,
  `Dispute.evidence_hash: [u8;32]`
