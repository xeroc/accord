---
# accord-kq7v
title: "Review: format spec edit — consistent with code + ADR-0017"
status: completed
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T00:56:38Z
parent: accord-2nzr
blocked_by:
  - accord-q5yc
---

Cross-check the edited spec against the implemented entry shape (path=URL, all-zero sentinel) and ADR-0017 authority line. See HANDOFF §5.

## Summary of Changes

Review of the `accord-q5yc` spec edit (`apps/evidence-daemon/EVIDENCE-FORMAT.md`). Cross-checked the edited spec against (a) the milestone entry-shape contract and (b) ADR-0017's authority line. **Result: consistent, with one clarity fix applied.**

### Cross-check results

**1. Entry shape (path=URL, all-zero sentinel) — CONSISTENT.**

- §3.2 `entries[].path` accepts URL or relative POSIX path → matches HANDOFF "`path` accepts URL or relative POSIX path".
- §3.2 `entries[].sha256` allows the all-zero sentinel to skip leaf verification → matches HANDOFF "All-zero `sha256` ⇒ juror skips leaf verification".
- §2 "All-zero sentinel (leaf skip)" paragraph: root gate still covers the entry → matches HANDOFF "root gate still applies".
- §3.1 example + §8 juror-flow sentinel skip → consistent with the MVP entry `{ path: <url>, sha256: <all-zero sentinel> }`.

**2. ADR-0017 authority line — CONSISTENT.**

- ADR-0017 D1 (manifest-as-root, `evidence_hash = sha256(manifest.yaml)`, no canonicalization): spec §2 retains.
- ADR-0017 D2 (`entries[]` = `{path, sha256}` pure content index, no visibility flag): spec §3.2 retains the pair shape; path/sentinel are value relaxations, not shape changes, and add no visibility flag.
- ADR-0017 D3 (salted options): spec §4 retains.
- ADR-0017 D4 (opaque payloads, transport unconstrained): spec §5/§7 retains.
- Spec header authority line ("ADR-0017 (decision)...") is accurate; ADR-0017 explicitly delegates field-level detail to EVIDENCE-FORMAT.md, so the v1-subset relaxations live correctly in the spec, not the (immutable) ADR.

**3. One clarity fix applied.**
The §3.2 `entries[].path` row from `accord-q5yc` said "v1 implementation entries are URL-or-sentinel" — this conflated two orthogonal dimensions (path-type vs sha256-type) and could misread as "a v1 entry must be either a URL or a sentinel" (an entry is a `{path, sha256}` pair; both fields vary independently). Reworded to: both path forms are valid in v1 and v2; the v1 _transport_ typically pairs URL paths with the all-zero sentinel (no leaf bytes shipped), while v2 adds relative-path archive bundles with real leaves (§7.1). This aligns the row with §7.1, which already states the v1/v2 distinction correctly.

### Out-of-scope observation (no action — ADRs immutable)

ADR-0017 Consequences says "`Dispute.evidence_hash` remains a single `[u8;32]`", which ADR-0023 superseded to `evidence_hashes: [[u8;32]; MAX_APPEALS+1]`. This is a pre-existing ADR↔ADR relationship (ADR-0023 is the superseding authority; spec §9 already references it correctly), NOT introduced by the `accord-q5yc` edit, and ADRs are immutable-in-place per AGENTS.md. Not a finding against this review's scope (path/sentinel/authority-line consistency).

### Verification

Doc-only change (one table-row rewording). `make lint` is environment-broken in this worktree (`packages/canon` `node_modules` missing — `make prep` not run; `Cannot find module '@solana/kit'`), pre-existing and unrelated to a markdown edit. Pre-commit `markdownlint` validates the doc on commit.
