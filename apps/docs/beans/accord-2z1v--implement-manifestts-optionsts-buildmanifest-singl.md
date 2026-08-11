---
# accord-2z1v
title: Implement manifest.ts + options.ts (buildManifest single-buffer, SHA256_ZERO, generateSalt, deriveOptionHashes, verifyOptionHashes)
status: completed
type: task
created_at: 2026-08-11T00:56:37Z
updated_at: 2026-08-11T05:15:00Z
parent: accord-1d3i
---

Pure logic module. See milestone HANDOFF §2/§4. buildManifest serializes ONCE into one Uint8Array (single-buffer invariant, §3). deriveOptionHashes = sha256(salt ‖ utf8(label)); verifyOptionHashes throws on mismatch (self-verify, D2).

## Summary of Changes

- `apps/app/src/features/dispute/evidence/options.ts` — `generateSalt()` (Web Crypto `getRandomValues(32)`), `deriveOptionHashes(salt, labels)` (async, `sha256(salt ‖ utf8(label))` via `crypto.subtle.digest`, validates 32-byte salt), `verifyOptionHashes(salt, labels, hashes)` (async, throws on mismatch — self-verify D2).
- `apps/app/src/features/dispute/evidence/manifest.ts` — `buildManifest(input, ctx): Uint8Array` (deterministic fixed-shape YAML serializer, single buffer — no re-serialization), `SHA256_ZERO` sentinel, `ManifestInput`/`ManifestCtx`/`ManifestEntry` types. No YAML dep: hand-written serializer for the pinned `accord-evidence/v1` plurality shape.
- `apps/app/src/features/dispute/evidence/index.ts` — barrel re-export.
- Zero new dependencies. Uses stdlib Web Crypto API (matching `voting.ts:commitHash` pattern). `pnpm -r run build` + app typecheck green.
