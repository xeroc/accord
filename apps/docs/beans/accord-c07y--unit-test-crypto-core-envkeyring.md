---
# accord-c07y
title: Unit-test crypto core + EnvKeyring
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-djso
blocked_by:
    - accord-11im
    - accord-vknh
---

---

assigned: tester
---

tests/crypto.test.ts: Ed↔X25519 round-trips, ECIES enc→dec, AES-GCM/HKDF, gate accept/reject, EnvKeyring map correctness, property: only juror Ed25519 secret decrypts a delivered bundle.

See milestone accord-yjno HANDOFF §5 §6 for the shared contract (data types, crypto, edge cases, DoD).
