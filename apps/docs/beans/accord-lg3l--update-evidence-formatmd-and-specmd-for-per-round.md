---
# accord-lg3l
title: Update EVIDENCE-FORMAT.md and SPEC.md for per-round evidence
status: completed
type: task
priority: high
tags:
  - implementer
created_at: 2026-08-09T16:56:37Z
updated_at: 2026-08-09T17:23:24Z
parent: accord-w9sg
---

See milestone accord-qp7c HANDOFF. EVIDENCE-FORMAT.md: document multi-manifest packages (one manifest per round, each with own evidence_hash). SPEC.md: update delivery model. Cross-ref ADR-0023.

## Summary of Changes

Documented the per-round evidence-on-appeal model across both evidence-daemon
spec docs. Scope is docs-only (intent specs); the on-chain array is ADR-0023
(sibling `accord-6hg5`), the program field change is `accord-pwa9`/`accord-hoaj`,
and the delivery-handler code is sibling `accord-xq40`.

**`apps/evidence-daemon/EVIDENCE-FORMAT.md`**

- New §9 "Per-round evidence (evidence-on-appeal)": one manifest per round, each
  an independent Merkle root with its own `evidence_hash`; the on-chain
  `evidence_hashes[[u8;32]; MAX_APPEALS+1]` array (ADR-0023); `[0u8;32]` sentinel
  = reuse prior rounds; daemon delivery loop iterates non-zero hashes, one
  re-encrypted package per round (not concatenated); per-hash independent
  integrity gates; `get_ruling` unaffected.
- Renumbered Versioning → §10, Open/future → §11.
- Authority header + References cross-reference ADR-0023.

**`apps/evidence-daemon/SPEC.md` (daemon — delivery model)**

- New "Per-round delivery (ADR-0023)" subsection under Crypto model: the
  `evidence_hashes[0..=N]` delivery loop with sentinel skip, per-round integrity
  gates, separate packages, round-ascending order, and backward-compat (loop
  degenerates to today's single-hash flow until the on-chain array lands).
- `EvidenceBundle` gains a `round` field; idempotency key → `(round, plaintext_hash)`.
- `EvidenceStore` trait + S3 object key → keyed by `(subaccord, dispute, round)`.
- HTTP API: POST accepts `/{round}` (defaults 0); GET returns a `rounds[]` array.
- On-chain interface table + delivery preconditions + References updated.

**Docs-match-reality.** Round-0 docs (§1–8 of the format; the base ingest/deliver
crypto flow of the SPEC) are left describing today's single-`evidence_hash` code
— that is accurate now. The per-round extension is clearly labelled as gated on
ADR-0023 (in flight), so neither doc states the array is live. ADR-0023 is
referenced by number only (no markdown link), since the file is authored in
parallel by `accord-6hg5`.

Verified: section numbering coherent, no stale §-refs, no broken intra-repo
links. No code/lint step applies (markdown intent specs).
