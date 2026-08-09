---
# accord-6hg5
title: Write ADR-0023 + update integration docs
status: completed
type: task
priority: high
tags:
  - implementer
created_at: 2026-08-09T16:56:44Z
updated_at: 2026-08-09T17:40:00Z
parent: accord-eifr
---

See milestone accord-qp7c HANDOFF. ADR-0023: per-round evidence hashes (decision, considered options, consequences). Update: arbitrable-interface.md, disputes.md, appeals.md, CONTEXT.md glossary, state-machine.md.

## Summary of Changes

Docs-only bean. No code/SDK/tests touched (those are sibling beans
`accord-pwa9` code, `accord-v84s` SDK, `accord-xq40`/`accord-lg3l` daemon,
`accord-azyd` tests).

- **NEW `apps/docs/adr/accord/0023-per-round-evidence-hashes.md`** — ADR-0023.
  Decision: `Dispute.evidence_hash` → `evidence_hashes: [[u8;32]; MAX_APPEALS+1]`
  (4 slots, 96-byte growth, fixed-size, no migration). `create_dispute` writes
  `[0]`; `appeal` gains `new_evidence_hash` (sentinel `[0u8;32]` = reuse prior);
  daemon delivers cumulative non-zero `evidence_hashes[0..=round]`. Considered
  options (array vs Vec vs per-round PDA; required vs sentinel; indexing) +
  consequences (layout-coupling, breaking rename, ADR-0006/0017 amendment).
- **`apps/docs/adr/accord/index.md`** — row 0023, supersession-map note
  (amends 0006/0017), next-number bump → 0024.
- **`apps/docs/docs/integration/disputes.md`** — `evidence_hash` arg note: stored
  at `evidence_hashes[0]`, appeals may add per-round hashes.
- **`apps/docs/docs/integration/appeals.md`** — `appeal(ctx, new_evidence_hash)`
  signature, sentinel semantics, cumulative delivery; Rust + TS examples updated.
- **`apps/docs/docs/integration/arbitrable-interface.md`** — round-0 commitment
  note + appeal evidence channel cross-ref.
- **`apps/docs/docs/reference/state-machine.md`** — appeal transition writes the
  new round's evidence slot; per-round evidence footer note.
- **`CONTEXT.md`** — Dispute + Appeal glossary terms: per-round evidence
  commitment / `new_evidence_hash` on appeal.

ADR-0023 references use the existing repo-relative `../adr/NNNN-…` link
convention (matches every existing ADR cross-link in these files). Verified:
all 0023 references resolve to `0023-per-round-evidence-hashes.md`; the
state-machine mermaid diagram and all edited table rows are well-formed.
