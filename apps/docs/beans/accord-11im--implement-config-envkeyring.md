---
# accord-11im
title: Implement config + EnvKeyring
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

src/config.ts (env parsing) + src/keys/keyring.ts: EnvKeyring reads EVIDENCE_KEYRING comma-separated base58 secrets, derives pubkeys → Map<pubkey,sk>; forOperator(pubkey) resolves at runtime. Keyring trait abstracts future sources.

See milestone accord-yjno HANDOFF §2 §3 for the shared contract (data types, crypto, edge cases, DoD).
