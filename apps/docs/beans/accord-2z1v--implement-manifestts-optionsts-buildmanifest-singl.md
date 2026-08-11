---
# accord-2z1v
title: Implement manifest.ts + options.ts (buildManifest single-buffer, SHA256_ZERO, generateSalt, deriveOptionHashes, verifyOptionHashes)
status: todo
type: task
created_at: 2026-08-11T00:56:37Z
updated_at: 2026-08-11T00:56:37Z
parent: accord-1d3i
---

Pure logic module. See milestone HANDOFF §2/§4. buildManifest serializes ONCE into one Uint8Array (single-buffer invariant, §3). deriveOptionHashes = sha256(salt ‖ utf8(label)); verifyOptionHashes throws on mismatch (self-verify, D2).
