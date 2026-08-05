---
# accord-vknh
title: Implement crypto core
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-djso
blocked_by:
    - accord-qzca
---

---

assigned: implementer
---

src/keys/ed25519.ts (Ed25519↔X25519, X25519 ECDH) + src/crypto/{ecies,symmetric}.ts: ingest encryption, delivery re-encryption (AES-256-GCM, HKDF-SHA256), integrity gate sha256==evidence_hash. Plaintext in-memory only.

See milestone accord-yjno HANDOFF §4 §3 for the shared contract (data types, crypto, edge cases, DoD).
