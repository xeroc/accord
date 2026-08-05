---
# accord-1acp
title: Per-juror watermarking in re-encryption pipeline (v1.1)
status: draft
type: task
priority: normal
created_at: 2026-08-05T14:21:20Z
updated_at: 2026-08-05T18:17:55Z
parent: accord-yjno
blocked_by:
    - accord-yjno
---

Implement the Watermark trait (no-op pass-through in v1). The daemon embeds a per-juror fingerprint into the plaintext BEFORE re-encrypting to the juror pubkey, so leak attribution points at the juror key that decrypted it. NO program change required: evidence_hash stays the only on-chain evidence field; the watermark scheme is pinned by the Subaccord's immutable evidence_spec hash (state.rs:37) so all operators of a subaccord use one scheme. Format-specific impls (stego for media, structural fingerprint for documents) land per evidence type. See ADR-0011 + packages/evidence-daemon/SPEC.md crypto model step 3.
