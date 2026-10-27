---
# accord-xybg
title: "Review: evidence module — single-buffer invariant, isolation, no spine leakage"
status: completed
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T06:00:00Z
parent: accord-1d3i
blocked_by:
  - accord-72tz
  - accord-3mzc
---

Confirm evidence domain logic is fully isolated in features/dispute/evidence/; buildManifest serializes once; no logic leaked into CreateDispute/DisputeDetail. See HANDOFF §3/§5.

## Summary of Changes

### Review Results (all PASS)

1. **Isolation:** Zero evidence domain logic (buildManifest, deriveOptionHashes, verifyOptionHashes, generateSalt, publishEvidence, verifyManifestHash, claimantEncrypt, SHA256_ZERO) found outside `features/dispute/evidence/` in app source. Confirmed via grep across `apps/app/src/`.
2. **Single-buffer invariant:** `buildManifest` is the only serialization path — deterministic, byte-stable (proven by tests). `EvidenceEditor` calls it once per render for preview+download (same buffer). `publishEvidence` takes the manifest buffer as-is — zero re-serialization.
3. **No spine leakage:** `CreateDispute.tsx` and `DisputeDetail.tsx` are unchanged (no diff from pre-evidence-module HEAD). The evidence module is self-contained. Manual-hash mode preserved.
4. **Tests:** 14/14 node:test cases pass covering the full HANDOFF §6 unit-testable matrix.

### DoD Item Completed

- Edited `apps/evidence-daemon/EVIDENCE-FORMAT.md` §3.2: `entries[].path` now documents URL acceptance (MVP) alongside relative POSIX paths; `entries[].sha256` documents the all-zero sentinel (juror skips leaf verification, root gate still applies); added MVP entry note (v2: real leaf sha256 + multi-MIME blob transport).
