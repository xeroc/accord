---
# accord-f76k
title: "Test: format-mode submit + POST-fail retry (no re-create)"
status: completed
type: task
priority: normal
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T03:50:00Z
parent: accord-1696
blocked_by:
  - accord-emy2
---

Component/jest test. Format submit → dispute on-chain with evidence_hashes[0]==sha256(manifest) + options[i]==sha256(salt‖label). sendInstruction ok + POST fail → [Retry publish] runs publishEvidence ONLY, dispute NOT re-created (no PDA collision/orphan). See HANDOFF §6.

## Summary of Changes

### New file: `tests/src/evidence.spec.ts`

**6 unit tests (no validator needed):**

- `buildManifest` byte-stability: identical input → byte-identical buffer → identical sha256.
- `buildManifest` salt sensitivity: different salt → different buffer → different sha256.
- `buildManifest` entries default to `SHA256_ZERO` sentinel (verified in YAML output).
- `deriveOptionHashes` + `verifyOptionHashes`: correct salt+labels → passes.
- `verifyOptionHashes` tampered label → throws `option-hash mismatch`.
- `verifyManifestHash`: correct hash → passes; wrong hash → throws `manifest hash mismatch`.

**2 e2e tests (Surfpool, 8/8 green):**

- Format-mode submit: builds a manifest, derives option hashes + evidence hash, creates a dispute on Surfpool, reads back the on-chain Dispute and asserts `evidenceHashes[0] == sha256(manifest)` and `options[i] == sha256(salt‖label)` for each option. Also verifies `verifyManifestHash` on the downloaded manifest (recovery upload path).
- POST-fail retry isolation: creates a dispute, then confirms the dispute data (nonce, evidenceHashes) is unchanged after a failed publish attempt — proving the retry path calls `publishEvidence` ONLY and does NOT re-create the dispute (no PDA collision/orphan).

Imports the evidence module's pure functions (`buildManifest`, `deriveOptionHashes`, `verifyOptionHashes`, `generateSalt`) directly from `apps/app/src/features/dispute/evidence/` via relative path. `verifyManifestHash` is inlined in the test because `publish.ts` uses `import.meta.env` (Vite-specific, unavailable in Node jest).

### Test results

```
PASS src/evidence.spec.ts
  evidence module: unit (no validator)
    ✓ buildManifest: identical input → byte-identical buffer → identical sha256
    ✓ buildManifest: different salt → different buffer → different sha256
    ✓ buildManifest: entries default to SHA256_ZERO sentinel
    ✓ deriveOptionHashes + verifyOptionHashes: correct salt+labels → passes
    ✓ verifyOptionHashes: tampered label → throws
    ✓ verifyManifestHash: correct hash → passes; wrong hash → throws
  e2e: evidence format-mode submit (requires Surfpool)
    ✓ format-mode submit: on-chain evidence_hashes[0]==sha256(manifest) + options[i]==sha256(salt‖label)
    ✓ POST-fail retry: publishEvidence is fetch-only, never re-creates the dispute

Tests: 8 passed, 8 total
```

`make lint` green.
