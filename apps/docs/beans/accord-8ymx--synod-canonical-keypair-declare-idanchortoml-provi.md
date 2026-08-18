---
# accord-8ymx
title: Synod canonical keypair + declare_id/Anchor.toml provisioning
status: todo
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T05:28:20Z
parent: accord-l2ad
---

assigned: implementer
Generate the canonical synod keypair under multisig control (same drill as accord/canon — AGENTS.md Gotchas), update declare_id! in programs/synod/src/lib.rs and Anchor.toml [programs.localnet] from the scaffold placeholder 5o5VDoAZ…, remove the placeholder ponytail comment. Do NOT run anchor keys sync. Verify: anchor build --ignore-keys succeeds and the IDL carries the canonical ID. See milestone accord-oylq HANDOFF §3 (canonical keypair BEFORE first build).
